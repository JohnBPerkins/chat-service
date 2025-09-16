package services

import (
	"context"
	"fmt"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/pkg/database"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ConversationService struct {
	db *database.MongoDB
}

func NewConversationService(db *database.MongoDB) *ConversationService {
	return &ConversationService{db: db}
}

func (s *ConversationService) CreateConversation(ctx context.Context, req *models.CreateConversationRequest, creatorID string) (*models.Conversation, error) {
	conversationsCollection := s.db.DB.Collection("conversations")
	participantsCollection := s.db.DB.Collection("participants")

	// Create conversation
	conversation := &models.Conversation{
		ID:            generateUUID(),
		Kind:          req.Kind,
		Title:         req.Title,
		CreatedAt:     time.Now(),
		LastMessageAt: time.Now(),
	}

	_, err := conversationsCollection.InsertOne(ctx, conversation)
	if err != nil {
		return nil, fmt.Errorf("failed to create conversation: %w", err)
	}

	// Add creator as admin participant
	creatorParticipant := &models.Participant{
		ID:             fmt.Sprintf("%s:%s", conversation.ID, creatorID),
		ConversationID: conversation.ID,
		UserID:         creatorID,
		Role:           "admin",
		JoinedAt:       time.Now(),
	}

	_, err = participantsCollection.InsertOne(ctx, creatorParticipant)
	if err != nil {
		return nil, fmt.Errorf("failed to add creator as participant: %w", err)
	}

	// Add other members
	for _, memberID := range req.Members {
		if memberID == creatorID {
			continue // Skip creator
		}

		participant := &models.Participant{
			ID:             fmt.Sprintf("%s:%s", conversation.ID, memberID),
			ConversationID: conversation.ID,
			UserID:         memberID,
			Role:           "member",
			JoinedAt:       time.Now(),
		}

		_, err = participantsCollection.InsertOne(ctx, participant)
		if err != nil {
			return nil, fmt.Errorf("failed to add participant %s: %w", memberID, err)
		}
	}

	return conversation, nil
}

func (s *ConversationService) GetUserConversations(ctx context.Context, userID string) ([]models.Conversation, error) {
	participantsCollection := s.db.DB.Collection("participants")
	conversationsCollection := s.db.DB.Collection("conversations")

	// Find all conversations where user is a participant
	cursor, err := participantsCollection.Find(ctx, bson.M{"userId": userID})
	if err != nil {
		return nil, fmt.Errorf("failed to find user participations: %w", err)
	}
	defer cursor.Close(ctx)

	var participants []models.Participant
	if err = cursor.All(ctx, &participants); err != nil {
		return nil, fmt.Errorf("failed to decode participants: %w", err)
	}

	if len(participants) == 0 {
		return []models.Conversation{}, nil
	}

	// Extract conversation IDs
	conversationIDs := make([]string, len(participants))
	for i, p := range participants {
		conversationIDs[i] = p.ConversationID
	}

	// Get conversations sorted by lastMessageAt
	conversationCursor, err := conversationsCollection.Find(
		ctx,
		bson.M{"_id": bson.M{"$in": conversationIDs}},
		options.Find().SetSort(bson.M{"lastMessageAt": -1}),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to find conversations: %w", err)
	}
	defer conversationCursor.Close(ctx)

	var conversations []models.Conversation
	if err = conversationCursor.All(ctx, &conversations); err != nil {
		return nil, fmt.Errorf("failed to decode conversations: %w", err)
	}

	return conversations, nil
}

func (s *ConversationService) GetConversationByID(ctx context.Context, conversationID string) (*models.Conversation, error) {
	collection := s.db.DB.Collection("conversations")

	var conversation models.Conversation
	err := collection.FindOne(ctx, bson.M{"_id": conversationID}).Decode(&conversation)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("conversation not found")
		}
		return nil, fmt.Errorf("failed to get conversation: %w", err)
	}

	return &conversation, nil
}

func (s *ConversationService) IsUserParticipant(ctx context.Context, conversationID, userID string) (bool, error) {
	collection := s.db.DB.Collection("participants")

	participantID := fmt.Sprintf("%s:%s", conversationID, userID)
	count, err := collection.CountDocuments(ctx, bson.M{"_id": participantID})
	if err != nil {
		return false, fmt.Errorf("failed to check participation: %w", err)
	}

	return count > 0, nil
}

func (s *ConversationService) UpdateLastMessageAt(ctx context.Context, conversationID string) error {
	collection := s.db.DB.Collection("conversations")

	_, err := collection.UpdateOne(
		ctx,
		bson.M{"_id": conversationID},
		bson.M{"$set": bson.M{"lastMessageAt": time.Now()}},
	)
	if err != nil {
		return fmt.Errorf("failed to update lastMessageAt: %w", err)
	}

	return nil
}

// generateUUID is a placeholder - in production use a proper UUID library
func generateUUID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}