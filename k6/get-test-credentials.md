# Getting Test Credentials for k6 Cloud Testing

## Step 1: Get a Conversation ID

1. Open your chat application in browser: https://chat-service-frontend.vercel.app (or your deployment URL)
2. Sign in with a test account
3. Create a new conversation OR open an existing one
4. **Get the conversation ID**:

   **Method A - From URL** (if visible):
   ```
   https://your-app.com/chat/[conversation-id]
                              ^^^^^^^^^^^^^^^^
   ```

   **Method B - From DevTools**:
   - Open DevTools (F12)
   - Go to Console tab
   - Type: `window.location.pathname` or inspect the URL
   - OR look at Network tab → WebSocket frames → find subscribe messages

   **Method C - From API**:
   - In Console, type:
   ```javascript
   // Get all conversations
   fetch('/api/conversations', {
     headers: {
       'Authorization': 'Bearer ' + document.cookie.match(/next-auth.session-token=([^;]+)/)[1]
     }
   }).then(r => r.json()).then(console.log)
   ```
   - Copy the `id` field from any conversation

## Step 2: Get JWT Token

### Method A - From Browser DevTools (Easiest)

1. Open your chat app in browser and sign in
2. Open DevTools (F12)
3. Go to **Network** tab
4. Refresh the page or send a message
5. Look for any request to your backend API (e.g., `/v1/conversations`)
6. Click on the request → **Headers** tab
7. Find `Authorization: Bearer eyJhbGc...`
8. Copy everything after "Bearer " (that's your JWT)

### Method B - From WebSocket Connection

1. Open DevTools → **Network** tab → **WS** filter
2. Click on the WebSocket connection
3. Look at the **Headers** tab
4. Find `Authorization` header
5. Copy the JWT token

### Method C - From Application Storage

1. Open DevTools → **Application** tab
2. Look in **Cookies** or **Local Storage** or **Session Storage**
3. Find `next-auth.session-token` or similar
4. This might be the session cookie (not the JWT)
5. If so, you need to extract the JWT from the session

### Method D - Generate via Script (if you have API access)

If you have direct API access to create users:

```bash
# Create a test user and get token
curl -X POST https://your-backend/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}' \
  | jq -r '.token'
```

## Step 3: Save Your Credentials

Create a file `k6/.env.k6`:

```bash
# Base URL (your Railway backend)
BASE_URL=wss://chat-service-production.up.railway.app

# Conversation ID to test with
CONVERSATION_ID=paste-your-conversation-id-here

# JWT Token (from browser DevTools)
JWT_TOKEN=paste-your-jwt-token-here

# Optional: Multiple users (for more realistic load)
# JWT_1=user1-token
# JWT_2=user2-token
# JWT_3=user3-token
```

## Step 4: Verify Your Credentials

Test locally first before running in cloud:

```bash
# Source your environment variables
export $(cat k6/.env.k6 | xargs)

# Run a quick local test (10 VUs, 30 seconds)
k6 run --vus 10 --duration 30s \
  -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_TOKEN="$JWT_TOKEN" \
  k6/message-throughput.js
```

If this works, you're ready for cloud testing!

## Quick Command Reference

```bash
# Export variables
export $(cat k6/.env.k6 | xargs)

# Verify they're set
echo $CONVERSATION_ID
echo $JWT_TOKEN

# Test locally
k6 run k6/message-throughput.js

# Test in cloud
k6 cloud k6/message-throughput.js
```

## Troubleshooting

### "WebSocket connection failed"
- Check that BASE_URL is correct
- Verify JWT token is valid (not expired)
- Make sure you're signed in to the same account

### "No JWT token found"
- Make sure you've exported the environment variables
- Check that .env.k6 has no syntax errors
- Try setting manually: `export JWT_TOKEN="your-token"`

### "CONVERSATION_ID must be set"
- Verify the conversation ID is correct
- Make sure it exists in your database
- Try creating a fresh test conversation
