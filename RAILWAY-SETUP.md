# Railway Deployment Setup Guide

This guide explains how to deploy the split REST API and WebSocket servers to Railway.

## Architecture

The backend is split into two services:
- **REST API Server**: Handles HTTP REST endpoints (port 8080)
- **WebSocket Server**: Handles WebSocket connections (port 8081)

Both services share the same MongoDB and NATS infrastructure.

## Railway Setup Steps

### 1. Create API Service

In your Railway project:

1. Click **"New Service"**
2. Select your GitHub repository
3. **Service Name**: `chat-api`
4. **Configuration File**: `railway-api.toml`
5. **Environment Variables**:
   ```
   MONGODB_URI=<your-mongodb-connection-string>
   DATABASE_NAME=chat_service
   NATS_URL=<your-nats-url>
   ALLOWED_ORIGINS=https://your-frontend-domain.com
   ```

### 2. Create WebSocket Service

In the same Railway project:

1. Click **"New Service"**
2. Select your GitHub repository (same repo)
3. **Service Name**: `chat-websocket`
4. **Configuration File**: `railway-ws.toml`
5. **Environment Variables**:
   ```
   MONGODB_URI=<your-mongodb-connection-string>
   DATABASE_NAME=chat_service
   NATS_URL=<your-nats-url>
   ALLOWED_ORIGINS=https://your-frontend-domain.com
   ```

### 3. Update Frontend Environment Variables

Once both services are deployed, Railway will generate public URLs for each:

- API URL: `https://chat-api-production.up.railway.app`
- WebSocket URL: `wss://chat-websocket-production.up.railway.app`

Update your frontend service environment variables:
```
NEXT_PUBLIC_API_BASE_URL=https://chat-api-production.up.railway.app
NEXT_PUBLIC_WS_URL=wss://chat-websocket-production.up.railway.app
```

**Important**: Use `wss://` (not `ws://`) for the WebSocket URL in production.

### 4. Configure CORS

Make sure both services have the frontend domain in `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://your-other-domain.com
```

Multiple origins should be comma-separated.

## Service Configuration

### railway-api.toml
- Sets `dockerContext = "backend"` to use backend directory as build context
- Builds from `Dockerfile.api` (relative to backend directory)
- Runs the REST API server
- Health check at `/healthz`
- Default port: 8080

### railway-ws.toml
- Sets `dockerContext = "backend"` to use backend directory as build context
- Builds from `Dockerfile.ws` (relative to backend directory)
- Runs the WebSocket server
- Health check at `/healthz` (includes connection count)
- Default port: 8081

**Note**: The `dockerContext` setting tells Railway to change to the `backend/` directory before building, so Dockerfile paths are relative to that context.

## Monitoring

Both services expose health check endpoints:

### API Health Check
```bash
curl https://chat-api-production.up.railway.app/healthz
# Response: {"status":"ok","service":"api"}
```

### WebSocket Health Check
```bash
curl https://chat-websocket-production.up.railway.app/healthz
# Response: {"status":"ok","service":"websocket","connections":42}
```

## Shared Services

Both API and WebSocket services need access to:

### MongoDB
- Create a MongoDB service in Railway or use MongoDB Atlas
- Set the `MONGODB_URI` environment variable in both services
- Format: `mongodb://user:password@host:port/database`

### NATS
- Create a NATS service in Railway
- Set the `NATS_URL` environment variable in both services
- Format: `nats://host:4222`

## Scaling

Railway allows you to scale each service independently:

**API Server**:
- Can scale horizontally without issues (stateless)
- Recommended: Start with 1-2 instances
- Scale up based on HTTP request load

**WebSocket Server**:
- Can scale horizontally (NATS handles message distribution)
- Recommended: Start with 1-2 instances
- Scale up based on concurrent WebSocket connections
- Each instance can handle thousands of connections

## Cost Optimization

Benefits of the split architecture:
1. Scale services independently based on actual load
2. WebSocket server can use different resource limits
3. Deploy updates to one service without restarting the other
4. Run fewer WebSocket instances if connections are low

## Troubleshooting

### API Service Not Starting
- Check MongoDB connection string in environment variables
- Verify NATS is running and accessible
- Check logs: `railway logs` in Railway CLI

### WebSocket Connections Failing
- Ensure frontend is using `wss://` (not `ws://`)
- Verify CORS allows your frontend domain
- Check that NATS is running (WebSocket needs it for pub/sub)
- Verify MongoDB connection (WebSocket needs it for user/message data)

### Both Services Need to Talk to Each Other?
They don't! Both services communicate through:
- **MongoDB**: Shared persistent state
- **NATS**: Real-time message distribution

This means they can be deployed completely independently.

## Migration from Monolithic Server

If you're currently running the monolithic server (`cmd/server`):

1. Deploy both new services (API + WebSocket)
2. Update frontend environment variables to point to new services
3. Test thoroughly
4. Once confirmed working, remove the old monolithic service
5. The old `railway.toml` and `Dockerfile.railway` can be kept as backup

## Rollback Plan

If you need to rollback to the monolithic server:

1. Keep the old monolithic Railway service
2. Update frontend to point back to monolithic server:
   ```
   NEXT_PUBLIC_API_BASE_URL=https://old-backend.up.railway.app
   NEXT_PUBLIC_WS_URL=wss://old-backend.up.railway.app
   ```
3. The monolithic server (`cmd/server`) still works and is maintained
