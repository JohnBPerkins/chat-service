package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/JohnBPerkins/chat-service/backend/internal/models"
	"github.com/JohnBPerkins/chat-service/backend/internal/services"
	"github.com/go-chi/chi/v5"
)

type Handlers struct {
	UserService         *services.UserService
	ConversationService *services.ConversationService
	MessageService      *services.MessageService
	WebSocketHub        *services.WebSocketHub
}

func (h *Handlers) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	// TODO: Integrate with NextAuth.js session
	// For now, expect userID as query parameter for testing
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "User ID required as query parameter", http.StatusBadRequest)
		return
	}

	user, err := h.UserService.GetUserByID(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *Handlers) UpsertUser(w http.ResponseWriter, r *http.Request) {
	var user models.User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// User ID should be in the request body
	if user.ID == "" {
		http.Error(w, "User ID required in request body", http.StatusBadRequest)
		return
	}

	// Set created time if not provided
	if user.CreatedAt.IsZero() {
		user.CreatedAt = time.Now()
	}

	if err := h.UserService.UpsertUser(r.Context(), &user); err != nil {
		http.Error(w, "Failed to upsert user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *Handlers) GetConversations(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "User ID required as query parameter", http.StatusBadRequest)
		return
	}

	conversations, err := h.ConversationService.GetUserConversations(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to get conversations", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conversations)
}

func (h *Handlers) CreateConversation(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "User ID required as query parameter", http.StatusBadRequest)
		return
	}

	var req models.CreateConversationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Kind != "dm" && req.Kind != "group" {
		http.Error(w, "Invalid conversation kind", http.StatusBadRequest)
		return
	}

	if len(req.Members) == 0 {
		http.Error(w, "At least one member is required", http.StatusBadRequest)
		return
	}

	conversation, err := h.ConversationService.CreateConversation(r.Context(), &req, userID)
	if err != nil {
		http.Error(w, "Failed to create conversation", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(conversation)
}

func (h *Handlers) DeleteConversation(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "User ID required as query parameter", http.StatusBadRequest)
		return
	}

	conversationID := chi.URLParam(r, "id")
	if conversationID == "" {
		http.Error(w, "Conversation ID is required", http.StatusBadRequest)
		return
	}

	err := h.ConversationService.DeleteConversation(r.Context(), conversationID, userID)
	if err != nil {
		if err.Error() == "user is not a participant in this conversation" {
			http.Error(w, "Access denied", http.StatusForbidden)
			return
		}
		if err.Error() == "only admins can delete conversations" {
			http.Error(w, "Only admins can delete conversations", http.StatusForbidden)
			return
		}
		if err.Error() == "conversation not found" {
			http.Error(w, "Conversation not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete conversation", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) GetMessages(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "User ID required as query parameter", http.StatusBadRequest)
		return
	}

	conversationID := chi.URLParam(r, "id")
	if conversationID == "" {
		http.Error(w, "Conversation ID is required", http.StatusBadRequest)
		return
	}

	// Check if user is participant
	isParticipant, err := h.ConversationService.IsUserParticipant(r.Context(), conversationID, userID)
	if err != nil {
		http.Error(w, "Failed to check participation", http.StatusInternalServerError)
		return
	}
	if !isParticipant {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	// Parse query parameters
	before := r.URL.Query().Get("before")
	limitStr := r.URL.Query().Get("limit")

	limit := 50 // default
	if limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 100 {
			limit = parsedLimit
		}
	}

	response, err := h.MessageService.GetMessages(r.Context(), conversationID, before, limit)
	if err != nil {
		http.Error(w, "Failed to get messages", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *Handlers) SendMessage(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "User ID required as query parameter", http.StatusBadRequest)
		return
	}

	var req models.SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.ConversationID == "" || req.ClientMsgID == "" || req.Body == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	if len(req.Body) > 4000 {
		http.Error(w, "Message body too long", http.StatusBadRequest)
		return
	}

	// Check if user is participant
	isParticipant, err := h.ConversationService.IsUserParticipant(r.Context(), req.ConversationID, userID)
	if err != nil {
		http.Error(w, "Failed to check participation", http.StatusInternalServerError)
		return
	}
	if !isParticipant {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	message, err := h.MessageService.SendMessage(r.Context(), &req, userID)
	if err != nil {
		http.Error(w, "Failed to send message", http.StatusInternalServerError)
		return
	}

	// Update conversation last message timestamp
	go h.ConversationService.UpdateLastMessageAt(r.Context(), req.ConversationID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(message)
}

func (h *Handlers) MarkMessageAsRead(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "User ID required as query parameter", http.StatusBadRequest)
		return
	}

	messageIDStr := chi.URLParam(r, "id")
	if messageIDStr == "" {
		http.Error(w, "Message ID is required", http.StatusBadRequest)
		return
	}

	messageID, err := strconv.ParseInt(messageIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid message ID", http.StatusBadRequest)
		return
	}

	var req models.MarkMessageAsReadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Check if user is participant
	isParticipant, err := h.ConversationService.IsUserParticipant(r.Context(), req.ConversationID, userID)
	if err != nil {
		http.Error(w, "Failed to check participation", http.StatusInternalServerError)
		return
	}
	if !isParticipant {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	err = h.MessageService.MarkMessageAsRead(r.Context(), req.ConversationID, userID, messageID)
	if err != nil {
		http.Error(w, "Failed to mark message as read", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handlers) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// TODO: Integrate with NextAuth.js session validation
	// For now, expect userID as query parameter for testing
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		// Use a default user ID for testing
		userID = "test-user-123"
	}

	h.WebSocketHub.HandleWebSocket(w, r, userID)
}