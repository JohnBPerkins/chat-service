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
	db          *database.MongoDB
	userService *UserService
}

func NewConversationService(db *database.MongoDB, userService *UserService) *ConversationService {
	return &ConversationService{
		db:          db,
		userService: userService,
	}
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

func (s *ConversationService) GetUserConversations(ctx context.Context, userID string) ([]models.ConversationWithParticipants, error) {
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
		return []models.ConversationWithParticipants{}, nil
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
		options.Find().SetSort(bson.D{{Key: "lastMessageAt", Value: -1}}),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to find conversations: %w", err)
	}
	defer conversationCursor.Close(ctx)

	var conversations []models.Conversation
	if err = conversationCursor.All(ctx, &conversations); err != nil {
		return nil, fmt.Errorf("failed to decode conversations: %w", err)
	}

	// Convert to ConversationWithParticipants and populate participants
	result := make([]models.ConversationWithParticipants, len(conversations))
	for i, conv := range conversations {
		result[i] = models.ConversationWithParticipants{
			ID:            conv.ID,
			Kind:          conv.Kind,
			Title:         conv.Title,
			CreatedAt:     conv.CreatedAt,
			LastMessageAt: conv.LastMessageAt,
		}

		// Get all participants for this conversation
		participantCursor, err := participantsCollection.Find(ctx, bson.M{"conversationId": conv.ID})
		if err != nil {
			return nil, fmt.Errorf("failed to find conversation participants: %w", err)
		}

		var convParticipants []models.Participant
		if err = participantCursor.All(ctx, &convParticipants); err != nil {
			participantCursor.Close(ctx)
			return nil, fmt.Errorf("failed to decode conversation participants: %w", err)
		}
		participantCursor.Close(ctx)

		// Populate user info for each participant
		participantUsers := make([]models.User, 0, len(convParticipants))
		for _, p := range convParticipants {
			if user, err := s.userService.GetUserByID(ctx, p.UserID); err == nil {
				participantUsers = append(participantUsers, *user)
			}
		}
		result[i].Participants = participantUsers
	}

	return result, nil
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
		bson.D{{Key: "$set", Value: bson.D{{Key: "lastMessageAt", Value: time.Now()}}}},
	)
	if err != nil {
		return fmt.Errorf("failed to update lastMessageAt: %w", err)
	}

	return nil
}

func (s *ConversationService) DeleteConversation(ctx context.Context, conversationID, userID string) error {
	// Check if user is a participant and has permission to delete
	isParticipant, err := s.IsUserParticipant(ctx, conversationID, userID)
	if err != nil {
		return fmt.Errorf("failed to check participation: %w", err)
	}
	if !isParticipant {
		return fmt.Errorf("user is not a participant in this conversation")
	}

	// Check if user is admin (only admins can delete conversations)
	participantsCollection := s.db.DB.Collection("participants")
	participantID := fmt.Sprintf("%s:%s", conversationID, userID)

	var participant models.Participant
	err = participantsCollection.FindOne(ctx, bson.M{"_id": participantID}).Decode(&participant)
	if err != nil {
		return fmt.Errorf("failed to find participant: %w", err)
	}

	if participant.Role != "admin" {
		return fmt.Errorf("only admins can delete conversations")
	}

	// Delete all messages in the conversation
	messagesCollection := s.db.DB.Collection("messages")
	_, err = messagesCollection.DeleteMany(ctx, bson.M{"conversationId": conversationID})
	if err != nil {
		return fmt.Errorf("failed to delete messages: %w", err)
	}

	// Delete all participants
	_, err = participantsCollection.DeleteMany(ctx, bson.M{"conversationId": conversationID})
	if err != nil {
		return fmt.Errorf("failed to delete participants: %w", err)
	}

	// Delete the conversation itself
	conversationsCollection := s.db.DB.Collection("conversations")
	result, err := conversationsCollection.DeleteOne(ctx, bson.M{"_id": conversationID})
	if err != nil {
		return fmt.Errorf("failed to delete conversation: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("conversation not found")
	}

	return nil
}

// generateUUID is a placeholder - in production use a proper UUID library
func generateUUID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}