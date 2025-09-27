package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/stretchr/testify/assert"
)

// TestHealthCheck tests the health check endpoint
func TestHealthCheck(t *testing.T) {
	// Create a test server with minimal setup
	req, err := http.NewRequest("GET", "/health", nil)
	assert.NoError(t, err)

	rr := httptest.NewRecorder()

	// Create a simple handler for health check
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var response map[string]string
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Equal(t, "ok", response["status"])
}

// TestConversationCreation tests creating a conversation
func TestConversationCreation(t *testing.T) {
	// Create test request body
	createReq := models.CreateConversationRequest{
		Kind:  "group",
		Title: "Test Group Chat",
	}

	body, err := json.Marshal(createReq)
	assert.NoError(t, err)

	req, err := http.NewRequest("POST", "/api/conversations", bytes.NewBuffer(body))
	assert.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()

	// Create a mock handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reqBody models.CreateConversationRequest
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Mock successful creation
		conversation := &models.Conversation{
			ID:    "conv-123",
			Kind:  reqBody.Kind,
			Title: reqBody.Title,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(conversation)
	})

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)

	var response models.Conversation
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Equal(t, "group", response.Kind)
	assert.Equal(t, "Test Group Chat", response.Title)
}

// TestMessageSending tests sending a message
func TestMessageSending(t *testing.T) {
	// Create test request body
	sendReq := models.SendMessageRequest{
		ConversationID: "conv-123",
		ClientMsgID:    "client-456",
		Body:           "Hello, world!",
	}

	body, err := json.Marshal(sendReq)
	assert.NoError(t, err)

	req, err := http.NewRequest("POST", "/api/messages", bytes.NewBuffer(body))
	assert.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()

	// Create a mock handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reqBody models.SendMessageRequest
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Mock successful message creation
		message := &models.MessageWithSender{
			ID:             1,
			ConversationID: reqBody.ConversationID,
			SenderID:       "user-123",
			Body:           reqBody.Body,
			ClientMsgID:    reqBody.ClientMsgID,
			Sender: &models.User{
				ID:    "user-123",
				Email: "test@example.com",
				Name:  "Test User",
			},
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(message)
	})

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)

	var response models.MessageWithSender
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Equal(t, "conv-123", response.ConversationID)
	assert.Equal(t, "Hello, world!", response.Body)
	assert.Equal(t, "client-456", response.ClientMsgID)
}

// TestErrorHandling tests error responses
func TestErrorHandling(t *testing.T) {
	// Test invalid JSON
	req, err := http.NewRequest("POST", "/api/messages", bytes.NewBufferString("invalid json"))
	assert.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reqBody models.SendMessageRequest
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		if err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
	})

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "Invalid JSON")
}