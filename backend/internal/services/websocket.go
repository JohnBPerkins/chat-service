package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/pkg/nats"
	natsgo "github.com/nats-io/nats.go"
	"nhooyr.io/websocket"
)

type WebSocketHub struct {
	messageService *MessageService
	friendService  *FriendService
	natsConn       *nats.NATSConnection
	clients        map[string]*Client
	clientsMu      sync.RWMutex
	subscriptions  map[string]*ConversationSubscription
	subsMu         sync.RWMutex
	userSubscriptions map[string]*UserSubscription
	userSubsMu        sync.RWMutex
}

type UserSubscription struct {
	UserID                 string
	Clients                map[string]*Client
	ClientsMu              sync.RWMutex
	FriendRequestSub       *natsgo.Subscription
	FriendAcceptedSub      *natsgo.Subscription
	FriendRejectedSub      *natsgo.Subscription
	FriendRemovedSub       *natsgo.Subscription
	ConversationAddedSub   *natsgo.Subscription
	ConversationRemovedSub *natsgo.Subscription
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
	ConversationID      string
	Clients             map[string]*Client
	ClientsMu           sync.RWMutex
	NATSSub             *natsgo.Subscription
	TypingSub           *natsgo.Subscription
	PresenceSub         *natsgo.Subscription
	ParticipantSub      *natsgo.Subscription
	ConversationSub     *natsgo.Subscription
}

func NewWebSocketHub(messageService *MessageService, friendService *FriendService, natsConn *nats.NATSConnection) *WebSocketHub {
	return &WebSocketHub{
		messageService:    messageService,
		friendService:     friendService,
		natsConn:          natsConn,
		clients:           make(map[string]*Client),
		subscriptions:     make(map[string]*ConversationSubscription),
		userSubscriptions: make(map[string]*UserSubscription),
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
		Send:          make(chan *models.WSFrame, 1024),
		Hub:           h,
		subscriptions: make(map[string]bool),
	}

	h.clientsMu.Lock()
	h.clients[clientID] = client
	h.clientsMu.Unlock()

	// Subscribe to user-level events (friend requests, etc.)
	h.subscribeUserEvents(client, userID)

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
			// Only log unexpected disconnections (not normal client closures)
			if !isExpectedDisconnection(err) {
				log.Printf("WebSocket read error: %v", err)
			}
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
		dataBytes, err := json.Marshal(frame.Data)
		if err != nil {
			c.sendError("INVALID_DATA", "Invalid subscribe data format")
			return
		}
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid subscribe data")
			return
		}
		c.Hub.subscribeClient(c, data.ConversationID)

	case "unsubscribe":
		var data models.WSUnsubscribeData
		dataBytes, err := json.Marshal(frame.Data)
		if err != nil {
			c.sendError("INVALID_DATA", "Invalid unsubscribe data format")
			return
		}
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid unsubscribe data")
			return
		}
		c.Hub.unsubscribeClient(c, data.ConversationID)

	case "message.send":
		var data models.WSMessageSendData
		dataBytes, err := json.Marshal(frame.Data)
		if err != nil {
			c.sendError("INVALID_DATA", "Invalid message data format")
			return
		}
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
		dataBytes, err := json.Marshal(frame.Data)
		if err != nil {
			c.sendError("INVALID_DATA", "Invalid typing data format")
			return
		}
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid typing data")
			return
		}

		err = c.Hub.messageService.PublishTypingIndicator(data.ConversationID, c.UserID, data.IsTyping)
		if err != nil {
			log.Printf("Failed to publish typing indicator: %v", err)
		}

	case "receipt.read":
		var data models.WSReceiptReadData
		dataBytes, err := json.Marshal(frame.Data)
		if err != nil {
			c.sendError("INVALID_DATA", "Invalid receipt data format")
			return
		}
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid receipt data")
			return
		}

		err = c.Hub.messageService.MarkMessageAsRead(ctx, data.ConversationID, c.UserID, data.MessageID)
		if err != nil {
			log.Printf("Failed to mark message as read: %v", err)
		}

	case "friend.request.send":
		var data models.WSFriendRequestSendData
		dataBytes, err := json.Marshal(frame.Data)
		if err != nil {
			c.sendError("INVALID_DATA", "Invalid friend request data format")
			return
		}
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid friend request data")
			return
		}

		request, err := c.Hub.friendService.SendFriendRequest(ctx, c.UserID, data.ToUserEmail)
		if err != nil {
			c.sendError("FRIEND_REQUEST_FAILED", fmt.Sprintf("Failed to send friend request: %v", err))
			return
		}

		// Send acknowledgment
		c.sendFrame("friend.request.sent", request)

	case "friend.request.respond":
		var data models.WSFriendRequestRespondData
		dataBytes, err := json.Marshal(frame.Data)
		if err != nil {
			c.sendError("INVALID_DATA", "Invalid friend response data format")
			return
		}
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid friend response data")
			return
		}

		friendship, err := c.Hub.friendService.RespondToFriendRequest(ctx, data.RequestID, c.UserID, data.Accept)
		if err != nil {
			c.sendError("FRIEND_RESPONSE_FAILED", fmt.Sprintf("Failed to respond to friend request: %v", err))
			return
		}

		if data.Accept {
			// Friendship will be sent via NATS event
			_ = friendship
		}

	case "friend.remove":
		var data models.WSFriendRemoveData
		dataBytes, err := json.Marshal(frame.Data)
		if err != nil {
			c.sendError("INVALID_DATA", "Invalid friend remove data format")
			return
		}
		if err := json.Unmarshal(dataBytes, &data); err != nil {
			c.sendError("INVALID_DATA", "Invalid friend remove data")
			return
		}

		err = c.Hub.friendService.RemoveFriend(ctx, c.UserID, data.FriendID)
		if err != nil {
			c.sendError("FRIEND_REMOVE_FAILED", fmt.Sprintf("Failed to remove friend: %v", err))
			return
		}

		// Event will be sent via NATS
		c.sendFrame("friend.removed", map[string]string{"friendId": data.FriendID})
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
		log.Printf("WebSocket client %s send buffer full, closing connection", c.ID)
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

	// Unsubscribe from user-level events
	h.unsubscribeUserEvents(client)

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
		if sub.ParticipantSub != nil {
			sub.ParticipantSub.Unsubscribe()
		}
		if sub.ConversationSub != nil {
			sub.ConversationSub.Unsubscribe()
		}
		delete(h.subscriptions, conversationID)
	}
}

func (h *WebSocketHub) setupNATSSubscriptions(sub *ConversationSubscription) {
	// Subscribe to messages (JetStream)
	messageSubject := fmt.Sprintf("chat.conv.%s.msg", sub.ConversationID)
	natsSub, err := h.natsConn.Conn.Subscribe(messageSubject, func(msg *natsgo.Msg) {
		// Try to unmarshal as message deletion first
		var deletionData models.WSMessageDeletedData
		if err := json.Unmarshal(msg.Data, &deletionData); err == nil && deletionData.DeletedBy != "" {
			frame := &models.WSFrame{
				Type: "message.deleted",
				TS:   time.Now().UnixMilli(),
				Data: deletionData,
			}
			h.broadcastToSubscription(sub, frame)
			return
		}

		// Otherwise, try to unmarshal as new message
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

	// Subscribe to participant updates
	participantSubject := fmt.Sprintf("chat.conv.%s.participants", sub.ConversationID)
	participantSub, err := h.natsConn.Conn.Subscribe(participantSubject, func(msg *natsgo.Msg) {
		var participantData models.WSParticipantUpdateData
		if err := json.Unmarshal(msg.Data, &participantData); err != nil {
			log.Printf("Failed to unmarshal participant update data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "participant.update",
			TS:   time.Now().UnixMilli(),
			Data: participantData,
		}

		h.broadcastToSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to participant updates: %v", err)
	}
	sub.ParticipantSub = participantSub

	// Subscribe to conversation updates
	conversationUpdateSubject := fmt.Sprintf("chat.conv.%s.updates", sub.ConversationID)
	conversationUpdateSub, err := h.natsConn.Conn.Subscribe(conversationUpdateSubject, func(msg *natsgo.Msg) {
		var conversationData models.WSConversationUpdateData
		if err := json.Unmarshal(msg.Data, &conversationData); err != nil {
			log.Printf("Failed to unmarshal conversation update data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "conversation.update",
			TS:   time.Now().UnixMilli(),
			Data: conversationData,
		}

		h.broadcastToSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to conversation updates: %v", err)
	}
	sub.ConversationSub = conversationUpdateSub
}

func (h *WebSocketHub) broadcastToSubscription(sub *ConversationSubscription, frame *models.WSFrame) {
	sub.ClientsMu.RLock()
	defer sub.ClientsMu.RUnlock()

	for _, client := range sub.Clients {
		select {
		case client.Send <- frame:
		default:
			log.Printf("WebSocket client %s send buffer full during broadcast, closing connection", client.ID)
			close(client.Send)
			delete(sub.Clients, client.ID)
		}
	}
}

// ConnectionCount returns the current number of active WebSocket connections
func (h *WebSocketHub) ConnectionCount() int {
	h.clientsMu.RLock()
	defer h.clientsMu.RUnlock()
	return len(h.clients)
}

// isExpectedDisconnection checks if the WebSocket error is from an expected client disconnection
func isExpectedDisconnection(err error) bool {
	errStr := err.Error()
	return strings.Contains(errStr, "StatusGoingAway") ||
		strings.Contains(errStr, "StatusNormalClosure") ||
		strings.Contains(errStr, "connection closed") ||
		strings.Contains(errStr, "status = StatusGoingAway")
}

// subscribeUserEvents subscribes a client to user-level events (friend requests, etc.)
func (h *WebSocketHub) subscribeUserEvents(client *Client, userID string) {
	h.userSubsMu.Lock()
	defer h.userSubsMu.Unlock()

	sub, exists := h.userSubscriptions[userID]
	if !exists {
		sub = &UserSubscription{
			UserID:  userID,
			Clients: make(map[string]*Client),
		}

		// Setup NATS subscriptions for user events
		h.setupUserNATSSubscriptions(sub)
		h.userSubscriptions[userID] = sub
	}

	sub.ClientsMu.Lock()
	sub.Clients[client.ID] = client
	sub.ClientsMu.Unlock()
}

// unsubscribeUserEvents unsubscribes a client from user-level events
func (h *WebSocketHub) unsubscribeUserEvents(client *Client) {
	h.userSubsMu.Lock()
	defer h.userSubsMu.Unlock()

	sub, exists := h.userSubscriptions[client.UserID]
	if !exists {
		return
	}

	sub.ClientsMu.Lock()
	delete(sub.Clients, client.ID)
	clientCount := len(sub.Clients)
	sub.ClientsMu.Unlock()

	// If no more clients, cleanup NATS subscriptions
	if clientCount == 0 {
		if sub.FriendRequestSub != nil {
			sub.FriendRequestSub.Unsubscribe()
		}
		if sub.FriendAcceptedSub != nil {
			sub.FriendAcceptedSub.Unsubscribe()
		}
		if sub.FriendRejectedSub != nil {
			sub.FriendRejectedSub.Unsubscribe()
		}
		if sub.FriendRemovedSub != nil {
			sub.FriendRemovedSub.Unsubscribe()
		}
		if sub.ConversationAddedSub != nil {
			sub.ConversationAddedSub.Unsubscribe()
		}
		if sub.ConversationRemovedSub != nil {
			sub.ConversationRemovedSub.Unsubscribe()
		}
		delete(h.userSubscriptions, client.UserID)
	}
}

// setupUserNATSSubscriptions sets up NATS subscriptions for user-level events
func (h *WebSocketHub) setupUserNATSSubscriptions(sub *UserSubscription) {
	// Subscribe to friend requests
	friendRequestSubject := fmt.Sprintf("chat.user.%s.friend_request", sub.UserID)
	friendRequestSub, err := h.natsConn.Conn.Subscribe(friendRequestSubject, func(msg *natsgo.Msg) {
		var data models.WSFriendRequestReceivedData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			log.Printf("Failed to unmarshal friend request data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "friend.request.received",
			TS:   time.Now().UnixMilli(),
			Data: data,
		}

		h.broadcastToUserSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to friend requests: %v", err)
	}
	sub.FriendRequestSub = friendRequestSub

	// Subscribe to friend request accepted
	friendAcceptedSubject := fmt.Sprintf("chat.user.%s.friend_accepted", sub.UserID)
	friendAcceptedSub, err := h.natsConn.Conn.Subscribe(friendAcceptedSubject, func(msg *natsgo.Msg) {
		var data models.WSFriendRequestAcceptedData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			log.Printf("Failed to unmarshal friend accepted data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "friend.request.accepted",
			TS:   time.Now().UnixMilli(),
			Data: data,
		}

		h.broadcastToUserSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to friend accepted: %v", err)
	}
	sub.FriendAcceptedSub = friendAcceptedSub

	// Subscribe to friend request rejected
	friendRejectedSubject := fmt.Sprintf("chat.user.%s.friend_rejected", sub.UserID)
	friendRejectedSub, err := h.natsConn.Conn.Subscribe(friendRejectedSubject, func(msg *natsgo.Msg) {
		var data models.WSFriendRequestRejectedData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			log.Printf("Failed to unmarshal friend rejected data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "friend.request.rejected",
			TS:   time.Now().UnixMilli(),
			Data: data,
		}

		h.broadcastToUserSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to friend rejected: %v", err)
	}
	sub.FriendRejectedSub = friendRejectedSub

	// Subscribe to friend removed
	friendRemovedSubject := fmt.Sprintf("chat.user.%s.friend_removed", sub.UserID)
	friendRemovedSub, err := h.natsConn.Conn.Subscribe(friendRemovedSubject, func(msg *natsgo.Msg) {
		var data models.WSFriendRemovedData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			log.Printf("Failed to unmarshal friend removed data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "friend.removed",
			TS:   time.Now().UnixMilli(),
			Data: data,
		}

		h.broadcastToUserSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to friend removed: %v", err)
	}
	sub.FriendRemovedSub = friendRemovedSub

	// Subscribe to conversation added
	conversationAddedSubject := fmt.Sprintf("chat.user.%s.conversation_added", sub.UserID)
	conversationAddedSub, err := h.natsConn.Conn.Subscribe(conversationAddedSubject, func(msg *natsgo.Msg) {
		var data models.WSConversationAddedData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			log.Printf("Failed to unmarshal conversation added data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "conversation.added",
			TS:   time.Now().UnixMilli(),
			Data: data,
		}

		h.broadcastToUserSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to conversation added: %v", err)
	}
	sub.ConversationAddedSub = conversationAddedSub

	// Subscribe to conversation removed
	conversationRemovedSubject := fmt.Sprintf("chat.user.%s.conversation_removed", sub.UserID)
	conversationRemovedSub, err := h.natsConn.Conn.Subscribe(conversationRemovedSubject, func(msg *natsgo.Msg) {
		var data models.WSConversationRemovedData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			log.Printf("Failed to unmarshal conversation removed data: %v", err)
			return
		}

		frame := &models.WSFrame{
			Type: "conversation.removed",
			TS:   time.Now().UnixMilli(),
			Data: data,
		}

		h.broadcastToUserSubscription(sub, frame)
	})
	if err != nil {
		log.Printf("Failed to subscribe to conversation removed: %v", err)
	}
	sub.ConversationRemovedSub = conversationRemovedSub
}

// broadcastToUserSubscription broadcasts a frame to all clients in a user subscription
func (h *WebSocketHub) broadcastToUserSubscription(sub *UserSubscription, frame *models.WSFrame) {
	sub.ClientsMu.RLock()
	defer sub.ClientsMu.RUnlock()

	for _, client := range sub.Clients {
		select {
		case client.Send <- frame:
		default:
			log.Printf("WebSocket client %s send buffer full during user event broadcast", client.ID)
		}
	}
}