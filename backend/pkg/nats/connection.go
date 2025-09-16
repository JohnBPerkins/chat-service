package nats

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type NATSConnection struct {
	Conn *nats.Conn
	JS   jetstream.JetStream
}

func NewConnection(url string) (*NATSConnection, error) {
	// Connect to NATS
	nc, err := nats.Connect(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	// Create JetStream context
	js, err := jetstream.New(nc)
	if err != nil {
		return nil, fmt.Errorf("failed to create JetStream context: %w", err)
	}

	// Create or update the CHAT stream
	if err := createChatStream(js); err != nil {
		return nil, fmt.Errorf("failed to create CHAT stream: %w", err)
	}

	return &NATSConnection{
		Conn: nc,
		JS:   js,
	}, nil
}

func (nc *NATSConnection) Close() {
	nc.Conn.Close()
}

func createChatStream(js jetstream.JetStream) error {
	streamConfig := jetstream.StreamConfig{
		Name:        "CHAT",
		Description: "Chat messages stream",
		Subjects:    []string{"chat.conv.*.msg"},
		Storage:     jetstream.FileStorage,
		MaxAge:      0, // Keep messages indefinitely
		MaxBytes:    1024 * 1024 * 1024, // 1GB max
		MaxMsgs:     -1, // No message limit
		Replicas:    1,
	}

	// Try to create stream, if it exists, update it
	ctx := context.Background()
	_, err := js.CreateStream(ctx, streamConfig)
	if err != nil {
		// If stream already exists, try to update it
		if err.Error() == "stream name already in use" {
			_, err = js.UpdateStream(ctx, streamConfig)
			if err != nil {
				return fmt.Errorf("failed to update stream: %w", err)
			}
			log.Println("Updated existing CHAT stream")
		} else {
			return fmt.Errorf("failed to create stream: %w", err)
		}
	} else {
		log.Println("Created CHAT stream")
	}

	return nil
}

// PublishMessage publishes a message to the appropriate JetStream subject
func (nc *NATSConnection) PublishMessage(conversationID string, data interface{}) error {
	subject := fmt.Sprintf("chat.conv.%s.msg", conversationID)

	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal message data: %w", err)
	}

	ctx := context.Background()
	_, err = nc.JS.Publish(ctx, subject, jsonData)
	if err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}

	return nil
}

// PublishTyping publishes a typing indicator (ephemeral)
func (nc *NATSConnection) PublishTyping(conversationID string, data interface{}) error {
	subject := fmt.Sprintf("chat.conv.%s.typing", conversationID)

	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal typing data: %w", err)
	}

	// Use regular NATS publish for ephemeral data
	err = nc.Conn.Publish(subject, jsonData)
	if err != nil {
		return fmt.Errorf("failed to publish typing indicator: %w", err)
	}

	return nil
}

// PublishPresence publishes presence information (ephemeral)
func (nc *NATSConnection) PublishPresence(conversationID string, data interface{}) error {
	subject := fmt.Sprintf("chat.conv.%s.presence", conversationID)

	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal presence data: %w", err)
	}

	// Use regular NATS publish for ephemeral data
	err = nc.Conn.Publish(subject, jsonData)
	if err != nil {
		return fmt.Errorf("failed to publish presence: %w", err)
	}

	return nil
}