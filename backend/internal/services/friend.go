package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/internal/validation"
	"github.com/JohnBPerkins/chat-service/backend/pkg/database"
	"github.com/JohnBPerkins/chat-service/backend/pkg/nats"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type FriendService struct {
	db                 *database.MongoDB
	nats               *nats.NATSConnection
	userService        *UserService
	conversationService *ConversationService
}

func NewFriendService(db *database.MongoDB, natsConn *nats.NATSConnection, userService *UserService, conversationService *ConversationService) *FriendService {
	return &FriendService{
		db:                 db,
		nats:               natsConn,
		userService:        userService,
		conversationService: conversationService,
	}
}

// SendFriendRequest creates a new friend request
func (s *FriendService) SendFriendRequest(ctx context.Context, fromUserID, toUserEmail string) (*models.FriendRequestWithUser, error) {
	// Validate from user ID
	sanitizedFromUserID, err := validation.ValidateUserID(fromUserID)
	if err != nil {
		return nil, fmt.Errorf("invalid from user ID: %w", err)
	}

	// Validate to user email
	sanitizedToUserEmail, err := validation.ValidateEmail(toUserEmail)
	if err != nil {
		return nil, fmt.Errorf("invalid to user email: %w", err)
	}

	// Get the recipient user by email
	toUser, err := s.userService.GetUserByEmail(ctx, sanitizedToUserEmail)
	if err != nil {
		return nil, fmt.Errorf("recipient user not found: %w", err)
	}

	// Can't send friend request to yourself
	if sanitizedFromUserID == toUser.ID {
		return nil, fmt.Errorf("cannot send friend request to yourself")
	}

	// Check if they're already friends
	isFriend, err := s.AreFriends(ctx, sanitizedFromUserID, toUser.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to check friendship status: %w", err)
	}
	if isFriend {
		return nil, fmt.Errorf("users are already friends")
	}

	// Check for existing pending request in either direction
	existingRequest, err := s.GetExistingRequest(ctx, sanitizedFromUserID, toUser.ID)
	if err != nil && err != mongo.ErrNoDocuments {
		return nil, fmt.Errorf("failed to check existing requests: %w", err)
	}
	if existingRequest != nil {
		return nil, fmt.Errorf("friend request already exists")
	}

	collection := s.db.DB.Collection("friend_requests")

	requestID := fmt.Sprintf("%s:%s", sanitizedFromUserID, toUser.ID)
	now := time.Now()

	friendRequest := &models.FriendRequest{
		ID:         requestID,
		FromUserID: sanitizedFromUserID,
		ToUserID:   toUser.ID,
		Status:     "pending",
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	_, err = collection.InsertOne(ctx, friendRequest)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, fmt.Errorf("friend request already exists")
		}
		return nil, fmt.Errorf("failed to create friend request: %w", err)
	}

	// Get from user for response
	fromUser, err := s.userService.GetUserByID(ctx, sanitizedFromUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to get from user: %w", err)
	}

	requestWithUser := &models.FriendRequestWithUser{
		ID:        friendRequest.ID,
		FromUser:  fromUser,
		ToUser:    toUser,
		Status:    friendRequest.Status,
		CreatedAt: friendRequest.CreatedAt,
		UpdatedAt: friendRequest.UpdatedAt,
	}

	// Publish friend request to recipient via NATS
	err = s.PublishFriendRequestReceived(toUser.ID, requestWithUser)
	if err != nil {
		// Log but don't fail - the request was created successfully
		fmt.Printf("Failed to publish friend request: %v\n", err)
	}

	return requestWithUser, nil
}

// RespondToFriendRequest accepts or rejects a friend request
func (s *FriendService) RespondToFriendRequest(ctx context.Context, requestID, responderUserID string, accept bool) (*models.Friendship, error) {
	// Validate inputs
	sanitizedRequestID, err := validation.ValidateUserID(requestID)
	if err != nil {
		return nil, fmt.Errorf("invalid request ID: %w", err)
	}
	sanitizedResponderID, err := validation.ValidateUserID(responderUserID)
	if err != nil {
		return nil, fmt.Errorf("invalid responder user ID: %w", err)
	}

	collection := s.db.DB.Collection("friend_requests")

	// Find the friend request
	filter := primitive.M{"_id": sanitizedRequestID}
	var friendRequest models.FriendRequest
	err = collection.FindOne(ctx, filter).Decode(&friendRequest)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("friend request not found")
		}
		return nil, fmt.Errorf("failed to get friend request: %w", err)
	}

	// Verify the responder is the recipient
	if friendRequest.ToUserID != sanitizedResponderID {
		return nil, fmt.Errorf("you are not the recipient of this friend request")
	}

	// Check if already responded
	if friendRequest.Status != "pending" {
		return nil, fmt.Errorf("friend request already responded to")
	}

	// Update the request status
	newStatus := "rejected"
	if accept {
		newStatus = "accepted"
	}

	update := primitive.M{
		"$set": primitive.M{
			"status":    newStatus,
			"updatedAt": time.Now(),
		},
	}

	_, err = collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return nil, fmt.Errorf("failed to update friend request: %w", err)
	}

	if !accept {
		// Publish rejection event
		err = s.PublishFriendRequestRejected(friendRequest.FromUserID, sanitizedRequestID, sanitizedResponderID)
		if err != nil {
			fmt.Printf("Failed to publish friend request rejection: %v\n", err)
		}
		return nil, nil
	}

	// Create friendship and DM conversation
	friendship, err := s.CreateFriendship(ctx, friendRequest.FromUserID, friendRequest.ToUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to create friendship: %w", err)
	}

	// Get both users for the event
	fromUser, _ := s.userService.GetUserByID(ctx, friendRequest.FromUserID)
	toUser, _ := s.userService.GetUserByID(ctx, friendRequest.ToUserID)

	// Publish acceptance events to both users
	if fromUser != nil {
		err = s.PublishFriendRequestAccepted(friendRequest.FromUserID, friendship, toUser)
		if err != nil {
			fmt.Printf("Failed to publish friend request acceptance to sender: %v\n", err)
		}
	}

	if toUser != nil {
		err = s.PublishFriendRequestAccepted(friendRequest.ToUserID, friendship, fromUser)
		if err != nil {
			fmt.Printf("Failed to publish friend request acceptance to recipient: %v\n", err)
		}
	}

	return friendship, nil
}

// CreateFriendship creates a friendship and associated DM conversation
func (s *FriendService) CreateFriendship(ctx context.Context, user1ID, user2ID string) (*models.Friendship, error) {
	// Ensure consistent ordering for friendship ID
	var smallerID, largerID string
	if user1ID < user2ID {
		smallerID = user1ID
		largerID = user2ID
	} else {
		smallerID = user2ID
		largerID = user1ID
	}

	friendshipID := fmt.Sprintf("%s:%s", smallerID, largerID)

	// Check if friendship already exists
	friendshipCollection := s.db.DB.Collection("friendships")
	filter := primitive.M{"_id": friendshipID}
	var existingFriendship models.Friendship
	err := friendshipCollection.FindOne(ctx, filter).Decode(&existingFriendship)
	if err == nil {
		// Friendship already exists
		return &existingFriendship, nil
	}

	// Create DM conversation
	conversationID := fmt.Sprintf("dm_%s", friendshipID)
	conversation := &models.Conversation{
		ID:            conversationID,
		Kind:          "dm",
		CreatedAt:     time.Now(),
		LastMessageAt: time.Now(),
	}

	conversationCollection := s.db.DB.Collection("conversations")
	_, err = conversationCollection.InsertOne(ctx, conversation)
	if err != nil && !mongo.IsDuplicateKeyError(err) {
		return nil, fmt.Errorf("failed to create conversation: %w", err)
	}

	// Create participants
	participantCollection := s.db.DB.Collection("participants")
	now := time.Now()

	participant1 := &models.Participant{
		ID:             fmt.Sprintf("%s:%s", conversationID, user1ID),
		ConversationID: conversationID,
		UserID:         user1ID,
		Role:           "member",
		JoinedAt:       now,
	}
	participant2 := &models.Participant{
		ID:             fmt.Sprintf("%s:%s", conversationID, user2ID),
		ConversationID: conversationID,
		UserID:         user2ID,
		Role:           "member",
		JoinedAt:       now,
	}

	_, err = participantCollection.InsertOne(ctx, participant1)
	if err != nil && !mongo.IsDuplicateKeyError(err) {
		return nil, fmt.Errorf("failed to create participant 1: %w", err)
	}
	_, err = participantCollection.InsertOne(ctx, participant2)
	if err != nil && !mongo.IsDuplicateKeyError(err) {
		return nil, fmt.Errorf("failed to create participant 2: %w", err)
	}

	// Create friendship record
	friendship := &models.Friendship{
		ID:             friendshipID,
		User1ID:        smallerID,
		User2ID:        largerID,
		ConversationID: conversationID,
		CreatedAt:      now,
	}

	_, err = friendshipCollection.InsertOne(ctx, friendship)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			// Race condition - friendship was created, fetch and return it
			err = friendshipCollection.FindOne(ctx, filter).Decode(&existingFriendship)
			if err != nil {
				return nil, fmt.Errorf("failed to get existing friendship: %w", err)
			}
			return &existingFriendship, nil
		}
		return nil, fmt.Errorf("failed to create friendship: %w", err)
	}

	return friendship, nil
}

// AreFriends checks if two users are friends
func (s *FriendService) AreFriends(ctx context.Context, user1ID, user2ID string) (bool, error) {
	var smallerID, largerID string
	if user1ID < user2ID {
		smallerID = user1ID
		largerID = user2ID
	} else {
		smallerID = user2ID
		largerID = user1ID
	}

	friendshipID := fmt.Sprintf("%s:%s", smallerID, largerID)

	collection := s.db.DB.Collection("friendships")
	filter := primitive.M{"_id": friendshipID}

	var friendship models.Friendship
	err := collection.FindOne(ctx, filter).Decode(&friendship)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

// GetExistingRequest checks for existing friend request in either direction
func (s *FriendService) GetExistingRequest(ctx context.Context, user1ID, user2ID string) (*models.FriendRequest, error) {
	collection := s.db.DB.Collection("friend_requests")

	// Check both directions
	filter := bson.M{
		"$or": []bson.M{
			{"fromUserId": user1ID, "toUserId": user2ID, "status": "pending"},
			{"fromUserId": user2ID, "toUserId": user1ID, "status": "pending"},
		},
	}

	var request models.FriendRequest
	err := collection.FindOne(ctx, filter).Decode(&request)
	if err != nil {
		return nil, err
	}

	return &request, nil
}

// GetFriends returns all friends for a user
func (s *FriendService) GetFriends(ctx context.Context, userID string) ([]models.User, error) {
	sanitizedUserID, err := validation.ValidateUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	collection := s.db.DB.Collection("friendships")
	filter := bson.M{
		"$or": []bson.M{
			{"user1Id": sanitizedUserID},
			{"user2Id": sanitizedUserID},
		},
	}

	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to get friendships: %w", err)
	}
	defer cursor.Close(ctx)

	var friendIDs []string
	for cursor.Next(ctx) {
		var friendship models.Friendship
		if err := cursor.Decode(&friendship); err != nil {
			continue
		}

		// Add the other user's ID
		if friendship.User1ID == sanitizedUserID {
			friendIDs = append(friendIDs, friendship.User2ID)
		} else {
			friendIDs = append(friendIDs, friendship.User1ID)
		}
	}

	// Fetch all friend users
	var friends []models.User
	for _, friendID := range friendIDs {
		user, err := s.userService.GetUserByID(ctx, friendID)
		if err == nil {
			friends = append(friends, *user)
		}
	}

	return friends, nil
}

// GetPendingRequests returns all pending friend requests for a user
func (s *FriendService) GetPendingRequests(ctx context.Context, userID string) ([]*models.FriendRequestWithUser, error) {
	sanitizedUserID, err := validation.ValidateUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	collection := s.db.DB.Collection("friend_requests")
	filter := bson.M{
		"toUserId": sanitizedUserID,
		"status":   "pending",
	}

	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to get friend requests: %w", err)
	}
	defer cursor.Close(ctx)

	var requests []*models.FriendRequestWithUser
	for cursor.Next(ctx) {
		var request models.FriendRequest
		if err := cursor.Decode(&request); err != nil {
			continue
		}

		fromUser, _ := s.userService.GetUserByID(ctx, request.FromUserID)
		toUser, _ := s.userService.GetUserByID(ctx, request.ToUserID)

		requestWithUser := &models.FriendRequestWithUser{
			ID:        request.ID,
			FromUser:  fromUser,
			ToUser:    toUser,
			Status:    request.Status,
			CreatedAt: request.CreatedAt,
			UpdatedAt: request.UpdatedAt,
		}

		requests = append(requests, requestWithUser)
	}

	return requests, nil
}

// NATS publishing methods
func (s *FriendService) PublishFriendRequestReceived(toUserID string, request *models.FriendRequestWithUser) error {
	subject := fmt.Sprintf("chat.user.%s.friend_request", toUserID)

	data := &models.WSFriendRequestReceivedData{
		Request: request,
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal friend request data: %w", err)
	}

	return s.nats.Conn.Publish(subject, dataBytes)
}

func (s *FriendService) PublishFriendRequestAccepted(toUserID string, friendship *models.Friendship, friend *models.User) error {
	subject := fmt.Sprintf("chat.user.%s.friend_accepted", toUserID)

	data := &models.WSFriendRequestAcceptedData{
		Friendship:     friendship,
		ConversationID: friendship.ConversationID,
		Friend:         friend,
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal friend accepted data: %w", err)
	}

	return s.nats.Conn.Publish(subject, dataBytes)
}

func (s *FriendService) PublishFriendRequestRejected(toUserID, requestID, byUserID string) error {
	subject := fmt.Sprintf("chat.user.%s.friend_rejected", toUserID)

	data := &models.WSFriendRequestRejectedData{
		RequestID: requestID,
		ByUserID:  byUserID,
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal friend rejected data: %w", err)
	}

	return s.nats.Conn.Publish(subject, dataBytes)
}
