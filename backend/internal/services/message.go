package services

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/internal/validation"
	"github.com/JohnBPerkins/chat-service/backend/pkg/database"
	"github.com/JohnBPerkins/chat-service/backend/pkg/nats"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MessageService struct {
	db          *database.MongoDB
	nats        *nats.NATSConnection
	userService *UserService
	idCounter   atomic.Uint64 // Atomic counter to prevent ID collisions
	instanceID  uint64        // Unique instance ID for this replica (0-1023)
}

func NewMessageService(db *database.MongoDB, natsConn *nats.NATSConnection, userService *UserService) *MessageService {
	ms := &MessageService{
		db:          db,
		nats:        natsConn,
		userService: userService,
		instanceID:  generateInstanceID(),
	}

	fmt.Printf("Message service started with instance ID: %d\n", ms.instanceID)

	return ms
}

// generateInstanceID creates a random instance ID (0-1023) for this replica
func generateInstanceID() uint64 {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		// Fallback to timestamp-based ID if crypto/rand fails
		return uint64(time.Now().UnixNano()) & 0x3FF
	}
	return binary.BigEndian.Uint64(buf[:]) & 0x3FF // 10 bits = 1024 possible instances
}


func (s *MessageService) SendMessage(ctx context.Context, req *models.SendMessageRequest, senderID string) (*models.MessageWithSender, error) {
	// Validate inputs
	sanitizedConversationID, err := validation.ValidateUserID(req.ConversationID)
	if err != nil {
		return nil, fmt.Errorf("invalid conversation ID: %w", err)
	}
	sanitizedSenderID, err := validation.ValidateUserID(senderID)
	if err != nil {
		return nil, fmt.Errorf("invalid sender ID: %w", err)
	}
	sanitizedClientMsgID, err := validation.ValidateUserID(req.ClientMsgID)
	if err != nil {
		return nil, fmt.Errorf("invalid client message ID: %w", err)
	}

	// Sanitize message body
	sanitizedBody, err := validation.SanitizeString(req.Body, 10000) // Allow longer messages
	if err != nil {
		return nil, fmt.Errorf("invalid message body: %w", err)
	}

	// Verify conversation exists
	conversationsCollection := s.db.DB.Collection("conversations")
	var conversation models.Conversation
	err = conversationsCollection.FindOne(ctx, bson.M{"_id": sanitizedConversationID}).Decode(&conversation)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("conversation not found")
		}
		return nil, fmt.Errorf("failed to verify conversation: %w", err)
	}

	collection := s.db.DB.Collection("messages")

	// Generate collision-resistant ID (timestamp + atomic counter)
	messageID := s.generateSnowflakeID()

	message := &models.Message{
		ID:             messageID,
		ConversationID: sanitizedConversationID,
		SenderID:       sanitizedSenderID,
		ClientMsgID:    sanitizedClientMsgID,
		Body:           sanitizedBody,
		CreatedAt:      time.Now(),
	}

	// Insert message with idempotency check
	_, err = collection.InsertOne(ctx, message)
	if err != nil {
		// Check if it's a duplicate key error (idempotency)
		if mongo.IsDuplicateKeyError(err) {
			// Find and return existing message
			var existingMessage models.Message
			filter := bson.D{
				{Key: "conversationId", Value: sanitizedConversationID},
				{Key: "senderId", Value: sanitizedSenderID},
				{Key: "clientMsgId", Value: sanitizedClientMsgID},
			}
			err := collection.FindOne(ctx, filter).Decode(&existingMessage)
			if err != nil {
				return nil, fmt.Errorf("failed to find existing message: %w", err)
			}

			// Convert to MessageWithSender and populate sender info
			messageWithSender := &models.MessageWithSender{
				ID:             existingMessage.ID,
				ConversationID: existingMessage.ConversationID,
				SenderID:       existingMessage.SenderID,
				ClientMsgID:    existingMessage.ClientMsgID,
				Body:           existingMessage.Body,
				CreatedAt:      existingMessage.CreatedAt,
				EditedAt:       existingMessage.EditedAt,
			}

			// Fetch sender information
			if sender, err := s.userService.GetUserByID(ctx, existingMessage.SenderID); err == nil {
				messageWithSender.Sender = sender
			}

			return messageWithSender, nil
		}
		return nil, fmt.Errorf("failed to insert message: %w", err)
	}

	// Update conversation's lastMessageAt asynchronously (non-critical metadata)
	go func() {
		bgCtx := context.Background()
		conversationsCollection := s.db.DB.Collection("conversations")
		_, err := conversationsCollection.UpdateOne(
			bgCtx,
			bson.M{"_id": sanitizedConversationID},
			bson.M{"$set": bson.M{"lastMessageAt": message.CreatedAt}},
		)
		if err != nil {
			// Log but don't fail - message is already persisted
			fmt.Printf("Failed to update conversation lastMessageAt: %v\n", err)
		}
	}()

	// Convert to MessageWithSender and populate sender info
	messageWithSender := &models.MessageWithSender{
		ID:             message.ID,
		ConversationID: message.ConversationID,
		SenderID:       message.SenderID,
		ClientMsgID:    message.ClientMsgID,
		Body:           sanitizedBody,
		CreatedAt:      message.CreatedAt,
		EditedAt:       message.EditedAt,
	}

	// Fetch sender information
	if sender, err := s.userService.GetUserByID(ctx, message.SenderID); err == nil {
		messageWithSender.Sender = sender
	}

	// Publish to NATS JetStream (if NATS is available)
	if s.nats != nil {
		wsMessageData := &models.WSMessageNewData{
			ID:             message.ID,
			ConversationID: message.ConversationID,
			SenderID:       message.SenderID,
			ClientMsgID:    message.ClientMsgID,
			Body:           sanitizedBody,
			CreatedAt:      message.CreatedAt,
			Sender:         messageWithSender.Sender,
			SendTime:       req.SendTime,
		}

		err = s.nats.PublishMessage(sanitizedConversationID, wsMessageData)
		if err != nil {
			// Log error but don't fail the request - message is already persisted
			fmt.Printf("Failed to publish message to NATS: %v\n", err)
		}
	}

	return messageWithSender, nil
}

func (s *MessageService) GetMessages(ctx context.Context, conversationID string, before string, limit int) (*models.PaginatedMessagesResponse, error) {
	// Validate conversation ID
	sanitizedConversationID, err := validation.ValidateUserID(conversationID)
	if err != nil {
		return nil, fmt.Errorf("invalid conversation ID: %w", err)
	}

	collection := s.db.DB.Collection("messages")

	var filter bson.D
	if before != "" {
		// Parse before cursor (could be timestamp or message ID)
		// For simplicity, assume it's a timestamp for now
		if beforeTime, err := time.Parse(time.RFC3339, before); err == nil {
			filter = bson.D{
				{Key: "conversationId", Value: sanitizedConversationID},
				{Key: "createdAt", Value: bson.D{{Key: "$lt", Value: beforeTime}}},
			}
		} else {
			filter = bson.D{{Key: "conversationId", Value: sanitizedConversationID}}
		}
	} else {
		filter = bson.D{{Key: "conversationId", Value: sanitizedConversationID}}
	}

	// Set default limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(int64(limit + 1)) // Fetch one extra to check if there are more

	cursor, err := collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to find messages: %w", err)
	}
	defer cursor.Close(ctx)

	var messages []models.Message
	if err = cursor.All(ctx, &messages); err != nil {
		return nil, fmt.Errorf("failed to decode messages: %w", err)
	}

	hasMore := len(messages) > limit
	if hasMore {
		messages = messages[:limit]
	}

	// Convert to MessageWithSender and populate sender info
	messagesWithSender := make([]models.MessageWithSender, len(messages))
	for i, msg := range messages {
		messagesWithSender[i] = models.MessageWithSender{
			ID:             msg.ID,
			ConversationID: msg.ConversationID,
			SenderID:       msg.SenderID,
			ClientMsgID:    msg.ClientMsgID,
			Body:           msg.Body,
			CreatedAt:      msg.CreatedAt,
			EditedAt:       msg.EditedAt,
		}

		// Fetch sender information
		if sender, err := s.userService.GetUserByID(ctx, msg.SenderID); err == nil {
			messagesWithSender[i].Sender = sender
		}
		// If user fetch fails, sender will be nil and frontend should handle it gracefully
	}

	var nextCursor string
	if hasMore && len(messages) > 0 {
		nextCursor = messages[len(messages)-1].CreatedAt.Format(time.RFC3339)
	}

	return &models.PaginatedMessagesResponse{
		Messages:   messagesWithSender,
		HasMore:    hasMore,
		NextCursor: nextCursor,
	}, nil
}

func (s *MessageService) MarkMessageAsRead(ctx context.Context, conversationID, userID string, messageID int64) error {
	// Validate inputs
	sanitizedConversationID, err := validation.ValidateUserID(conversationID)
	if err != nil {
		return fmt.Errorf("invalid conversation ID: %w", err)
	}
	sanitizedUserID, err := validation.ValidateUserID(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	collection := s.db.DB.Collection("participants")

	participantID := fmt.Sprintf("%s:%s", sanitizedConversationID, sanitizedUserID)
	filter := primitive.M{"_id": participantID}
	update := bson.D{{Key: "$set", Value: bson.D{{Key: "lastReadMessageId", Value: messageID}}}}

	_, err = collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update read receipt: %w", err)
	}

	// Publish read receipt update (if NATS is available)
	if s.nats != nil {
		receiptData := &models.WSReceiptUpdateData{
			ConversationID: sanitizedConversationID,
			UserID:         sanitizedUserID,
			MessageID:      messageID,
		}

		// Publish to ephemeral subject (not JetStream)
		err = s.nats.PublishPresence(sanitizedConversationID, receiptData)
		if err != nil {
			fmt.Printf("Failed to publish read receipt: %v\n", err)
		}
	}

	return nil
}

func (s *MessageService) PublishTypingIndicator(conversationID, userID string, isTyping bool) error {
	// Validate inputs
	sanitizedConversationID, err := validation.ValidateUserID(conversationID)
	if err != nil {
		return fmt.Errorf("invalid conversation ID: %w", err)
	}
	sanitizedUserID, err := validation.ValidateUserID(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	if s.nats == nil {
		return fmt.Errorf("NATS connection not available")
	}

	typingData := &models.WSTypingUpdateEventData{
		ConversationID: sanitizedConversationID,
		UserID:         sanitizedUserID,
		IsTyping:       isTyping,
	}

	return s.nats.PublishTyping(sanitizedConversationID, typingData)
}

// DeleteMessage deletes a message if the user is the sender
func (s *MessageService) DeleteMessage(ctx context.Context, messageID int64, userID string) error {
	// Validate user ID
	sanitizedUserID, err := validation.ValidateUserID(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	collection := s.db.DB.Collection("messages")

	// First, find the message to verify ownership
	var message models.Message
	err = collection.FindOne(ctx, primitive.M{"_id": messageID}).Decode(&message)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return fmt.Errorf("message not found")
		}
		return fmt.Errorf("failed to find message: %w", err)
	}

	// Check if the user is the sender
	if message.SenderID != sanitizedUserID {
		return fmt.Errorf("user not authorized to delete this message")
	}

	// Delete the message
	result, err := collection.DeleteOne(ctx, primitive.M{"_id": messageID})
	if err != nil {
		return fmt.Errorf("failed to delete message: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("message not found")
	}

	// Publish deletion event to WebSocket (if NATS is available)
	if s.nats != nil {
		deletionData := &models.WSMessageDeletedData{
			ID:             message.ID,
			ConversationID: message.ConversationID,
			DeletedBy:      sanitizedUserID,
		}

		err = s.nats.PublishMessage(message.ConversationID, deletionData)
		if err != nil {
			// Log error but don't fail the request - message is already deleted
			fmt.Printf("Failed to publish message deletion to NATS: %v\n", err)
		}
	}

	return nil
}

func (s *MessageService) EditMessage(ctx context.Context, messageID int64, newBody string, userID string) (*models.MessageWithSender, error) {
	// Validate user ID
	sanitizedUserID, err := validation.ValidateUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Sanitize new message body
	sanitizedBody, err := validation.SanitizeString(newBody, 10000)
	if err != nil {
		return nil, fmt.Errorf("invalid message body: %w", err)
	}

	collection := s.db.DB.Collection("messages")

	// First, find the message to verify ownership
	var message models.Message
	err = collection.FindOne(ctx, primitive.M{"_id": messageID}).Decode(&message)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("message not found")
		}
		return nil, fmt.Errorf("failed to find message: %w", err)
	}

	// Check if the user is the sender
	if message.SenderID != sanitizedUserID {
		return nil, fmt.Errorf("user not authorized to edit this message")
	}

	// Update the message
	editedAt := time.Now()
	update := bson.M{
		"$set": bson.M{
			"body":     sanitizedBody,
			"editedAt": editedAt,
		},
	}

	result, err := collection.UpdateOne(ctx, primitive.M{"_id": messageID}, update)
	if err != nil {
		return nil, fmt.Errorf("failed to edit message: %w", err)
	}

	if result.MatchedCount == 0 {
		return nil, fmt.Errorf("message not found")
	}

	// Create updated message object
	message.Body = sanitizedBody
	message.EditedAt = &editedAt

	// Publish edit event to WebSocket (if NATS is available)
	if s.nats != nil {
		editData := &models.WSMessageEditedData{
			ID:             message.ID,
			ConversationID: message.ConversationID,
			Body:           sanitizedBody,
			EditedAt:       editedAt,
			EditedBy:       sanitizedUserID,
		}

		err = s.nats.PublishMessage(message.ConversationID, editData)
		if err != nil {
			// Log error but don't fail the request - message is already edited
			fmt.Printf("Failed to publish message edit to NATS: %v\n", err)
		}
	}

	// Convert to MessageWithSender and populate sender info
	messageWithSender := &models.MessageWithSender{
		ID:             message.ID,
		ConversationID: message.ConversationID,
		SenderID:       message.SenderID,
		ClientMsgID:    message.ClientMsgID,
		Body:           message.Body,
		CreatedAt:      message.CreatedAt,
		EditedAt:       message.EditedAt,
	}

	// Fetch sender information
	if sender, err := s.userService.GetUserByID(ctx, message.SenderID); err == nil {
		messageWithSender.Sender = sender
	}

	return messageWithSender, nil
}

// generateSnowflakeID generates a distributed-safe Snowflake ID
// Format (64 bits total):
//   - Bits 63-22 (42 bits): Timestamp in milliseconds since epoch
//   - Bits 21-12 (10 bits): Instance ID (supports up to 1024 replicas)
//   - Bits 11-0  (12 bits): Sequence number (up to 4096 per millisecond per instance)
// This ensures unique IDs across multiple replicas without coordination
func (s *MessageService) generateSnowflakeID() int64 {
	// Get current timestamp in milliseconds
	timestamp := uint64(time.Now().UnixMilli())

	// Atomically increment sequence counter (wraps at 4096)
	sequence := s.idCounter.Add(1) & 0xFFF

	// Combine: timestamp (42 bits) | instance ID (10 bits) | sequence (12 bits)
	id := (timestamp << 22) | (s.instanceID << 12) | sequence

	return int64(id)
}