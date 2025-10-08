import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const messagesSent = new Counter('messages_sent');
const messagesAcked = new Counter('messages_acked');
const messagesFailed = new Counter('messages_failed');
const messageLatency = new Trend('message_latency');
const ackRate = new Rate('ack_rate');
const actualMessagesPerSecond = new Gauge('actual_messages_per_second');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'wss://chatservicews.up.railway.app';
const USER_ID = __ENV.USER_ID || '';
const WS_URL = `${BASE_URL}/ws?userId=${encodeURIComponent(USER_ID)}`;
const CONVERSATION_ID = __ENV.CONVERSATION_ID || '';
const MESSAGE_SIZE = parseInt(__ENV.MESSAGE_SIZE || '100');
const TARGET_RATE = parseInt(__ENV.TARGET_RATE || '100'); // Target messages per second
const DURATION = __ENV.DURATION || '30s';

// Constant-arrival-rate executor for precise throughput testing
export const options = {
  scenarios: {
    message_throughput: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RATE,           // Target messages per second
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 50,         // Pre-allocate VUs
      maxVUs: 200,                 // Allow scaling up to 200 VUs if needed
    },
  },
  thresholds: {
    'ack_rate': ['rate>0.95'],                    // 95% of messages must be acknowledged
    'message_latency': ['p(95)<1000', 'p(99)<2000'], // 95% under 1s, 99% under 2s
    'messages_failed': ['count<10'],              // Allow very few failures
  },
  ext: {
    loadimpact: {
      name: 'Chat Service - Message Throughput (RPS Test)',
    },
  },
};

// Global WebSocket connection pool (one per VU)
let globalSocket = null;
let pendingMessages = new Map();
let isSubscribed = false;

// Setup function - runs once before all VUs start
export function setup() {
  console.log('='.repeat(80));
  console.log('Chat Service Load Test - Message Throughput (RPS)');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`User ID: ${USER_ID}`);
  console.log(`Conversation ID: ${CONVERSATION_ID}`);
  console.log(`Target Rate: ${TARGET_RATE} messages/second`);
  console.log(`Duration: ${DURATION}`);
  console.log(`Message size: ${MESSAGE_SIZE} characters`);
  console.log('='.repeat(80));

  if (!USER_ID || !CONVERSATION_ID) {
    throw new Error('USER_ID and CONVERSATION_ID required. Use: k6 run -e USER_ID=your@email.com -e CONVERSATION_ID=xxx message-throughput.js');
  }

  return { startTime: Date.now() };
}

// Main test function - each iteration sends ONE message
export default function () {
  if (!USER_ID || !CONVERSATION_ID) {
    messagesFailed.add(1);
    return;
  }

  // Establish persistent WebSocket connection per VU (reuse across iterations)
  if (!globalSocket) {
    const res = ws.connect(WS_URL, { tags: { name: 'WebSocketConnection' } }, function (socket) {
      globalSocket = socket;

      // Handle incoming messages
      socket.on('message', function (data) {
        try {
          const frame = JSON.parse(data);

          // Track acknowledgments
          if (frame.type === 'message.ack' && frame.data) {
            const clientMsgId = frame.data.clientMsgId;
            if (pendingMessages.has(clientMsgId)) {
              const sendTime = pendingMessages.get(clientMsgId);
              const latency = Date.now() - sendTime;
              messageLatency.add(latency);
              messagesAcked.add(1);
              ackRate.add(1);
              pendingMessages.delete(clientMsgId);
            }
          }

          // Subscribe confirmation
          if (frame.type === 'subscribe.success') {
            isSubscribed = true;
          }

          // Handle errors
          if (frame.type === 'error') {
            console.error(`WebSocket error: ${JSON.stringify(frame.data)}`);
            messagesFailed.add(1);
            ackRate.add(0);
          }
        } catch (e) {
          // Ignore parse errors
        }
      });

      socket.on('open', function () {
        // Subscribe to conversation
        socket.send(JSON.stringify({
          type: 'subscribe',
          ts: Date.now(),
          data: { conversationId: CONVERSATION_ID },
        }));

        // Wait for subscription
        sleep(0.5);
      });

      socket.on('error', function (e) {
        if (e && e.error && e.error() !== 'websocket: close sent') {
          messagesFailed.add(1);
        }
      });

      socket.on('close', function () {
        globalSocket = null;
        isSubscribed = false;
      });

      // Keep connection alive during entire scenario
      socket.setInterval(function () {
        // Heartbeat - connection stays open
      }, 30000);
    });

    check(res, {
      'WebSocket connected': (r) => r && r.status === 101,
    });
  }

  // Send one message per iteration
  if (globalSocket && isSubscribed) {
    const clientMsgId = `vu${__VU}-iter${__ITER}-${Date.now()}`;
    const sendTime = Date.now();

    pendingMessages.set(clientMsgId, sendTime);

    const messageFrame = {
      type: 'message.send',
      ts: sendTime,
      data: {
        conversationId: CONVERSATION_ID,
        clientMsgId: clientMsgId,
        body: generateMessage(MESSAGE_SIZE),
      },
    };

    try {
      globalSocket.send(JSON.stringify(messageFrame));
      messagesSent.add(1);

      const succeeded = check(messageFrame, {
        'Message sent': () => true,
      });

      if (!succeeded) {
        messagesFailed.add(1);
        ackRate.add(0);
      }
    } catch (e) {
      messagesFailed.add(1);
      ackRate.add(0);
    }
  } else {
    // Connection not ready yet
    messagesFailed.add(1);
    ackRate.add(0);
  }
}

// Generate random message
function generateMessage(size) {
  const prefix = 'RPS test: ';
  const remaining = Math.max(0, size - prefix.length);
  return prefix + randomString(remaining);
}

// Teardown - calculate final metrics
export function teardown(data) {
  const durationSec = (Date.now() - data.startTime) / 1000;
  console.log('='.repeat(80));
  console.log('Test Completed');
  console.log(`Total duration: ${durationSec.toFixed(2)}s`);
  console.log('='.repeat(80));
  console.log('Check k6 metrics for:');
  console.log('  - messages_sent (total messages sent)');
  console.log('  - messages_acked (total messages acknowledged)');
  console.log('  - ack_rate (percentage successfully acknowledged)');
  console.log('  - message_latency (p95, p99 latency)');
  console.log('='.repeat(80));
}
