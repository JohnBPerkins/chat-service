package services

import (
	"testing"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestWebSocketHub_NewWebSocketHub(t *testing.T) {
	messageService := &MessageService{}
	// We'll test without NATS connection for now
	hub := NewWebSocketHub(messageService, nil)

	assert.NotNil(t, hub)
	assert.Equal(t, messageService, hub.messageService)
	assert.NotNil(t, hub.clients)
	assert.NotNil(t, hub.subscriptions)
}

func TestClient_SendFrame(t *testing.T) {
	// Create a client with a buffered channel
	client := &Client{
		ID:   "test-client",
		Send: make(chan *models.WSFrame, 10),
	}

	testData := map[string]interface{}{
		"test": "value",
	}

	// Send a frame
	client.sendFrame("test.message", testData)

	// Verify the frame was sent
	select {
	case frame := <-client.Send:
		assert.Equal(t, "test.message", frame.Type)
		assert.Equal(t, testData, frame.Data)
		assert.NotZero(t, frame.TS)
	case <-time.After(time.Second):
		t.Fatal("Expected frame to be sent but channel was empty")
	}
}

func TestClient_SendError(t *testing.T) {
	// Create a client with a buffered channel
	client := &Client{
		ID:   "test-client",
		Send: make(chan *models.WSFrame, 10),
	}

	// Send an error
	client.sendError("TEST_ERROR", "Test error message")

	// Verify the error frame was sent
	select {
	case frame := <-client.Send:
		assert.Equal(t, "error", frame.Type)

		// Verify the error data
		errorData, ok := frame.Data.(*models.WSErrorData)
		assert.True(t, ok)
		assert.Equal(t, "TEST_ERROR", errorData.Code)
		assert.Equal(t, "Test error message", errorData.Message)
	case <-time.After(time.Second):
		t.Fatal("Expected error frame to be sent but channel was empty")
	}
}

func TestIsExpectedDisconnection(t *testing.T) {
	tests := []struct {
		name     string
		errMsg   string
		expected bool
	}{
		{
			name:     "StatusGoingAway",
			errMsg:   "WebSocket error: status = StatusGoingAway",
			expected: true,
		},
		{
			name:     "StatusNormalClosure",
			errMsg:   "WebSocket error: StatusNormalClosure",
			expected: true,
		},
		{
			name:     "connection closed",
			errMsg:   "connection closed by client",
			expected: true,
		},
		{
			name:     "unexpected error",
			errMsg:   "network timeout",
			expected: false,
		},
		{
			name:     "empty error",
			errMsg:   "",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := &testError{message: tt.errMsg}
			result := isExpectedDisconnection(err)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// testError is a simple error implementation for testing
type testError struct {
	message string
}

func (e *testError) Error() string {
	return e.message
}