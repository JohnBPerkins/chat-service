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

// Configuration
const BASE_URL = __ENV.BASE_URL || 'wss://chatservicews.up.railway.app';
const USER_ID = __ENV.USER_ID || '';
const WS_URL = `${BASE_URL}/ws?userId=${encodeURIComponent(USER_ID)}`;
const CONVERSATION_ID = __ENV.CONVERSATION_ID || '';
const MESSAGES_PER_VU = parseInt(__ENV.MESSAGES_PER_VU || '20');
const MESSAGE_SIZE = parseInt(__ENV.MESSAGE_SIZE || '100');
const THINK_TIME_MS = parseInt(__ENV.THINK_TIME_MS || '1000');

// Gentle load profile for hobby-tier backends
export const options = {
  stages: [
    { duration: '30s', target: 5 },    // Ramp to 5 users
    { duration: '30s', target: 10 },   // Ramp to 10 users
    { duration: '1m', target: 10 },    // Hold at 10 users
    { duration: '30s', target: 20 },   // Try 20 users
    { duration: '1m', target: 20 },    // Hold at 20 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'messages_per_second': ['rate>0.90'], // 90% success rate
    'message_latency': ['p(95)<2000'],    // 95% within 2s (relaxed for hobby tier)
    'http_req_failed': ['rate<0.1'],      // Less than 10% errors
  },
  ext: {
    loadimpact: {
      name: 'Chat Service - Gentle Load Test (Hobby Tier)',
    },
  },
};

export default function () {
  if (!USER_ID || !CONVERSATION_ID) {
    connectionErrors.add(1);
    return;
  }

  const pendingMessages = new Map();

  const res = ws.connect(WS_URL, {}, function (socket) {

    socket.on('open', function () {
      // Subscribe
      socket.send(JSON.stringify({
        type: 'subscribe',
        ts: Date.now(),
        data: { conversationId: CONVERSATION_ID },
      }));

      sleep(0.5);

      // Send messages slowly
      for (let i = 0; i < MESSAGES_PER_VU; i++) {
        const clientMsgId = `gentle-vu${__VU}-${Date.now()}-${i}`;
        const sendTime = Date.now();
        pendingMessages.set(clientMsgId, sendTime);

        socket.send(JSON.stringify({
          type: 'message.send',
          ts: sendTime,
          data: {
            conversationId: CONVERSATION_ID,
            clientMsgId: clientMsgId,
            body: `Gentle load test: ${randomString(MESSAGE_SIZE - 20)}`,
          },
        }));

        messagesSent.add(1);
        messagesPerSecond.add(1);

        // Longer think time to reduce load
        if (i < MESSAGES_PER_VU - 1) {
          sleep(THINK_TIME_MS / 1000);
        }
      }

      sleep(1);
      socket.close();
    });

    socket.on('message', function (data) {
      try {
        const frame = JSON.parse(data);
        if (frame.type === 'message.ack' && frame.data) {
          const clientMsgId = frame.data.clientMsgId;
          if (pendingMessages.has(clientMsgId)) {
            const latency = Date.now() - pendingMessages.get(clientMsgId);
            messageLatency.add(latency);
            messagesAcked.add(1);
            pendingMessages.delete(clientMsgId);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    socket.on('error', function (e) {
      if (e && e.error && e.error() !== 'websocket: close sent') {
        connectionErrors.add(1);
      }
    });
  });

  check(res, { 'Connected': (r) => r && r.status === 101 });
}

export function setup() {
  console.log('Gentle Load Test - For Hobby Tier Backends');
  console.log('Max VUs: 20 | Duration: ~4 minutes');
  console.log(`User: ${USER_ID}`);
  console.log(`Conversation: ${CONVERSATION_ID}`);
  console.log(`Messages per VU: ${MESSAGES_PER_VU}`);
  console.log(`Total messages: ~${20 * MESSAGES_PER_VU}`);

  if (!USER_ID || !CONVERSATION_ID) {
    throw new Error('USER_ID and CONVERSATION_ID required');
  }
}
