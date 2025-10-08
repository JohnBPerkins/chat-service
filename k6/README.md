# k6 Load Testing for Chat Service

This directory contains k6 load tests for measuring the message throughput and performance of the chat service.

## Prerequisites

1. **Install k6**
   ```bash
   # macOS
   brew install k6

   # Linux
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update
   sudo apt-get install k6

   # Windows
   choco install k6
   ```

2. **Grafana Cloud Account** (Optional, for cloud-based load testing)
   - Sign up at https://grafana.com/auth/sign-up/create-user
   - Get your k6 Cloud API token from https://app.k6.io/account/api-token

## Quick Start

### 1. Setup Test Data

Run the interactive setup script:

```bash
node k6/setup-test-data.js
```

This will guide you through:
- Creating/selecting a test conversation
- Getting JWT tokens for authentication
- Generating environment variables

Alternatively, manually set environment variables:

```bash
export CONVERSATION_ID="your-conversation-id"
export JWT_TOKEN="your-jwt-token"
```

### 2. Run Local Tests

**Message Throughput Test** (realistic load with think time):
```bash
k6 run -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_TOKEN="$JWT_TOKEN" \
  k6/message-throughput.js
```

**Stress Test** (maximum throughput, no think time):
```bash
k6 run -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_TOKEN="$JWT_TOKEN" \
  k6/simple-stress.js
```

### 3. Run Tests on Grafana Cloud

First, authenticate with Grafana Cloud:

```bash
k6 login cloud --token <your-k6-cloud-api-token>
```

Then run tests on Grafana Cloud (uses cloud infrastructure for higher load):

```bash
k6 cloud -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_TOKEN="$JWT_TOKEN" \
  k6/message-throughput.js
```

View results in real-time at: https://app.k6.io/

## Test Scripts

### message-throughput.js

Realistic load test that simulates actual user behavior:

- **Ramps up load gradually**: 10 → 50 → 100 → 200 concurrent users
- **Think time between messages**: Configurable delay (default 1s)
- **Tracks metrics**:
  - Messages sent per second
  - Message latency (time to acknowledgment)
  - Connection errors
  - WebSocket connection time

**Configuration options**:
```bash
k6 run \
  -e BASE_URL="wss://your-backend.com" \
  -e CONVERSATION_ID="conv-123" \
  -e JWT_TOKEN="eyJ..." \
  -e MESSAGES_PER_VU="100" \          # Messages per virtual user
  -e MESSAGE_SIZE="100" \              # Characters per message
  -e THINK_TIME_MS="1000" \            # Delay between messages (ms)
  k6/message-throughput.js
```

### simple-stress.js

Aggressive stress test for finding system limits:

- **Rapid ramp-up**: 100 → 500 → 1000 concurrent users in 50s
- **No think time**: Sends messages as fast as possible
- **50 messages per VU**: Each user sends a burst of 50 messages
- **Maximum throughput**: Tests upper limits of the system

## Grafana Cloud Setup

### Step 1: Create Account and Get Token

1. Go to https://grafana.com/auth/sign-up/create-user
2. Create a free account (includes 50 test runs/month)
3. Navigate to https://app.k6.io/account/api-token
4. Create a new API token
5. Save the token securely

### Step 2: Authenticate k6

```bash
k6 login cloud --token <your-api-token>
```

Or set environment variable:
```bash
export K6_CLOUD_TOKEN="<your-api-token>"
```

### Step 3: Configure Project (Optional)

Get your project ID from Grafana Cloud and set it:

```bash
export K6_CLOUD_PROJECT_ID="123456"
```

Or edit the test script to include:
```javascript
export const options = {
  ext: {
    loadimpact: {
      projectID: 123456,
      name: 'My Test',
    },
  },
};
```

### Step 4: Run Cloud Test

```bash
k6 cloud -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_TOKEN="$JWT_TOKEN" \
  k6/message-throughput.js
```

The test will:
1. Upload the script to Grafana Cloud
2. Execute on cloud infrastructure (higher capacity than local)
3. Stream results in real-time
4. Provide a URL to view detailed metrics

## Understanding Results

### Key Metrics

- **messages_per_second**: Rate of successful message sends
- **messages_sent**: Total count of messages attempted
- **messages_acked**: Messages acknowledged by server
- **message_latency**: Time from send to acknowledgment
  - p95: 95% of messages acknowledged within this time
  - p99: 99% of messages acknowledged within this time
- **ws_connecting**: Time to establish WebSocket connection
- **connection_errors**: Failed connections or protocol errors

### Thresholds

Tests include automatic pass/fail thresholds:

- ✅ **messages_per_second > 95%**: At least 95% of messages sent successfully
- ✅ **message_latency p95 < 1000ms**: 95% of messages acknowledged within 1 second
- ✅ **ws_connecting p95 < 500ms**: 95% of connections established within 500ms

If any threshold fails, the test exits with a non-zero code (useful for CI/CD).

### Expected Performance

Based on typical WebSocket chat systems:

- **Messages/sec/VU**: 1-10 (with realistic think time)
- **Total throughput**: 1,000-10,000 messages/sec (100-1000 VUs)
- **Latency p95**: 50-500ms (depends on geographic distribution)
- **Latency p99**: 100-1000ms

**Bottlenecks to watch**:
- Database write throughput (MongoDB)
- NATS message broker capacity
- WebSocket connection limits
- Network bandwidth
- CPU usage on backend servers

## Multiple User Testing

For more realistic tests, use multiple JWT tokens (different users):

```bash
# Create multiple test accounts and get their JWT tokens
export JWT_1="user1-jwt-token"
export JWT_2="user2-jwt-token"
export JWT_3="user3-jwt-token"
# ... up to JWT_N

k6 run \
  -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_1="$JWT_1" \
  -e JWT_2="$JWT_2" \
  -e JWT_3="$JWT_3" \
  --vus 100 \
  k6/message-throughput.js
```

The script will cycle through available tokens (JWT_1, JWT_2, etc.) for different VUs.

## Troubleshooting

### "No JWT token found"

Make sure you've set either:
- `JWT_TOKEN` environment variable (all VUs use same user), or
- `JWT_1`, `JWT_2`, etc. (different users per VU)

### "CONVERSATION_ID must be set"

Set the conversation ID:
```bash
export CONVERSATION_ID="your-conversation-id-here"
```

### "WebSocket connection failed"

Check:
- BASE_URL is correct (should start with `wss://`)
- JWT token is valid and not expired
- Backend is accessible from your network
- CORS/WebSocket origin restrictions

### "Rate limit exceeded"

The backend may have rate limiting. You can:
- Reduce VUs or message send rate
- Adjust rate limits in backend configuration
- Use multiple user tokens to distribute load

## CI/CD Integration

Run k6 tests in your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Run k6 load test
  run: |
    export CONVERSATION_ID="${{ secrets.TEST_CONVERSATION_ID }}"
    export JWT_TOKEN="${{ secrets.TEST_JWT_TOKEN }}"
    k6 run --quiet k6/message-throughput.js
```

For cloud testing in CI:
```yaml
- name: Run k6 cloud test
  env:
    K6_CLOUD_TOKEN: ${{ secrets.K6_CLOUD_TOKEN }}
  run: |
    k6 cloud \
      -e CONVERSATION_ID="${{ secrets.TEST_CONVERSATION_ID }}" \
      -e JWT_TOKEN="${{ secrets.TEST_JWT_TOKEN }}" \
      k6/message-throughput.js
```

## Advanced Usage

### Custom Load Profiles

Edit `options.stages` in the test scripts:

```javascript
export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 100 },  // Spike to 100 users
    { duration: '3m', target: 100 },  // Hold spike
    { duration: '1m', target: 0 },    // Ramp down
  ],
};
```

### Sending Different Message Types

Modify the message generation in the script:

```javascript
// Send images/attachments (if supported)
const messageFrame = {
  type: 'message.send',
  ts: Date.now(),
  data: {
    conversationId: CONVERSATION_ID,
    clientMsgId: clientMsgId,
    body: 'Check out this image!',
    attachments: [{ type: 'image', url: 'https://...' }],
  },
};
```

### Testing Other Operations

Add tests for:
- Typing indicators
- Read receipts
- Message editing/deletion
- User presence

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [Grafana Cloud k6](https://grafana.com/docs/grafana-cloud/k6/)
- [WebSocket testing guide](https://k6.io/docs/using-k6/protocols/websockets/)
- [k6 Cloud](https://app.k6.io/)
