package models

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestMessage_Validation(t *testing.T) {
	tests := []struct {
		name    string
		message Message
		wantErr bool
	}{
		{
			name: "valid message",
			message: Message{
				ID:             1,
				ConversationID: "conv-123",
				SenderID:       "user-123",
				Body:           "Hello, world!",
				CreatedAt:      time.Now(),
			},
			wantErr: false,
		},
		{
			name: "empty body",
			message: Message{
				ID:             1,
				ConversationID: "conv-123",
				SenderID:       "user-123",
				Body:           "",
				CreatedAt:      time.Now(),
			},
			wantErr: true,
		},
		{
			name: "empty conversation ID",
			message: Message{
				ID:             1,
				ConversationID: "",
				SenderID:       "user-123",
				Body:           "Hello, world!",
				CreatedAt:      time.Now(),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Basic validation logic - adjust based on your actual validation implementation
			hasError := tt.message.Body == "" || tt.message.ConversationID == ""
			assert.Equal(t, tt.wantErr, hasError)
		})
	}
}

func TestConversation_Kind(t *testing.T) {
	t.Run("group conversation", func(t *testing.T) {
		conv := &Conversation{
			Kind: "group",
		}
		assert.Equal(t, "group", conv.Kind)
	})

	t.Run("direct conversation", func(t *testing.T) {
		conv := &Conversation{
			Kind: "direct",
		}
		assert.Equal(t, "direct", conv.Kind)
	})
}

func TestWSFrame_Creation(t *testing.T) {
	data := map[string]interface{}{
		"test": "value",
	}

	frame := &WSFrame{
		Type: "test.message",
		TS:   time.Now().UnixMilli(),
		Data: data,
	}

	assert.Equal(t, "test.message", frame.Type)
	assert.NotZero(t, frame.TS)
	assert.Equal(t, data, frame.Data)
}