# Split Server Deployment Guide

The backend is split into two independently deployable services:

## Services

### 1. REST API Server (`cmd/api`)
- **Purpose**: Handles all HTTP REST API endpoints
- **Port**: 8080 (default)
- **Endpoints**:
  - User management (`/v1/me`, `/v1/users/me`)
  - Conversations (`/v1/conversations/*`)
  - Messages (`/v1/messages/*`)
  - Participants management
  - Health check (`/healthz`)

### 2. WebSocket Server (`cmd/ws`)
- **Purpose**: Handles real-time WebSocket connections
- **Port**: 8081 (default)
- **Endpoints**:
  - WebSocket connection (`/ws`)
  - Health check with connection count (`/healthz`)

## Shared Dependencies
Both servers connect to:
- **MongoDB**: Shared database for persistence
- **NATS JetStream**: Message broker for real-time events

## Local Development

### Run with Docker Compose
```bash
# Build and start all services
docker-compose up --build

# Services will be available at:
# - REST API: http://localhost:8080
# - WebSocket: http://localhost:8082 (mapped from 8081)
# - Frontend: http://localhost:3000
```

### Run Individually

#### REST API Server
```bash
cd backend
go run ./cmd/api/main.go
```

Environment variables:
```bash
export PORT=8080
export MONGODB_URI=mongodb://localhost:27017
export DATABASE_NAME=chat_service
export NATS_URL=nats://localhost:4222
export ALLOWED_ORIGINS=http://localhost:3000
```

#### WebSocket Server
```bash
cd backend
go run ./cmd/ws/main.go
```

Environment variables:
```bash
export PORT=8081
export MONGODB_URI=mongodb://localhost:27017
export DATABASE_NAME=chat_service
export NATS_URL=nats://localhost:4222
export ALLOWED_ORIGINS=http://localhost:3000
```

## Production Deployment

### Docker Images

Build separate images:
```bash
# REST API
docker build -f Dockerfile.api -t chat-api:latest .

# WebSocket
docker build -f Dockerfile.ws -t chat-websocket:latest .
```

### Kubernetes Deployment

Each service can be deployed as a separate Kubernetes deployment:

```yaml
# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: chat-api
  template:
    metadata:
      labels:
        app: chat-api
    spec:
      containers:
      - name: api
        image: chat-api:latest
        ports:
        - containerPort: 8080
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: chat-secrets
              key: mongodb-uri
        - name: NATS_URL
          value: "nats://nats:4222"
```

```yaml
# ws-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-websocket
spec:
  replicas: 2
  selector:
    matchLabels:
      app: chat-websocket
  template:
    metadata:
      labels:
        app: chat-websocket
    spec:
      containers:
      - name: websocket
        image: chat-websocket:latest
        ports:
        - containerPort: 8081
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: chat-secrets
              key: mongodb-uri
        - name: NATS_URL
          value: "nats://nats:4222"
```

### Scaling Considerations

**REST API Server**:
- Can be scaled horizontally without issues
- Stateless service
- Use standard load balancer (round-robin)

**WebSocket Server**:
- Can be scaled horizontally
- Uses NATS for message distribution across instances
- Requires sticky sessions OR client-side reconnection logic
- WebSocket connections are stateful but state is shared via NATS

### Health Checks

Both servers provide health check endpoints:

```bash
# REST API
curl http://localhost:8080/healthz
# Response: {"status":"ok","service":"api"}

# WebSocket
curl http://localhost:8081/healthz
# Response: {"status":"ok","service":"websocket","connections":5}
```

## Architecture Benefits

1. **Independent Scaling**: Scale API and WebSocket servers separately based on load
2. **Resource Optimization**: WebSocket servers can have different resource limits (no timeouts)
3. **Deployment Flexibility**: Deploy updates to one service without affecting the other
4. **Cost Efficiency**: Run fewer WebSocket instances if needed
5. **Better Monitoring**: Separate metrics and logs for each service type

## Migration from Monolithic Server

The original monolithic server (`cmd/server`) is still available for backward compatibility but should be migrated to the split architecture for production deployments.
