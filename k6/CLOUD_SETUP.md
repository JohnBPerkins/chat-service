# Running k6 Tests in Grafana Cloud

Complete guide to running high-throughput load tests using Grafana Cloud infrastructure.

## Prerequisites

✅ k6 CLI installed (`brew install k6`)
✅ Conversation ID from your chat app
✅ JWT token from your session

## Step-by-Step Setup

### 1. Sign Up for Grafana Cloud

```bash
open https://grafana.com/auth/sign-up/create-user
```

**Create a free account:**
- Personal email or Google/GitHub sign-in
- Choose "Cloud Free" plan
- Includes:
  - 50 test runs/month
  - Up to 300 VUs (virtual users)
  - Cloud infrastructure (no local resource limits)

### 2. Access k6 Cloud

After signing up, you have two options:

**Option A - Through Grafana Cloud Portal:**
1. Login to https://grafana.com/
2. Go to your Grafana Cloud stack
3. Look for **"k6 Cloud"** or **"Testing & Synthetics"** in the sidebar
4. Click to access k6 interface

**Option B - Direct Access:**
1. Go to https://app.k6.io/
2. Sign in with your Grafana Cloud credentials

### 3. Get Your k6 Cloud API Token

**In the k6 Cloud interface:**

1. Click your profile/avatar (top right)
2. Go to **"Settings"** → **"API Tokens"**
3. Click **"Generate New Token"**
4. Give it a name: `Local CLI Testing`
5. **Copy the token immediately** (you won't see it again!)
6. Save it somewhere secure

**Token will look like:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

### 4. Authenticate k6 CLI

**Method 1 - Interactive Login:**
```bash
k6 login cloud --token <paste-your-token-here>
```

**Method 2 - Environment Variable:**
```bash
# Add to your shell profile (~/.zshrc or ~/.bashrc)
export K6_CLOUD_TOKEN="your-token-here"

# Or just for this session
echo 'export K6_CLOUD_TOKEN="your-token"' >> k6/.env.k6
```

**Verify authentication:**
```bash
k6 cloud --help
# Should show cloud-specific options without errors
```

### 5. Prepare Your Test Environment

Create `k6/.env.k6` with your test credentials:

```bash
# Your Railway backend
BASE_URL=wss://chat-service-production.up.railway.app

# Get from your chat app (see get-test-credentials.md)
CONVERSATION_ID=your-conversation-id-here
JWT_TOKEN=your-jwt-token-here

# Grafana Cloud token
K6_CLOUD_TOKEN=your-k6-cloud-token-here

# Optional: Project ID (find in k6 Cloud settings)
# K6_CLOUD_PROJECT_ID=123456
```

**Load environment variables:**
```bash
export $(cat k6/.env.k6 | xargs)
```

### 6. Run Your First Cloud Test

**Start with a small test to verify everything works:**

```bash
k6 cloud \
  -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_TOKEN="$JWT_TOKEN" \
  --duration 1m \
  --vus 10 \
  k6/simple-stress.js
```

**You'll see output like:**

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  execution: cloud
     script: k6/simple-stress.js
     output: https://app.k6.io/runs/1234567

✓ Cloud test started successfully!

  View live results: https://app.k6.io/runs/1234567

  Test is running on Grafana Cloud infrastructure...
```

**Click the URL to watch in real-time!**

### 7. Run Full Throughput Test

Once verified, run the complete test:

```bash
k6 cloud \
  -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_TOKEN="$JWT_TOKEN" \
  k6/message-throughput.js
```

This will:
- Ramp up to 200 concurrent users
- Run for ~11 minutes
- Send thousands of messages
- Measure throughput and latency
- Display results in Grafana Cloud

### 8. View Results in Grafana Cloud

**In the k6 Cloud interface** (https://app.k6.io/):

You'll see:
- **Real-time graphs** of VUs, request rate, errors
- **Performance metrics**: p95/p99 latency, throughput
- **Thresholds**: Pass/fail status
- **Timeline**: How metrics changed over test duration
- **Checks**: Success rate of assertions

**Key metrics to watch:**
- `messages_per_second` - Should stay above 95%
- `message_latency` - p95 should be <1000ms
- `ws_connecting` - p95 should be <500ms
- `http_reqs` - Total requests processed

## Advanced Usage

### Custom Test Configuration

Override test parameters via environment variables:

```bash
k6 cloud \
  -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_TOKEN="$JWT_TOKEN" \
  -e MESSAGES_PER_VU="200" \
  -e MESSAGE_SIZE="500" \
  -e THINK_TIME_MS="500" \
  k6/message-throughput.js
```

### Multiple User Load Test

For more realistic load with different users:

```bash
# First, get JWT tokens for 3-5 different test accounts
export JWT_1="user1-token"
export JWT_2="user2-token"
export JWT_3="user3-token"

k6 cloud \
  -e CONVERSATION_ID="$CONVERSATION_ID" \
  -e JWT_1="$JWT_1" \
  -e JWT_2="$JWT_2" \
  -e JWT_3="$JWT_3" \
  k6/message-throughput.js
```

### Run from Different Regions

Edit the test script to add load zones:

```javascript
export const options = {
  ext: {
    loadimpact: {
      projectID: 123456,
      name: 'Multi-Region Test',
      distribution: {
        'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 50 },
        'amazon:eu:dublin': { loadZone: 'amazon:eu:dublin', percent: 50 },
      },
    },
  },
};
```

### Scheduled Tests

In k6 Cloud UI:
1. Go to your test run
2. Click "Schedule"
3. Set up recurring tests (daily, weekly, etc.)
4. Get alerts when performance degrades

## Understanding Cloud Test Limits

### Free Tier Limits
- **50 cloud test runs/month**
- **300 max VUs** per test
- **5 million data points/month**
- **60 minute max test duration**

### If You Hit Limits
- Tests will fail with quota exceeded error
- Upgrade to paid plan for higher limits
- Or run multiple smaller tests
- Or use local k6 for development

## Comparing Cloud vs Local Results

| Aspect | Local (`k6 run`) | Cloud (`k6 cloud`) |
|--------|------------------|-------------------|
| Max VUs | ~500 | Thousands |
| Infrastructure | Your machine | Grafana Cloud servers |
| Network | Your ISP | Cloud data centers |
| CPU/Memory | Your laptop | Dedicated resources |
| Distribution | Single location | Multiple regions |
| Results UI | Terminal only | Rich web dashboard |
| Cost | Free | Free tier, then paid |

**When to use cloud:**
- ✅ Testing production-like load (>100 VUs)
- ✅ Need distributed load from multiple regions
- ✅ Want beautiful dashboards and historical data
- ✅ Running tests as part of CI/CD
- ✅ Sharing results with team

**When to use local:**
- ✅ Quick development iteration
- ✅ Simple smoke tests
- ✅ Debugging test scripts
- ✅ Low VU counts (<50)

## Troubleshooting Cloud Tests

### "Authentication failed"
```bash
# Re-authenticate
k6 login cloud --token <your-token>

# Or verify token is set
echo $K6_CLOUD_TOKEN
```

### "Quota exceeded"
- You've hit your 50 runs/month limit
- Wait for next month, or upgrade plan
- Or use local testing: `k6 run`

### "Test failed to start"
- Check that script is valid: `k6 run --vus 1 --duration 10s script.js`
- Verify environment variables are set
- Check k6 Cloud status page

### "High error rate in results"
- JWT token might have expired (get a fresh one)
- Backend might be rate limiting
- Conversation ID might not exist
- Check backend logs for errors

### "Test running but no data"
- Wait a few seconds, data streams in real-time
- Refresh the results page
- Check browser console for errors

## Next Steps

After your first successful cloud test:

1. **Analyze bottlenecks** - Which metrics failed thresholds?
2. **Optimize backend** - Fix slow database queries, add caching
3. **Re-test** - Verify improvements
4. **Set up alerts** - Get notified when performance degrades
5. **Integrate CI/CD** - Run tests on every deployment

## Quick Command Cheatsheet

```bash
# Setup
export $(cat k6/.env.k6 | xargs)

# Small test (1 minute, 10 users)
k6 cloud --duration 1m --vus 10 k6/simple-stress.js

# Full throughput test
k6 cloud k6/message-throughput.js

# Stress test (find breaking point)
k6 cloud k6/simple-stress.js

# With custom config
k6 cloud -e MESSAGES_PER_VU=500 k6/message-throughput.js

# Check test status
k6 cloud --show-logs

# List previous runs (in UI)
open https://app.k6.io/
```

## Resources

- [k6 Cloud Docs](https://grafana.com/docs/grafana-cloud/k6/)
- [k6 Cloud App](https://app.k6.io/)
- [Grafana Cloud](https://grafana.com/)
- [k6 Community Forum](https://community.grafana.com/c/grafana-k6/)
