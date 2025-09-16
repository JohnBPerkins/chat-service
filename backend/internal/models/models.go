package models

import (
	"time"
)

// User represents a user in the system
type User struct {
	ID        string    `bson:"_id" json:"id"`
	Email     string    `bson:"email" json:"email"`
	Name      string    `bson:"name" json:"name"`
	AvatarURL string    `bson:"avatarUrl,omitempty" json:"avatarUrl,omitempty"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}

// Conversation represents a chat conversation
type Conversation struct {
	ID            string    `bson:"_id" json:"id"`
	Kind          string    `bson:"kind" json:"kind"` // "dm" or "group"
	Title         string    `bson:"title,omitempty" json:"title,omitempty"`
	CreatedAt     time.Time `bson:"createdAt" json:"createdAt"`
	LastMessageAt time.Time `bson:"lastMessageAt" json:"lastMessageAt"`
}

// ConversationWithParticipants represents a conversation with populated participant info for API responses
type ConversationWithParticipants struct {
	ID            string    `json:"id"`
	Kind          string    `json:"kind"`
	Title         string    `json:"title,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	LastMessageAt time.Time `json:"lastMessageAt"`
	Participants  []User    `json:"participants"`
}

// Participant represents a user's participation in a conversation
type Participant struct {
	ID                 string    `bson:"_id" json:"id"` // Format: "conversationId:userId"
	ConversationID     string    `bson:"conversationId" json:"conversationId"`
	UserID             string    `bson:"userId" json:"userId"`
	Role               string    `bson:"role" json:"role"` // "member" or "admin"
	LastReadMessageID  int64     `bson:"lastReadMessageId,omitempty" json:"lastReadMessageId,omitempty"`
	JoinedAt           time.Time `bson:"joinedAt" json:"joinedAt"`
}

// Message represents a chat message
type Message struct {
	ID             int64     `bson:"_id" json:"id"` // Snowflake ID
	ConversationID string    `bson:"conversationId" json:"conversationId"`
	SenderID       string    `bson:"senderId" json:"senderId"`
	ClientMsgID    string    `bson:"clientMsgId" json:"clientMsgId"`
	Body           string    `bson:"body" json:"body"`
	CreatedAt      time.Time `bson:"createdAt" json:"createdAt"`
}

// MessageWithSender represents a message with populated sender info for API responses
type MessageWithSender struct {
	ID             int64     `json:"id"`
	ConversationID string    `json:"conversationId"`
	SenderID       string    `json:"senderId"`
	ClientMsgID    string    `json:"clientMsgId"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"createdAt"`
	Sender         *User     `json:"sender,omitempty"`
}

// CreateConversationRequest represents the request to create a new conversation
type CreateConversationRequest struct {
	Kind    string   `json:"kind"`    // "dm" or "group"
	Title   string   `json:"title,omitempty"`
	Members []string `json:"members"` // List of user emails or IDs
}

// SendMessageRequest represents the request to send a message
type SendMessageRequest struct {
	ConversationID string `json:"conversationId"`
	ClientMsgID    string `json:"clientMsgId"`
	Body           string `json:"body"`
}

// MarkMessageAsReadRequest represents the request to mark a message as read
type MarkMessageAsReadRequest struct {
	ConversationID string `json:"conversationId"`
}

// WebSocket frame types
type WSFrame struct {
	Type string      `json:"type"`
	TS   int64       `json:"ts"`
	Data interface{} `json:"data"`
}

// WebSocket message types
type WSAuthData struct {
	JWT string `json:"jwt"`
}

type WSSubscribeData struct {
	ConversationID string `json:"conversationId"`
}

type WSUnsubscribeData struct {
	ConversationID string `json:"conversationId"`
}

type WSMessageSendData struct {
	ConversationID string `json:"conversationId"`
	ClientMsgID    string `json:"clientMsgId"`
	Body           string `json:"body"`
}

type WSTypingUpdateData struct {
	ConversationID string `json:"conversationId"`
	IsTyping       bool   `json:"isTyping"`
}

type WSReceiptReadData struct {
	ConversationID string `json:"conversationId"`
	MessageID      int64  `json:"messageId"`
}

// WebSocket response types
type WSMessageAckData struct {
	ClientMsgID string    `json:"clientMsgId"`
	ID          int64     `json:"id"`
	CreatedAt   time.Time `json:"createdAt"`
}

type WSMessageNewData struct {
	ID             int64     `json:"id"`
	ConversationID string    `json:"conversationId"`
	SenderID       string    `json:"senderId"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"createdAt"`
	Sender         *User     `json:"sender,omitempty"`
}

type WSTypingUpdateEventData struct {
	ConversationID string `json:"conversationId"`
	UserID         string `json:"userId"`
	IsTyping       bool   `json:"isTyping"`
}

type WSReceiptUpdateData struct {
	ConversationID string `json:"conversationId"`
	UserID         string `json:"userId"`
	MessageID      int64  `json:"messageId"`
}

type WSErrorData struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Pagination types
type PaginatedMessagesResponse struct {
	Messages   []MessageWithSender `json:"messages"`
	HasMore    bool                `json:"hasMore"`
	NextCursor string              `json:"nextCursor,omitempty"`
}