# Railway Deployment Guide

This guide will help you deploy the chat service backend to Railway.

## Prerequisites

1. A Railway account (sign up at https://railway.app)
2. Railway CLI installed (optional but recommended)
3. Git repository with your code

## Step 1: Install Railway CLI (Optional)

```bash
# macOS
brew install railway

# Windows (with Scoop)
scoop install railway

# Or download from https://docs.railway.app/develop/cli
```

## Step 2: Login to Railway

```bash
railway login
```

## Step 3: Deploy the Backend

### Option A: Using Railway Dashboard

1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway will auto-detect the Dockerfile and deploy

### Option B: Using Railway CLI

1. From your project root directory:
   ```bash
   railway project create chat-service-backend
   ```

2. Deploy the backend:
   ```bash
   railway up
   ```

## Step 4: Add Database Services

### MongoDB
1. In your Railway project dashboard
2. Click "New Service"
3. Select "Database" → "MongoDB"
4. Railway will provision a MongoDB instance

### NATS (Optional - for WebSocket features)
1. Click "New Service"
2. Select "Docker Image"
3. Use image: `nats:latest`
4. Set command: `nats-server --jetstream`

## Step 5: Configure Environment Variables

In your Railway project, go to the Variables tab and add:

### Required Variables:
- `PORT`: Railway auto-sets this, but you can verify it's available
- `MONGODB_URI`: Available from your MongoDB service (format: `mongodb://user:pass@host:port/dbname`)
- `DATABASE_NAME`: `chat_service` (or your preferred name)
- `NATS_URL`: If using NATS service, get from NATS service variables
- `ALLOWED_ORIGINS`: Your frontend URL (e.g., `https://your-app.vercel.app`)

### Example Variable Values:
```
PORT=8080
MONGODB_URI=mongodb://mongo:password@roundhouse.proxy.rlwy.net:12345/railway
DATABASE_NAME=chat_service
NATS_URL=nats://nats.railway.internal:4222
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:3000
```

## Step 6: Configure Custom Domains (Optional)

1. In your Railway project dashboard
2. Go to "Settings" → "Domains"
3. Add a custom domain or use the Railway-provided domain
4. Update your frontend's `NEXT_PUBLIC_API_BASE_URL` to use this domain

## Step 7: Test the Deployment

Once deployed, Railway will provide a URL. Test your endpoints:

- Health check: `https://your-railway-app.railway.app/healthz`
- API base: `https://your-railway-app.railway.app/v1/`

## Step 8: Update Frontend Configuration

Update your Vercel environment variables:

```
NEXT_PUBLIC_API_BASE_URL=https://your-railway-app.railway.app
NEXT_PUBLIC_WS_BASE_URL=wss://your-railway-app.railway.app
```

## Production Optimizations

### Dockerfile Features
- **Multi-stage build**: Smaller final image (~20MB vs ~1GB)
- **Non-root user**: Enhanced security
- **Health checks**: Automatic restart on failure
- **Alpine Linux**: Minimal attack surface

### Railway Configuration
- **Auto-restart**: On failure with retry policy
- **Resource limits**: Configurable CPU/memory
- **Auto-scaling**: Based on traffic (Pro plan)

## Monitoring and Logs

### View Logs
```bash
railway logs
```

### Monitor Metrics
- Railway dashboard provides CPU, memory, and network metrics
- Set up alerts for high resource usage

## Troubleshooting

### Build Fails
- Check that all dependencies are in `go.mod`
- Verify Dockerfile syntax
- Check Railway build logs for specific errors

### Database Connection Issues
- Verify `MONGODB_URI` is correctly formatted
- Ensure MongoDB service is running
- Check network connectivity between services

### CORS Issues
- Verify `ALLOWED_ORIGINS` includes your frontend domain
- Check that frontend URL matches exactly (including protocol)

### WebSocket Issues
- Ensure WebSocket endpoint `/ws` is accessible
- Check that WebSocket connections use `wss://` for HTTPS domains
- Verify NATS service is running if using real-time features

## Scaling and Performance

### Horizontal Scaling
- Railway Pro plan supports auto-scaling
- Configure based on CPU/memory thresholds

### Database Optimization
- Use MongoDB indexes for better query performance
- Consider MongoDB Atlas for production workloads

### Caching
- Consider adding Redis for session storage
- Implement API response caching

## Cost Optimization

### Free Tier Limits
- Railway provides $5/month free usage
- Monitor usage in dashboard

### Resource Optimization
- Use multi-stage Docker build (already configured)
- Optimize Go binary size with build flags
- Monitor memory usage and adjust if needed

## Security Best Practices

### Network Security
- Services communicate via internal Railway network
- External access only through designated ports

### Secrets Management
- Use Railway environment variables for secrets
- Never commit secrets to repository
- Rotate secrets regularly

### Updates
- Keep Go and dependencies updated
- Monitor for security vulnerabilities
- Use Railway's automatic deployments for quick security patches

## Continuous Deployment

Railway automatically deploys when you push to your connected Git branch. To customize:

1. Connect specific branch in Railway settings
2. Use Railway's webhook for custom CI/CD
3. Implement database migrations as needed

Your backend will be live at `https://your-project-name.railway.app`!