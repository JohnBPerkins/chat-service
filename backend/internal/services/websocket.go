package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/pkg/nats"
	natsgo "github.com/nats-io/nats.go"
	"nhooyr.io/websocket"
)

type WebSocketHub struct {
	messageService *MessageService
	natsConn       *nats.NATSConnection
	clients        map[string]*Client
	clientsMu      sync.RWMutex
	subscriptions  map[string]*ConversationSubscription
	subsMu         sync.RWMutex
}

type Client struct {
	ID             string
	UserID         string
	Conn           *websocket.Conn
	Send           chan *models.WSFrame
	Hub            *WebSocketHub
	subscriptions  map[string]bool
	subscriptionsMu sync.RWMutex
}

type ConversationSubscription struct {
	ConversationID string
	Clients        map[string]*Client
	ClientsMu      sync.RWMutex
	NATSSub        *natsgo.Subscription
	TypingSub      *natsgo.Subscription
	PresenceSub    *natsgo.Subscription
}

func NewWebSocketHub(messageService *MessageService, natsConn *nats.NATSConnection) *WebSocketHub {
	return &WebSocketHub{
		messageService: messageService,
		natsConn:       natsConn,
		clients:        make(map[string]*Client),
		subscriptions:  make(map[string]*ConversationSubscription),
	}
}

func (h *WebSocketHub) HandleWebSocket(w http.ResponseWriter, r *http.Request, userID string) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"}, // Configure properly for production
	})
	if err != nil {
		log.Printf("Failed to accept websocket connection: %v", err)
		return
	}

	clientID := fmt.Sprintf("%s-%d", userID, time.Now().UnixNano())
	client := &Client{
		ID:            clientID,
		UserID:        userID,
		Conn:          conn,
		Send:          make(chan *models.WSFrame, 256),
		Hub:           h,
		subscriptions: make(map[string]bool),
	}

	h.clientsMu.Lock()
	h.clients[clientID] = client
	h.clientsMu.Unlock()

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.unregisterClient(c)
		c.Conn.Close(websocket.StatusInternalError, "")
	}()

	ctx := context.Background()
	for {
		_, messageBytes, err := c.Conn.Read(ctx)
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			break
		}

		var frame models.WSFrame
		if err := json.Unmarshal(messageBytes, &frame); err != nil {
			log.Printf("Failed to unmarshal frame: %v", err)
			continue
		}

		c.handleFrame(&frame)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer ticker.Stop()

	ctx := context.Background()
	for {
		select {
		case frame, ok := <-c.Send:
			if !ok {
				c.Conn.Close(websocket.StatusNormalClosure, "")
				return
			}

			frameBytes, err := json.Marshal(frame)
			if err != nil {
				log.Printf("Failed to marshal frame: %v", err)
				continue
			}

			if err := c.Conn.Write(ctx, websocket.MessageText, frameBytes); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}

		case <-ticker.C:
			if err := c.Conn.Ping(ctx); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleFrame(frame *models.WSFrame) {
	ctx := context.Background()

	switch frame.Type {
	case "subscribe":
		var data models.WSSubscribeData
		if err := json.Unmarshal(frame.Data.([]byte), &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid subscribe data")
			return
		}
		c.Hub.subscribeClient(c, data.ConversationID)

	case "unsubscribe":
		var data models.WSUnsubscribeData
		if err := json.Unmarshal(frame.Data.([]byte), &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid unsubscribe data")
			return
		}
		c.Hub.unsubscribeClient(c, data.ConversationID)

	case "message.send":
		var data models.WSMessageSendData
		dataBytes, _ := json.Marshal(frame.Data)
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid message data")
			return
		}

		req := &models.SendMessageRequest{
			ConversationID: data.ConversationID,
			ClientMsgID:    data.ClientMsgID,
			Body:           data.Body,
		}

		message, err := c.Hub.messageService.SendMessage(ctx, req, c.UserID)
		if err != nil {
			c.sendError("SEND_FAILED", fmt.Sprintf("Failed to send message: %v", err))
			return
		}

		// Send acknowledgment
		ackData := &models.WSMessageAckData{
			ClientMsgID: data.ClientMsgID,
			ID:          message.ID,
			CreatedAt:   message.CreatedAt,
		}
		c.sendFrame("message.ack", ackData)

	case "typing.update":
		var data models.WSTypingUpdateData
		dataBytes, _ := json.Marshal(frame.Data)
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid typing data")
			return
		}

		err := c.Hub.messageService.PublishTypingIndicator(data.ConversationID, c.UserID, data.IsTyping)
		if err != nil {
			log.Printf("Failed to publish typing indicator: %v", err)
		}

	case "receipt.read":
		var data models.WSReceiptReadData
		dataBytes, _ := json.Marshal(frame.Data)
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid receipt data")
			return
		}

		err := c.Hub.messageService.MarkMessageAsRead(ctx, data.ConversationID, c.UserID, data.MessageID)
		if err != nil {
			log.Printf("Failed to mark message as read: %v", err)
		}
	}
}

func (c *Client) sendFrame(frameType string, data interface{}) {
	frame := &models.WSFrame{
		Type: frameType,
		TS:   time.Now().UnixMilli(),
		Data: data,
	}

	select {
	case c.Send <- frame:
	default:
		close(c.Send)
	}
}

func (c *Client) sendError(code, message string) {
	errorData := &models.WSErrorData{
		Code:    code,
		Message: message,
	}
	c.sendFrame("error", errorData)
}

func (h *WebSocketHub) unregisterClient(client *Client) {
	h.clientsMu.Lock()
	delete(h.clients, client.ID)
	h.clientsMu.Unlock()

	// Unsubscribe from all conversations
	client.subscriptionsMu.RLock()
	subscriptions := make([]string, 0, len(client.subscriptions))
	for convID := range client.subscriptions {
		subscriptions = append(subscriptions, convID)
	}
	client.subscriptionsMu.RUnlock()

	for _, convID := range subscriptions {
		h.unsubscribeClient(client, convID)
	}

	close(client.Send)
}

func (h *WebSocketHub) subscribeClient(client *Client, conversationID string) {
	h.subsMu.Lock()
	defer h.subsMu.Unlock()

	sub, exists := h.subscriptions[conversationID]
	if !exists {
		sub = &ConversationSubscription{
			ConversationID: conversationID,
			Clients:        make(map[string]*Client),
		}

		// Subscribe to NATS subjects
		h.setupNATSSubscriptions(sub)
		h.subscriptions[conversationID] = sub
	}

	sub.ClientsMu.Lock()
	sub.Clients[client.ID] = client
	sub.ClientsMu.Unlock()

	client.subscriptionsMu.Lock()
	client.subscriptions[conversationID] = true
	client.subscriptionsMu.Unlock()
}

func (h *WebSocketHub) unsubscribeClient(client *Client, conversationID string) {
	h.subsMu.Lock()
	defer h.subsMu.Unlock()

	sub, exists := h.subscriptions[conversationID]
	if !exists {
		return
	}

	sub.ClientsMu.Lock()
	delete(sub.Clients, client.ID)
	clientCount := len(sub.Clients)
	sub.ClientsMu.Unlock()

	client.subscriptionsMu.Lock()
	delete(client.subscriptions, conversationID)
	client.subscriptionsMu.Unlock()

	// If no more clients, cleanup NATS subscriptions
	if clientCount == 0 {
		if sub.NATSSub != nil {
			sub.NATSSub.Unsubscribe()
		}
		if sub.TypingSub != nil {
			sub.TypingSub.Unsubscribe()
		}
		if sub.PresenceSub != nil {
			sub.PresenceSub.Unsubscribe()
		}
		delete(h.subscriptions, conversationID)
	}
}

func (h *WebSocketHub) setupNATSSubscriptions(sub *ConversationSubscription) {
	// Subscribe to messages (JetStream)
	messageSubject := fmt.Sprintf("chat.conv.%s.msg", sub.ConversationID)
	natsSub, err := h.natsConn.Conn.Subscribe(messageSubject, func(msg *natsgo.Msg) {
		var messageData models.WSMessageNewData
		if err := json.Unmarshal(msg.Data, &messageData); err != nil {
			log.Printf("Failed to unmarshal message data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "message.new",
			TS:   time.Now().UnixMilli(),
			Data: messageData,
		}

		h.broadcastToSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to messages: %v", err)
	}
	sub.NATSSub = natsSub

	// Subscribe to typing indicators
	typingSubject := fmt.Sprintf("chat.conv.%s.typing", sub.ConversationID)
	typingSub, err := h.natsConn.Conn.Subscribe(typingSubject, func(msg *natsgo.Msg) {
		var typingData models.WSTypingUpdateEventData
		if err := json.Unmarshal(msg.Data, &typingData); err != nil {
			log.Printf("Failed to unmarshal typing data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "typing.update",
			TS:   time.Now().UnixMilli(),
			Data: typingData,
		}

		h.broadcastToSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to typing: %v", err)
	}
	sub.TypingSub = typingSub

	// Subscribe to presence/receipts
	presenceSubject := fmt.Sprintf("chat.conv.%s.presence", sub.ConversationID)
	presenceSub, err := h.natsConn.Conn.Subscribe(presenceSubject, func(msg *natsgo.Msg) {
		var receiptData models.WSReceiptUpdateData
		if err := json.Unmarshal(msg.Data, &receiptData); err != nil {
			log.Printf("Failed to unmarshal receipt data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "receipt.update",
			TS:   time.Now().UnixMilli(),
			Data: receiptData,
		}

		h.broadcastToSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to presence: %v", err)
	}
	sub.PresenceSub = presenceSub
}

func (h *WebSocketHub) broadcastToSubscription(sub *ConversationSubscription, frame *models.WSFrame) {
	sub.ClientsMu.RLock()
	defer sub.ClientsMu.RUnlock()

	for _, client := range sub.Clients {
		select {
		case client.Send <- frame:
		default:
			close(client.Send)
			delete(sub.Clients, client.ID)
		}
	}
}