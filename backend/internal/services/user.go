package services

import (
	"context"
	"fmt"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/pkg/database"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type UserService struct {
	db *database.MongoDB
}

func NewUserService(db *database.MongoDB) *UserService {
	return &UserService{db: db}
}

func (s *UserService) UpsertUser(ctx context.Context, user *models.User) error {
	collection := s.db.DB.Collection("users")

	// Simplified approach - just insert or replace
	opts := options.Replace().SetUpsert(true)
	_, err := collection.ReplaceOne(ctx, bson.M{"_id": user.ID}, user, opts)
	if err != nil {
		return fmt.Errorf("failed to upsert user: %w", err)
	}

	return nil
}

func (s *UserService) GetUserByID(ctx context.Context, userID string) (*models.User, error) {
	collection := s.db.DB.Collection("users")

	var user models.User
	err := collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &user, nil
}

func (s *UserService) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	collection := s.db.DB.Collection("users")

	var user models.User
	err := collection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &user, nil
}