package services

import (
	"context"
	"fmt"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/pkg/database"
	"github.com/JohnBPerkins/chat-service/backend/pkg/nats"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MessageService struct {
	db   *database.MongoDB
	nats *nats.NATSConnection
}

func NewMessageService(db *database.MongoDB, natsConn *nats.NATSConnection) *MessageService {
	return &MessageService{
		db:   db,
		nats: natsConn,
	}
}

func (s *MessageService) SendMessage(ctx context.Context, req *models.SendMessageRequest, senderID string) (*models.Message, error) {
	collection := s.db.DB.Collection("messages")

	// Generate snowflake ID (simplified version)
	messageID := generateSnowflakeID()

	message := &models.Message{
		ID:             messageID,
		ConversationID: req.ConversationID,
		SenderID:       senderID,
		ClientMsgID:    req.ClientMsgID,
		Body:           req.Body,
		CreatedAt:      time.Now(),
	}

	// Insert message with idempotency check
	_, err := collection.InsertOne(ctx, message)
	if err != nil {
		// Check if it's a duplicate key error (idempotency)
		if mongo.IsDuplicateKeyError(err) {
			// Find and return existing message
			var existingMessage models.Message
			filter := bson.D{
				{Key: "conversationId", Value: req.ConversationID},
				{Key: "senderId", Value: senderID},
				{Key: "clientMsgId", Value: req.ClientMsgID},
			}
			err := collection.FindOne(ctx, filter).Decode(&existingMessage)
			if err != nil {
				return nil, fmt.Errorf("failed to find existing message: %w", err)
			}
			return &existingMessage, nil
		}
		return nil, fmt.Errorf("failed to insert message: %w", err)
	}

	// Publish to NATS JetStream
	wsMessageData := &models.WSMessageNewData{
		ID:             message.ID,
		ConversationID: message.ConversationID,
		SenderID:       message.SenderID,
		Body:           message.Body,
		CreatedAt:      message.CreatedAt,
	}

	err = s.nats.PublishMessage(req.ConversationID, wsMessageData)
	if err != nil {
		// Log error but don't fail the request - message is already persisted
		fmt.Printf("Failed to publish message to NATS: %v\n", err)
	}

	return message, nil
}

func (s *MessageService) GetMessages(ctx context.Context, conversationID string, before string, limit int) (*models.PaginatedMessagesResponse, error) {
	collection := s.db.DB.Collection("messages")

	var filter bson.D
	if before != "" {
		// Parse before cursor (could be timestamp or message ID)
		// For simplicity, assume it's a timestamp for now
		if beforeTime, err := time.Parse(time.RFC3339, before); err == nil {
			filter = bson.D{
				{Key: "conversationId", Value: conversationID},
				{Key: "createdAt", Value: bson.D{{Key: "$lt", Value: beforeTime}}},
			}
		} else {
			filter = bson.D{{Key: "conversationId", Value: conversationID}}
		}
	} else {
		filter = bson.D{{Key: "conversationId", Value: conversationID}}
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

	var nextCursor string
	if hasMore && len(messages) > 0 {
		nextCursor = messages[len(messages)-1].CreatedAt.Format(time.RFC3339)
	}

	return &models.PaginatedMessagesResponse{
		Messages:   messages,
		HasMore:    hasMore,
		NextCursor: nextCursor,
	}, nil
}

func (s *MessageService) MarkMessageAsRead(ctx context.Context, conversationID, userID string, messageID int64) error {
	collection := s.db.DB.Collection("participants")

	participantID := fmt.Sprintf("%s:%s", conversationID, userID)
	filter := bson.M{"_id": participantID}
	update := bson.D{{Key: "$set", Value: bson.D{{Key: "lastReadMessageId", Value: messageID}}}}

	_, err := collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update read receipt: %w", err)
	}

	// Publish read receipt update
	receiptData := &models.WSReceiptUpdateData{
		ConversationID: conversationID,
		UserID:         userID,
		MessageID:      messageID,
	}

	// Publish to ephemeral subject (not JetStream)
	err = s.nats.PublishPresence(conversationID, receiptData)
	if err != nil {
		fmt.Printf("Failed to publish read receipt: %v\n", err)
	}

	return nil
}

func (s *MessageService) PublishTypingIndicator(conversationID, userID string, isTyping bool) error {
	typingData := &models.WSTypingUpdateEventData{
		ConversationID: conversationID,
		UserID:         userID,
		IsTyping:       isTyping,
	}

	return s.nats.PublishTyping(conversationID, typingData)
}

// generateSnowflakeID is a simplified snowflake ID generator
// In production, use a proper snowflake library
func generateSnowflakeID() int64 {
	return time.Now().UnixMilli()
}