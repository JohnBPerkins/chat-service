package database

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoDB struct {
	Client *mongo.Client
	DB     *mongo.Database
}

func NewMongoDB(uri, dbName string) (*MongoDB, error) {
	// Use longer timeout for Railway deployment
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Configure connection options with retries and timeouts
	clientOptions := options.Client().
		ApplyURI(uri).
		SetMaxPoolSize(10).
		SetMinPoolSize(1).
		SetMaxConnIdleTime(30 * time.Second).
		SetServerSelectionTimeout(20 * time.Second).
		SetConnectTimeout(10 * time.Second)

	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, err
	}

	// Ping the database with extended timeout
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer pingCancel()

	if err = client.Ping(pingCtx, nil); err != nil {
		// Try to disconnect on failure
		client.Disconnect(context.Background())
		return nil, err
	}

	db := client.Database(dbName)

	// Create indexes
	if err := createIndexes(ctx, db); err != nil {
		return nil, err
	}

	return &MongoDB{
		Client: client,
		DB:     db,
	}, nil
}

func (m *MongoDB) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return m.Client.Disconnect(ctx)
}

func createIndexes(ctx context.Context, db *mongo.Database) error {
	// Users collection indexes
	usersCollection := db.Collection("users")
	_, err := usersCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	// Conversations collection indexes
	conversationsCollection := db.Collection("conversations")
	_, err = conversationsCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "lastMessageAt", Value: -1}},
	})
	if err != nil {
		return err
	}

	// Participants collection indexes
	participantsCollection := db.Collection("participants")

	_, err = participantsCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "conversationId", Value: 1}},
	})
	if err != nil {
		return err
	}

	_, err = participantsCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "userId", Value: 1}},
	})
	if err != nil {
		return err
	}

	// Messages collection indexes - critical for performance
	messagesCollection := db.Collection("messages")
	_, err = messagesCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "conversationId", Value: 1},
			{Key: "createdAt", Value: -1},
			{Key: "_id", Value: -1},
		},
	})
	if err != nil {
		return err
	}

	// Unique index for idempotency
	_, err = messagesCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "conversationId", Value: 1},
			{Key: "senderId", Value: 1},
			{Key: "clientMsgId", Value: 1},
		},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	return nil
}