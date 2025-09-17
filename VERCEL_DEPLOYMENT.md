# Vercel Deployment Guide

This guide will help you deploy the chat service frontend to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. A backend API deployed somewhere (e.g., Railway, Heroku, DigitalOcean, etc.)
3. A GitHub OAuth app configured for production

## Step 1: Prepare Your Backend

Before deploying the frontend, ensure your backend is deployed and accessible via HTTPS. You'll need:
- Backend API URL (e.g., `https://your-api.railway.app`)
- WebSocket URL (same as API but with `wss://` protocol)

## Step 2: Create Production GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Chat Service Production
   - **Homepage URL**: `https://your-vercel-app.vercel.app` (you'll get this URL after deployment)
   - **Authorization callback URL**: `https://your-vercel-app.vercel.app/api/auth/callback/github`
4. Save the **Client ID** and **Client Secret**

## Step 3: Deploy to Vercel

### Option A: Using Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from the project root:
   ```bash
   vercel
   ```

4. Follow the prompts:
   - Set up and deploy: **Yes**
   - Which scope: Choose your account
   - Link to existing project: **No**
   - Project name: `chat-service` (or your preferred name)
   - In which directory is your code located: **./frontend**

### Option B: Using Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Click "New Project"
3. Import your Git repository
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

## Step 4: Configure Environment Variables

In your Vercel project settings, add these environment variables:

### Required Variables:
- `NEXTAUTH_URL`: `https://your-vercel-app.vercel.app`
- `NEXTAUTH_SECRET`: Generate a new secret (use: `openssl rand -base64 32`)
- `GITHUB_ID`: Your production GitHub OAuth app client ID
- `GITHUB_SECRET`: Your production GitHub OAuth app client secret
- `NEXT_PUBLIC_API_BASE_URL`: Your backend API URL (e.g., `https://your-api.railway.app`)
- `NEXT_PUBLIC_WS_BASE_URL`: Your backend WebSocket URL (e.g., `wss://your-api.railway.app`)

## Step 5: Update GitHub OAuth App

After your first deployment, you'll get a Vercel URL. Update your GitHub OAuth app:
1. Go back to your GitHub OAuth app settings
2. Update the **Homepage URL** and **Authorization callback URL** with your actual Vercel URL

## Step 6: Configure Deployment Settings

The project is configured to only rebuild when files in the `frontend/` directory change. This is handled by:
- `vercel.json` configuration
- `.vercelignore` file that excludes backend files

## Automatic Deployments

Once set up, Vercel will automatically:
- Deploy on every push to the main branch (only if frontend files changed)
- Create preview deployments for pull requests
- Provide a production URL for your chat application

## Troubleshooting

### Build Fails
- Check that all environment variables are set correctly
- Ensure your backend is accessible from Vercel's build environment

### Authentication Issues
- Verify GitHub OAuth app callback URL matches your Vercel domain
- Check that `NEXTAUTH_URL` matches your deployed URL exactly

### API Connection Issues
- Ensure your backend accepts CORS requests from your Vercel domain
- Verify WebSocket connections work over WSS (not WS)

## Performance Optimization

The current configuration:
- Uses `npm ci` for faster, reproducible builds
- Excludes unnecessary files via `.vercelignore`
- Only rebuilds when frontend code changes
- Leverages Vercel's automatic optimizations for Next.js

Your chat service frontend will be deployed and ready to use!