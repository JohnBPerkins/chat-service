package services

import (
	"context"
	"fmt"
	"log"
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

type ConversationService struct {
	db          *database.MongoDB
	userService *UserService
	nats        *nats.NATSConnection
}

func NewConversationService(db *database.MongoDB, userService *UserService, natsConn *nats.NATSConnection) *ConversationService {
	return &ConversationService{
		db:          db,
		userService: userService,
		nats:        natsConn,
	}
}

func (s *ConversationService) CreateConversation(ctx context.Context, req *models.CreateConversationRequest, creatorID string) (*models.Conversation, error) {
	// Validate creator ID
	sanitizedCreatorID, err := validation.ValidateUserID(creatorID)
	if err != nil {
		return nil, fmt.Errorf("invalid creator ID: %w", err)
	}

	// Sanitize and validate title
	sanitizedTitle, err := validation.SanitizeString(req.Title, 200)
	if err != nil {
		return nil, fmt.Errorf("invalid title: %w", err)
	}

	// Validate all member IDs
	sanitizedMemberIDs := make([]string, len(req.Members))
	for i, memberID := range req.Members {
		sanitizedMemberID, err := validation.ValidateUserID(memberID)
		if err != nil {
			return nil, fmt.Errorf("invalid member ID %s: %w", memberID, err)
		}
		sanitizedMemberIDs[i] = sanitizedMemberID
	}

	conversationsCollection := s.db.DB.Collection("conversations")
	participantsCollection := s.db.DB.Collection("participants")

	// Create conversation
	conversation := &models.Conversation{
		ID:            generateUUID(),
		Kind:          req.Kind,
		Title:         sanitizedTitle,
		CreatedAt:     time.Now(),
		LastMessageAt: time.Now(),
	}

	_, err = conversationsCollection.InsertOne(ctx, conversation)
	if err != nil {
		return nil, fmt.Errorf("failed to create conversation: %w", err)
	}

	// Add creator as admin participant
	creatorParticipant := &models.Participant{
		ID:             fmt.Sprintf("%s:%s", conversation.ID, sanitizedCreatorID),
		ConversationID: conversation.ID,
		UserID:         sanitizedCreatorID,
		Role:           "admin",
		JoinedAt:       time.Now(),
	}

	_, err = participantsCollection.InsertOne(ctx, creatorParticipant)
	if err != nil {
		return nil, fmt.Errorf("failed to add creator as participant: %w", err)
	}

	// Add other members
	for _, memberID := range sanitizedMemberIDs {
		if memberID == sanitizedCreatorID {
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
	// Validate user ID
	sanitizedUserID, err := validation.ValidateUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	participantsCollection := s.db.DB.Collection("participants")
	conversationsCollection := s.db.DB.Collection("conversations")

	// Find all conversations where user is a participant
	cursor, err := participantsCollection.Find(ctx, bson.M{"userId": sanitizedUserID})
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

// GetConversationParticipants returns all participants of a conversation
func (s *ConversationService) GetConversationParticipants(ctx context.Context, conversationID, userID string) ([]models.User, error) {
	// First verify user is a participant
	if !s.isUserParticipant(ctx, conversationID, userID) {
		return nil, fmt.Errorf("user not authorized to view participants")
	}

	participantsCollection := s.db.DB.Collection("participants")

	// Get all participants for this conversation
	cursor, err := participantsCollection.Find(ctx, bson.M{"conversationId": conversationID})
	if err != nil {
		return nil, fmt.Errorf("failed to find participants: %w", err)
	}
	defer cursor.Close(ctx)

	var participants []models.Participant
	if err = cursor.All(ctx, &participants); err != nil {
		return nil, fmt.Errorf("failed to decode participants: %w", err)
	}

	// Get user info for each participant
	users := make([]models.User, 0, len(participants))
	for _, p := range participants {
		if user, err := s.userService.GetUserByID(ctx, p.UserID); err == nil {
			users = append(users, *user)
		}
	}

	return users, nil
}

// UpdateConversationTitle updates the title of a group conversation
func (s *ConversationService) UpdateConversationTitle(ctx context.Context, conversationID, userID, newTitle string) error {
	// Verify user is a participant
	if !s.isUserParticipant(ctx, conversationID, userID) {
		return fmt.Errorf("user not authorized to update conversation")
	}

	// Sanitize new title
	sanitizedTitle, err := validation.SanitizeString(newTitle, 200)
	if err != nil {
		return fmt.Errorf("invalid title: %w", err)
	}

	conversationsCollection := s.db.DB.Collection("conversations")

	// Update the conversation title
	filter := bson.M{"_id": conversationID}
	update := bson.D{{Key: "$set", Value: bson.D{{Key: "title", Value: sanitizedTitle}}}}

	result, err := conversationsCollection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update conversation title: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("conversation not found")
	}

	// Publish WebSocket event (if NATS is available)
	if s.nats != nil {
		conversationUpdateData := &models.WSConversationUpdateData{
			ConversationID: conversationID,
			Title:          newTitle,
			UpdateType:     "title",
			UpdatedBy:      userID,
		}

		subject := fmt.Sprintf("chat.conv.%s.updates", conversationID)
		if err := s.nats.PublishToSubject(subject, conversationUpdateData); err != nil {
			log.Printf("Failed to publish conversation title update event: %v", err)
		}
	}

	return nil
}

// AddParticipant adds a user to a conversation
func (s *ConversationService) AddParticipant(ctx context.Context, conversationID, requesterID, newUserID string) error {
	// Verify requester is a participant
	if !s.isUserParticipant(ctx, conversationID, requesterID) {
		return fmt.Errorf("user not authorized to add participants")
	}

	// Check if user is already a participant
	if s.isUserParticipant(ctx, conversationID, newUserID) {
		return fmt.Errorf("user is already a participant")
	}

	participantsCollection := s.db.DB.Collection("participants")

	// Add the new participant
	participantID := fmt.Sprintf("%s:%s", conversationID, newUserID)
	participant := models.Participant{
		ID:             participantID,
		ConversationID: conversationID,
		UserID:         newUserID,
		JoinedAt:       time.Now(),
	}

	_, err := participantsCollection.InsertOne(ctx, participant)
	if err != nil {
		return fmt.Errorf("failed to add participant: %w", err)
	}

	return nil
}

// RemoveParticipant removes a user from a conversation
func (s *ConversationService) RemoveParticipant(ctx context.Context, conversationID, requesterID, targetUserID string) error {
	// Verify requester is a participant
	if !s.isUserParticipant(ctx, conversationID, requesterID) {
		return fmt.Errorf("user not authorized to remove participants")
	}

	// Don't allow removing yourself if you're the last participant
	participantsCollection := s.db.DB.Collection("participants")
	count, err := participantsCollection.CountDocuments(ctx, bson.M{"conversationId": conversationID})
	if err != nil {
		return fmt.Errorf("failed to count participants: %w", err)
	}

	if count <= 1 {
		return fmt.Errorf("cannot remove last participant from conversation")
	}

	// Get participant info before deletion for WebSocket event
	participantID := fmt.Sprintf("%s:%s", conversationID, targetUserID)
	var participant models.Participant
	err = participantsCollection.FindOne(ctx, primitive.M{"_id": participantID}).Decode(&participant)
	if err != nil {
		return fmt.Errorf("participant not found")
	}

	// Get user info for WebSocket event
	user, err := s.userService.GetUserByID(ctx, targetUserID)
	if err != nil {
		return fmt.Errorf("failed to get user info: %w", err)
	}

	// Remove the participant
	result, err := participantsCollection.DeleteOne(ctx, bson.M{"_id": participantID})
	if err != nil {
		return fmt.Errorf("failed to remove participant: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("participant not found")
	}

	// Publish WebSocket event (if NATS is available)
	if s.nats != nil {
		participantUpdateData := &models.WSParticipantUpdateData{
			ConversationID: conversationID,
			UserID:         targetUserID,
			Action:         "removed",
			User:           user,
			UpdatedBy:      requesterID,
		}

		subject := fmt.Sprintf("chat.conv.%s.participants", conversationID)
		if err := s.nats.PublishToSubject(subject, participantUpdateData); err != nil {
			log.Printf("Failed to publish participant removal event: %v", err)
		}
	}

	return nil
}

// isUserParticipant checks if a user is a participant in a conversation
func (s *ConversationService) isUserParticipant(ctx context.Context, conversationID, userID string) bool {
	participantsCollection := s.db.DB.Collection("participants")
	participantID := fmt.Sprintf("%s:%s", conversationID, userID)

	var participant models.Participant
	err := participantsCollection.FindOne(ctx, bson.M{"_id": participantID}).Decode(&participant)
	return err == nil
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
	err = participantsCollection.FindOne(ctx, primitive.M{"_id": participantID}).Decode(&participant)
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