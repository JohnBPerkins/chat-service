export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  createdAt: string
}

export interface Conversation {
  id: string
  kind: 'dm' | 'group'
  title?: string
  createdAt: string
  lastMessageAt: string
  participants?: Participant[]
  lastMessage?: Message
}

export interface Participant {
  id: string
  conversationId: string
  userId: string
  role: 'member' | 'admin'
  lastReadMessageId?: number
  joinedAt: string
  user?: User
}

export interface Message {
  id: number // Snowflake ID
  conversationId: string
  senderId: string
  clientMsgId: string
  body: string
  createdAt: string
  sender?: User
}

export interface CreateConversationRequest {
  kind: 'dm' | 'group'
  title?: string
  members: string[] // User IDs
}

export interface SendMessageRequest {
  conversationId: string
  clientMsgId: string
  body: string
}

// WebSocket frame types
export interface WSFrame<T = any> {
  type: string
  ts: number
  data: T
}

// Client -> Server frames
export interface AuthFrame {
  jwt: string
}

export interface SubscribeFrame {
  conversationId: string
}

export interface UnsubscribeFrame {
  conversationId: string
}

export interface MessageSendFrame {
  conversationId: string
  clientMsgId: string
  body: string
}

export interface TypingUpdateFrame {
  conversationId: string
  isTyping: boolean
}

export interface ReceiptReadFrame {
  conversationId: string
  messageId: number
}

// Server -> Client frames
export interface MessageAckFrame {
  clientMsgId: string
  id: number
  createdAt: string
}

export interface MessageNewFrame {
  id: number
  conversationId: string
  senderId: string
  body: string
  createdAt: string
}

export interface TypingUpdateEventFrame {
  conversationId: string
  userId: string
  isTyping: boolean
}

export interface ReceiptUpdateFrame {
  conversationId: string
  userId: string
  messageId: number
}

export interface ErrorFrame {
  code: string
  message: string
}

// API Response types
export interface PaginatedMessagesResponse {
  messages: Message[]
  hasMore: boolean
  nextCursor?: string
}

export interface ApiError {
  error: string
  message: string
  code?: string
}