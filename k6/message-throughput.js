import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const messagesSent = new Counter('messages_sent');
const messagesAcked = new Counter('messages_acked');
const messagesFailed = new Counter('messages_failed');
const messageLatency = new Trend('message_latency');
const ackRate = new Rate('ack_rate');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'wss://chatservicews.up.railway.app';
const USER_ID = __ENV.USER_ID || '';
const WS_URL = `${BASE_URL}/ws?userId=${encodeURIComponent(USER_ID)}`;
const CONVERSATION_ID = __ENV.CONVERSATION_ID || '';
const MESSAGE_SIZE = parseInt(__ENV.MESSAGE_SIZE || '100');
const VUS = parseInt(__ENV.VUS || '10'); // Number of concurrent connections
const DURATION = __ENV.DURATION || '30s';
const MESSAGES_PER_VU = parseInt(__ENV.MESSAGES_PER_VU || '20'); // Messages per VU total
const DELAY_MS = parseInt(__ENV.DELAY_MS || '200'); // Delay between messages (controls RPS)

// Per-VU iterations executor for persistent WebSocket connections
export const options = {
  scenarios: {
    message_throughput: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1, // Each VU runs once but sends multiple messages
      maxDuration: DURATION,
    },
  },
  thresholds: {
    'ack_rate': ['rate>0.95'],                    // 95% of messages must be acknowledged
    'message_latency': ['p(95)<1000', 'p(99)<2000'], // 95% under 1s, 99% under 2s
    'messages_failed': ['count<100'],             // Allow some failures
  },
  ext: {
    loadimpact: {
      name: 'Chat Service - Message Throughput (RPS Test)',
    },
  },
};

// Setup function - runs once before all VUs start
export function setup() {
  console.log('='.repeat(80));
  console.log('Chat Service Load Test - Message Throughput (RPS)');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`User ID: ${USER_ID}`);
  console.log(`Conversation ID: ${CONVERSATION_ID}`);
  console.log(`Concurrent VUs: ${VUS}`);
  console.log(`Messages per VU: ${MESSAGES_PER_VU}`);
  console.log(`Total messages: ~${VUS * MESSAGES_PER_VU}`);
  console.log(`Message size: ${MESSAGE_SIZE} characters`);
  console.log(`Delay between messages: ${DELAY_MS}ms`);
  console.log(`Target RPS: ~${Math.round(VUS * (1000 / DELAY_MS))}`);
  console.log('='.repeat(80));

  if (!USER_ID || !CONVERSATION_ID) {
    throw new Error('USER_ID and CONVERSATION_ID required. Use: k6 run -e USER_ID=your@email.com -e CONVERSATION_ID=xxx message-throughput.js');
  }

  return { startTime: Date.now() };
}

// Main test function - each VU connects once and sends multiple messages
export default function () {
  if (!USER_ID || !CONVERSATION_ID) {
    messagesFailed.add(1);
    return;
  }

  const pendingMessages = new Map();
  let messagesSentCount = 0;
  let messagesAckedCount = 0;

  const res = ws.connect(WS_URL, { tags: { name: 'WebSocketConnection' } }, function (socket) {
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
            messagesAckedCount++;
            ackRate.add(1);
            pendingMessages.delete(clientMsgId);
          } else {
            // Received ack for unknown message
            console.log(`VU ${__VU}: Received ack for unknown clientMsgId: ${clientMsgId}`);
          }
        }

        // Log all message types for debugging
        if (frame.type !== 'message.ack') {
          console.log(`VU ${__VU}: Received frame type: ${frame.type}`);
        }

        // Handle errors
        if (frame.type === 'error') {
          console.error(`VU ${__VU}: WebSocket error: ${JSON.stringify(frame.data)}`);
          messagesFailed.add(1);
          ackRate.add(0);
        }
      } catch (e) {
        console.error(`VU ${__VU}: Failed to parse message: ${e}, data: ${data.substring(0, 100)}`);
      }
    });

    socket.on('open', function () {
      console.log(`VU ${__VU}: Connected, subscribing to conversation`);

      // Subscribe to conversation
      socket.send(JSON.stringify({
        type: 'subscribe',
        ts: Date.now(),
        data: { conversationId: CONVERSATION_ID },
      }));

      // Wait for subscription (backend doesn't send confirmation, just processes silently)
      sleep(0.5);

      // Send messages
      for (let i = 0; i < MESSAGES_PER_VU; i++) {
        const clientMsgId = `vu${__VU}-${Date.now()}-${i}`;
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
          socket.send(JSON.stringify(messageFrame));
          messagesSent.add(1);
          messagesSentCount++;

          // Delay between messages to control rate
          if (i < MESSAGES_PER_VU - 1) {
            sleep(DELAY_MS / 1000);
          }
        } catch (e) {
          console.error(`VU ${__VU}: Failed to send message: ${e}`);
          messagesFailed.add(1);
          ackRate.add(0);
        }
      }

      // Wait for remaining acknowledgments
      const waitStart = Date.now();
      const maxWait = 5000; // 5 seconds max wait
      while (pendingMessages.size > 0 && (Date.now() - waitStart) < maxWait) {
        sleep(0.1);
      }

      // Mark any remaining messages as failed
      const remaining = pendingMessages.size;
      if (remaining > 0) {
        console.log(`VU ${__VU}: ${remaining} messages not acknowledged`);
        for (let i = 0; i < remaining; i++) {
          ackRate.add(0);
        }
      }

      console.log(`VU ${__VU}: Sent ${messagesSentCount}, Acked ${messagesAckedCount}`);

      // Close connection
      socket.close();
    });

    socket.on('close', function () {
      console.log(`VU ${__VU}: Connection closed`);
    });

    socket.on('error', function (e) {
      if (e && e.error && e.error() !== 'websocket: close sent') {
        console.error(`VU ${__VU}: WebSocket error: ${e}`);
        messagesFailed.add(1);
      }
    });

    // Timeout
    socket.setTimeout(function () {
      console.log(`VU ${__VU}: Connection timeout`);
      socket.close();
    }, 60000); // 60 second timeout
  });

  check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  });
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
