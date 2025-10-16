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

// FriendRequest represents a friend request between users
type FriendRequest struct {
	ID          string    `bson:"_id" json:"id"` // Format: "fromUserId:toUserId"
	FromUserID  string    `bson:"fromUserId" json:"fromUserId"`
	ToUserID    string    `bson:"toUserId" json:"toUserId"`
	Status      string    `bson:"status" json:"status"` // "pending", "accepted", "rejected"
	CreatedAt   time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time `bson:"updatedAt" json:"updatedAt"`
}

// FriendRequestWithUser represents a friend request with populated user info
type FriendRequestWithUser struct {
	ID        string    `json:"id"`
	FromUser  *User     `json:"fromUser,omitempty"`
	ToUser    *User     `json:"toUser,omitempty"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Friendship represents an accepted friendship between two users
type Friendship struct {
	ID               string    `bson:"_id" json:"id"` // Format: smaller_userId:larger_userId
	User1ID          string    `bson:"user1Id" json:"user1Id"`
	User2ID          string    `bson:"user2Id" json:"user2Id"`
	ConversationID   string    `bson:"conversationId" json:"conversationId"` // DM conversation ID
	CreatedAt        time.Time `bson:"createdAt" json:"createdAt"`
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
	ID             int64      `bson:"_id" json:"id"` // Snowflake ID
	ConversationID string     `bson:"conversationId" json:"conversationId"`
	SenderID       string     `bson:"senderId" json:"senderId"`
	ClientMsgID    string     `bson:"clientMsgId" json:"clientMsgId"`
	Body           string     `bson:"body" json:"body"`
	CreatedAt      time.Time  `bson:"createdAt" json:"createdAt"`
	EditedAt       *time.Time `bson:"editedAt,omitempty" json:"editedAt,omitempty"`
}

// MessageWithSender represents a message with populated sender info for API responses
type MessageWithSender struct {
	ID             int64      `json:"id"`
	ConversationID string     `json:"conversationId"`
	SenderID       string     `json:"senderId"`
	ClientMsgID    string     `json:"clientMsgId"`
	Body           string     `json:"body"`
	CreatedAt      time.Time  `json:"createdAt"`
	EditedAt       *time.Time `json:"editedAt,omitempty"`
	Sender         *User      `json:"sender,omitempty"`
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
	SendTime       int64  `json:"sendTime,omitempty"` // Client timestamp for end-to-end latency measurement
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
	SendTime       int64  `json:"sendTime,omitempty"` // Client timestamp for end-to-end latency measurement
}

type WSMessageEditData struct {
	ConversationID string `json:"conversationId"`
	MessageID      int64  `json:"messageId"`
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

// Friend request WebSocket types
type WSFriendRequestSendData struct {
	ToUserEmail string `json:"toUserEmail"`
}

type WSFriendRequestRespondData struct {
	RequestID string `json:"requestId"`
	Accept    bool   `json:"accept"`
}

type WSFriendRemoveData struct {
	FriendID string `json:"friendId"`
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
	ClientMsgID    string    `json:"clientMsgId"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"createdAt"`
	Sender         *User     `json:"sender,omitempty"`
	SendTime       int64     `json:"sendTime,omitempty"` // Client timestamp for end-to-end latency measurement
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

type WSMessageDeletedData struct {
	ID             int64  `json:"id"`
	ConversationID string `json:"conversationId"`
	DeletedBy      string `json:"deletedBy"`
}

type WSMessageEditedData struct {
	ID             int64     `json:"id"`
	ConversationID string    `json:"conversationId"`
	Body           string    `json:"body"`
	EditedAt       time.Time `json:"editedAt"`
	EditedBy       string    `json:"editedBy"`
}

type WSParticipantUpdateData struct {
	ConversationID string `json:"conversationId"`
	UserID         string `json:"userId"`
	Action         string `json:"action"` // "added" or "removed"
	User           *User  `json:"user,omitempty"`
	UpdatedBy      string `json:"updatedBy"`
}

type WSConversationUpdateData struct {
	ConversationID string `json:"conversationId"`
	Title          string `json:"title,omitempty"`
	UpdateType     string `json:"updateType"` // "title", "image", etc.
	UpdatedBy      string `json:"updatedBy"`
}

type WSErrorData struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Friend request WebSocket events
type WSFriendRequestReceivedData struct {
	Request *FriendRequestWithUser `json:"request"`
}

type WSFriendRequestAcceptedData struct {
	Friendship     *Friendship `json:"friendship"`
	ConversationID string      `json:"conversationId"`
	Friend         *User       `json:"friend"`
}

type WSFriendRequestRejectedData struct {
	RequestID string `json:"requestId"`
	ByUserID  string `json:"byUserId"`
}

type WSFriendRemovedData struct {
	FriendID       string `json:"friendId"`
	ConversationID string `json:"conversationId"`
}

type WSConversationAddedData struct {
	Conversation *Conversation `json:"conversation"`
	AddedBy      string        `json:"addedBy"`
}

type WSConversationRemovedData struct {
	ConversationID string `json:"conversationId"`
	RemovedBy      string `json:"removedBy"`
}

// Pagination types
type PaginatedMessagesResponse struct {
	Messages   []MessageWithSender `json:"messages"`
	HasMore    bool                `json:"hasMore"`
	NextCursor string              `json:"nextCursor,omitempty"`
}

// Conversation management types
type UpdateConversationTitleRequest struct {
	Title string `json:"title"`
}

type AddParticipantRequest struct {
	UserID string `json:"userId"`
}

type ParticipantsResponse struct {
	Participants []User `json:"participants"`
}