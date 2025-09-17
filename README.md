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

## Quick Start with Docker

1. **Clone and setup environment**:
   ```bash
   git clone <your-repo>
   cd chat-service
   cp .env.example .env
   ```

2. **Configure GitHub OAuth**:
   - Go to GitHub → Settings → Developer settings → OAuth Apps
   - Create a new OAuth App with:
     - Homepage URL: `http://localhost:3001`
     - Authorization callback URL: `http://localhost:3001/api/auth/callback/github`
   - Copy the Client ID and Client Secret to your `.env` file

3. **Generate JWT keys** (for production):
   ```bash
   # Generate private key
   openssl genrsa -out private.pem 2048

   # Generate public key
   openssl rsa -in private.pem -pubout -out public.pem

   # Copy public key content to JWT_PUBLIC_KEY_PEM in .env
   cat public.pem
   ```

4. **Start the stack**:
   ```bash
   docker-compose up --build
   ```

5. **Access the application**:
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:8080
   - MongoDB Express: http://localhost:8081 (admin/admin123)
   - NATS Monitoring: http://localhost:8222

## Development

### Local Development (without Docker)

**Prerequisites**:
- Node.js 18+
- Go 1.21+
- MongoDB running on localhost:27017
- NATS server running on localhost:4222

**Frontend**:
```bash
cd frontend
npm install
npm run dev
```

**Backend**:
```bash
cd backend
go mod download
go run cmd/server/main.go
```

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

## Environment Variables

### Frontend (.env.local)
```env
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=your-secret-key
GITHUB_ID=your-github-client-id
GITHUB_SECRET=your-github-client-secret
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

### Backend
```env
PORT=8080
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=chat_service
NATS_URL=nats://localhost:4222
JWT_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----..."
JWT_ISSUER=chat-service
JWT_AUDIENCE=chat-frontend
ALLOWED_ORIGINS=http://localhost:3001
```

## Monitoring & Debugging

- **NATS Monitoring**: http://localhost:8222
- **MongoDB Express**: http://localhost:8081
- **Backend Logs**: `docker-compose logs backend`
- **Frontend Logs**: `docker-compose logs frontend`

## Production Deployment

This stack is designed for easy deployment to:
- **Frontend**: Vercel
- **Backend**: Railway, Google Cloud Run, or AWS ECS
- **Database**: MongoDB Atlas
- **Message Queue**: NATS Cloud or self-hosted NATS

See `DESIGN.md` for detailed production deployment guidelines.

## Testing

Run the full test suite:
```bash
# Backend tests
cd backend && go test ./...

# Frontend tests (if implemented)
cd frontend && npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details