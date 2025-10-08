import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const messagesPerSecond = new Rate('messages_per_second');
const messagesSent = new Counter('messages_sent');
const messagesAcked = new Counter('messages_acked');
const connectionErrors = new Counter('connection_errors');
const messageLatency = new Trend('message_latency');

// Configuration - can be overridden via environment variables
const BASE_URL = __ENV.BASE_URL || 'wss://chatservicews.up.railway.app';
const USER_ID = __ENV.USER_ID || ''; // User email address
const WS_URL = `${BASE_URL}/ws?userId=${encodeURIComponent(USER_ID)}`;
const CONVERSATION_ID = __ENV.CONVERSATION_ID || ''; // Must be provided
const MESSAGES_PER_VU = parseInt(__ENV.MESSAGES_PER_VU || '50');
const MESSAGE_SIZE = parseInt(__ENV.MESSAGE_SIZE || '100'); // characters
const THINK_TIME_MS = parseInt(__ENV.THINK_TIME_MS || '500'); // time between messages

// Test stages - focused on message throughput
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Quick ramp to 50 users
    { duration: '30s', target: 100 },  // Ramp to 100 users
    { duration: '1m', target: 100 },   // Hold at 100 users for throughput test
  ],
  thresholds: {
    'messages_per_second': ['rate>0.95'], // 95% of messages should be sent successfully
    'message_latency': ['p(95)<1000'],    // 95% of messages acknowledged within 1s
    'ws_connecting': ['p(95)<500'],       // 95% of connections established within 500ms
  },
  // Grafana Cloud k6 integration
  ext: {
    loadimpact: {
      name: 'Chat Service - Message Throughput Test',
      // projectID is optional - k6 cloud will use your default project if not specified
    },
  },
};

// Main test function - runs for each virtual user
export default function () {
  if (!USER_ID) {
    console.error(`USER_ID must be set (your email address)`);
    connectionErrors.add(1);
    return;
  }

  if (!CONVERSATION_ID) {
    console.error('CONVERSATION_ID must be set');
    connectionErrors.add(1);
    return;
  }

  // Track pending messages for latency measurement
  const pendingMessages = new Map();

  // WebSocket connection (userId is in query parameter)
  const params = {
    tags: {
      name: 'WebSocketConnection',
      vu: __VU,
    },
  };

  const res = ws.connect(WS_URL, params, function (socket) {

    // Handle incoming messages
    socket.on('message', function (data) {
      try {
        const frame = JSON.parse(data);

        // Track message acknowledgments for latency
        if (frame.type === 'message.ack' && frame.data) {
          const clientMsgId = frame.data.clientMsgId;
          if (pendingMessages.has(clientMsgId)) {
            const sendTime = pendingMessages.get(clientMsgId);
            const latency = Date.now() - sendTime;
            messageLatency.add(latency);
            messagesAcked.add(1);
            pendingMessages.delete(clientMsgId);
          }
        }

        // Handle errors
        if (frame.type === 'error') {
          console.error(`WebSocket error: ${JSON.stringify(frame.data)}`);
          connectionErrors.add(1);
        }
      } catch (e) {
        console.error(`Failed to parse message: ${e}`);
      }
    });

    socket.on('open', function () {
      console.log(`VU ${__VU}: Connected to WebSocket`);

      // Subscribe to the conversation
      const subscribeFrame = {
        type: 'subscribe',
        ts: Date.now(),
        data: {
          conversationId: CONVERSATION_ID,
        },
      };
      socket.send(JSON.stringify(subscribeFrame));

      // Give some time for subscription to complete
      sleep(0.5);

      // Send messages
      for (let i = 0; i < MESSAGES_PER_VU; i++) {
        const clientMsgId = `vu${__VU}-${Date.now()}-${i}`;
        const messageBody = generateMessage(MESSAGE_SIZE);

        const sendTime = Date.now();
        pendingMessages.set(clientMsgId, sendTime);

        const messageFrame = {
          type: 'message.send',
          ts: sendTime,
          data: {
            conversationId: CONVERSATION_ID,
            clientMsgId: clientMsgId,
            body: messageBody,
          },
        };

        socket.send(JSON.stringify(messageFrame));
        messagesSent.add(1);
        messagesPerSecond.add(1);

        // Think time between messages (simulate realistic user behavior)
        if (i < MESSAGES_PER_VU - 1) {
          sleep(THINK_TIME_MS / 1000);
        }
      }

      // Wait a bit for pending acknowledgments
      sleep(2);

      // Unsubscribe
      const unsubscribeFrame = {
        type: 'unsubscribe',
        ts: Date.now(),
        data: {
          conversationId: CONVERSATION_ID,
        },
      };
      socket.send(JSON.stringify(unsubscribeFrame));

      socket.close();
    });

    socket.on('close', function () {
      console.log(`VU ${__VU}: Disconnected from WebSocket`);
    });

    socket.on('error', function (e) {
      console.error(`VU ${__VU}: WebSocket error: ${e}`);
      connectionErrors.add(1);
    });

    // Timeout - close connection after 5 minutes
    socket.setTimeout(function () {
      console.log(`VU ${__VU}: WebSocket timeout`);
      socket.close();
    }, 300000);
  });

  check(res, {
    'WebSocket connected successfully': (r) => r && r.status === 101
  });
}

// Generate a random message of specified size
function generateMessage(size) {
  const prefix = `Load test message: `;
  const remaining = Math.max(0, size - prefix.length);
  return prefix + randomString(remaining);
}

// Setup function - runs once before all VUs start
export function setup() {
  console.log('='.repeat(80));
  console.log('Chat Service Load Test - Message Throughput (2min, 100 VUs)');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`User ID: ${USER_ID}`);
  console.log(`Conversation ID: ${CONVERSATION_ID}`);
  console.log(`Max VUs: 100`);
  console.log(`Messages per VU: ${MESSAGES_PER_VU}`);
  console.log(`Message size: ${MESSAGE_SIZE} characters`);
  console.log(`Think time: ${THINK_TIME_MS}ms`);
  console.log(`Estimated total messages: ~${100 * MESSAGES_PER_VU}`);
  console.log('='.repeat(80));

  if (!USER_ID) {
    throw new Error('USER_ID must be set. Use: k6 run -e USER_ID=your@email.com -e CONVERSATION_ID=xxx message-throughput.js');
  }

  if (!CONVERSATION_ID) {
    throw new Error('CONVERSATION_ID must be set. Use: k6 run -e USER_ID=your@email.com -e CONVERSATION_ID=xxx message-throughput.js');
  }

  return {
    startTime: Date.now(),
  };
}

// Teardown function - runs once after all VUs finish
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('='.repeat(80));
  console.log('Test completed');
  console.log(`Total duration: ${duration.toFixed(2)}s`);
  console.log('='.repeat(80));
}
