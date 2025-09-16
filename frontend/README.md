# Chat Service Frontend

A modern real-time chat application frontend built with Next.js, featuring OAuth authentication, WebSocket messaging, typing indicators, read receipts, and infinite scroll pagination.

## Architecture

This frontend is designed to work with the Chat Service backend as specified in [DESIGN.md](../DESIGN.md). It implements:

- **Next.js App Router**: Modern React framework with App Router for optimal performance
- **NextAuth**: OAuth authentication with GitHub/Google providers
- **WebSocket**: Real-time messaging with automatic reconnection
- **React Query**: Server state management with optimistic updates
- **Infinite Scrolling**: Cursor-based pagination for message history
- **Typing Indicators**: Real-time typing status for enhanced UX
- **Read Receipts**: Message read status tracking

## Features

### Authentication
- OAuth login with GitHub and Google
- JWT token management with automatic refresh
- Protected routes with middleware
- Graceful session handling

### Real-time Messaging
- WebSocket connection with auto-reconnection
- Optimistic message sending with fallback to HTTP
- Message acknowledgments and error handling
- Connection status indicators

### User Experience
- Responsive design with Tailwind CSS
- Dark/light mode ready
- Typing indicators with debouncing
- Read receipt tracking
- Infinite scroll for message history
- Loading states and error boundaries

### Performance
- Cursor-based pagination (no offset/limit issues)
- Virtual scrolling ready (react-virtual compatible)
- Optimized bundle with dynamic imports
- Efficient re-renders with React Query

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Authentication**: NextAuth.js
- **State Management**: TanStack Query (React Query)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **WebSockets**: Native WebSocket API
- **TypeScript**: Full type safety
- **Date Handling**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Backend API running (see [backend documentation](../backend/README.md))

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   Copy `.env.local` and configure:
   ```bash
   # NextAuth Configuration
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-secret-key-here

   # OAuth Providers
   GITHUB_ID=your-github-client-id
   GITHUB_SECRET=your-github-client-secret
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret

   # API Configuration
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
   NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8080
   ```

3. **OAuth Provider Setup**

   **GitHub OAuth App:**
   1. Go to GitHub Settings > Developer settings > OAuth Apps
   2. Create new OAuth App
   3. Set Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

   **Google OAuth:**
   1. Go to Google Cloud Console
   2. Create OAuth 2.0 credentials
   3. Set authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (NextAuth)
│   ├── auth/              # Authentication pages
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── chat-layout.tsx    # Main chat interface
│   ├── conversation-list.tsx
│   ├── message-view.tsx
│   ├── new-conversation-modal.tsx
│   ├── providers.tsx      # Context providers
│   └── typing-indicator.tsx
├── hooks/                 # Custom React hooks
│   ├── use-intersection-observer.ts
│   ├── use-paginated-messages.ts
│   ├── use-read-receipts.ts
│   ├── use-typing.ts
│   └── use-websocket.ts
├── lib/                   # Utilities
│   ├── api.ts            # HTTP API client
│   ├── auth.ts           # NextAuth configuration
│   └── websocket.ts      # WebSocket client
├── types/                 # TypeScript definitions
│   ├── chat.ts           # Chat-related types
│   └── next-auth.d.ts    # NextAuth type extensions
└── middleware.ts          # Route protection
```

## API Integration

### HTTP API
The frontend communicates with the backend via REST API for:
- User management (`/v1/users/me`)
- Conversation CRUD (`/v1/conversations`)
- Message history (`/v1/conversations/:id/messages`)
- Fallback message sending (`/v1/messages`)

### WebSocket Protocol
Real-time features use WebSocket with frame-based protocol:

**Client → Server:**
- `subscribe` - Join conversation
- `message.send` - Send message
- `typing.update` - Typing status
- `receipt.read` - Mark as read

**Server → Client:**
- `message.new` - New message received
- `message.ack` - Message acknowledged
- `typing.update` - User typing status
- `receipt.update` - Read receipt
- `error` - Error occurred

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXTAUTH_URL` | Application URL | `https://chat.example.com` |
| `NEXTAUTH_SECRET` | Session encryption key | `random-secret-key` |
| `GITHUB_ID` | GitHub OAuth client ID | `abc123...` |
| `GITHUB_SECRET` | GitHub OAuth secret | `secret123...` |
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | `https://api.example.com` |
| `NEXT_PUBLIC_WS_BASE_URL` | WebSocket URL | `wss://api.example.com` |

## Key Features Implementation

### Real-time Messaging
- WebSocket connection with JWT authentication via subprotocol
- Automatic reconnection with exponential backoff
- Message queuing during disconnection
- Optimistic updates with fallback to HTTP API

### Infinite Scroll Pagination
- Cursor-based pagination using message timestamps
- Intersection Observer for scroll detection
- Efficient loading of message history
- Maintains scroll position during new message loads

### Typing Indicators
- Debounced typing events (max 1 per second)
- Automatic cleanup after 3 seconds of inactivity
- Multi-user typing display with smart text formatting

### Read Receipts
- Automatic marking of last visible message as read
- Real-time read status updates
- Per-conversation read tracking

## Deployment

### Vercel (Recommended)
1. Connect GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Set OAuth callback URLs to production domain
4. Deploy automatically on git push

### Manual Deployment
```bash
npm run build
npm start
```

## Contributing

1. Follow TypeScript strict mode
2. Add proper error handling
3. Include loading states
4. Test WebSocket edge cases
5. Maintain responsive design
6. Document complex logic

## License

MIT License - see LICENSE file for details.