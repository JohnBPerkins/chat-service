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

	// Create JetStream context (kept for future use, but not creating streams)
	js, err := jetstream.New(nc)
	if err != nil {
		return nil, fmt.Errorf("failed to create JetStream context: %w", err)
	}

	return &NATSConnection{
		Conn: nc,
		JS:   js,
	}, nil
}

func (nc *NATSConnection) Close() {
	nc.Conn.Close()
}

// PublishMessage publishes a message using regular NATS (ephemeral, no persistence)
// Messages are already persisted in MongoDB, so we only need real-time delivery
func (nc *NATSConnection) PublishMessage(conversationID string, data interface{}) error {
	subject := fmt.Sprintf("chat.conv.%s.msg", conversationID)

	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal message data: %w", err)
	}

	// Use regular NATS publish (ephemeral, no JetStream persistence)
	err = nc.Conn.Publish(subject, jsonData)
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

// PublishToSubject publishes data to a specific NATS subject (ephemeral)
func (nc *NATSConnection) PublishToSubject(subject string, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal data: %w", err)
	}

	// Use regular NATS publish for ephemeral data
	err = nc.Conn.Publish(subject, jsonData)
	if err != nil {
		return fmt.Errorf("failed to publish to subject %s: %w", subject, err)
	}

	return nil
}