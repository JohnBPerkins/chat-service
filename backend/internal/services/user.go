package services

import (
	"context"
	"fmt"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/internal/validation"
	"github.com/JohnBPerkins/chat-service/backend/pkg/database"
	"go.mongodb.org/mongo-driver/bson/primitive"
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
	// Validate user ID
	if err := validation.ValidateUserID(user.ID); err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	// Validate email
	if err := validation.ValidateEmail(user.Email); err != nil {
		return fmt.Errorf("invalid email: %w", err)
	}

	// Sanitize user name
	sanitizedName, err := validation.SanitizeString(user.Name, 100)
	if err != nil {
		return fmt.Errorf("invalid name: %w", err)
	}
	user.Name = sanitizedName

	collection := s.db.DB.Collection("users")

	// Use primitive.M for type safety instead of bson.M
	filter := primitive.M{"_id": user.ID}
	opts := options.Replace().SetUpsert(true)
	_, err = collection.ReplaceOne(ctx, filter, user, opts)
	if err != nil {
		return fmt.Errorf("failed to upsert user: %w", err)
	}

	return nil
}

func (s *UserService) GetUserByID(ctx context.Context, userID string) (*models.User, error) {
	// Validate user ID before query
	if err := validation.ValidateUserID(userID); err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	collection := s.db.DB.Collection("users")

	// Use primitive.M for type safety
	filter := primitive.M{"_id": userID}
	var user models.User
	err := collection.FindOne(ctx, filter).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &user, nil
}

func (s *UserService) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	// Validate email before query
	if err := validation.ValidateEmail(email); err != nil {
		return nil, fmt.Errorf("invalid email: %w", err)
	}

	collection := s.db.DB.Collection("users")

	// Use primitive.M for type safety
	filter := primitive.M{"email": email}
	var user models.User
	err := collection.FindOne(ctx, filter).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &user, nil
}