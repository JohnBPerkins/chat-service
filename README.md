# Chat Service

<!-- ** 🔗 Live Demo: https://chatservicefront.vercel.app/ ** -->

A real-time chat application with a Next.js frontend and Go backend, featuring WebSocket communication, MongoDB persistence, and NATS JetStream for scalable message distribution.

## Features

- 🔐 GitHub OAuth authentication
- 💬 Real-time messaging via WebSockets
- 📱 Direct messages and group conversations
- ⚡ Typing indicators and read receipts
- 📄 Cursor-based message pagination
- 🚀 Horizontally scalable architecture
- 🛡️ Rate limiting and security middleware

## Architecture

- **Frontend**: Next.js 15 with TypeScript, TanStack Query, NextAuth
- **Backend**: Go with Chi router, MongoDB, NATS JetStream
- **Database**: MongoDB with optimized indexes
- **Message Queue**: NATS JetStream for durable message distribution

### API Endpoints

**Authentication**: All API endpoints require `Authorization: Bearer <jwt-token>`

**REST API**:
- `GET /healthz` - Health check
- `GET /v1/me` - Get current user
- `PUT /v1/users/me` - Update current user
- `GET /v1/conversations` - List user's conversations
- `POST /v1/conversations` - Create new conversation
- `GET /v1/conversations/{id}/messages` - Get messages with pagination
- `POST /v1/messages` - Send message (fallback)
- `POST /v1/messages/{id}/read` - Mark message as read

**WebSocket**: `/ws`
- Supports real-time messaging, typing indicators, and read receipts
- Uses JWT authentication via query parameter or header

### WebSocket Protocol

**Client → Server**:
```json
{
  "type": "subscribe",
  "ts": 1694821200000,
  "data": { "conversationId": "uuid" }
}

{
  "type": "message.send",
  "ts": 1694821200000,
  "data": {
    "conversationId": "uuid",
    "clientMsgId": "uuid",
    "body": "Hello world!"
  }
}
```

**Server → Client**:
```json
{
  "type": "message.new",
  "ts": 1694821200000,
  "data": {
    "id": 1234567890123,
    "conversationId": "uuid",
    "senderId": "uuid",
    "body": "Hello world!",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

## Production Deployment

This stack is designed for easy deployment to:
- **Frontend**: Vercel
- **Backend**: Railway, Google Cloud Run, or AWS ECS
- **Database**: MongoDB Atlas
- **Message Queue**: NATS Cloud or self-hosted NATS
