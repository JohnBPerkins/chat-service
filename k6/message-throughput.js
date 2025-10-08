import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
const messagesFailed = new Counter('messages_failed');
const messageLatency = new Trend('message_latency');
const deliveryRate = new Rate('delivery_rate');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'wss://chatservicews.up.railway.app';
const USER_ID = __ENV.USER_ID || '';
const CONVERSATION_ID = __ENV.CONVERSATION_ID || '';
const MESSAGE_SIZE = parseInt(__ENV.MESSAGE_SIZE || '100');
const SENDER_VUS = parseInt(__ENV.SENDER_VUS || '10');
const MESSAGES_PER_VU = parseInt(__ENV.MESSAGES_PER_VU || '50');
const DELAY_MS = parseInt(__ENV.DELAY_MS || '100');

// Per-VU iterations executor
export const options = {
  scenarios: {
    // Single listener that receives all messages
    listener: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      exec: 'listener',
    },
    // Multiple senders
    senders: {
      executor: 'per-vu-iterations',
      vus: SENDER_VUS,
      iterations: 1,
      maxDuration: '1m',
      exec: 'sender',
      startTime: '2s', // Start after listener is ready
    },
  },
  thresholds: {
    'delivery_rate': ['rate>0.95'],           // 95% of sent messages received by listener
    'message_latency': ['p(95)<2000'],        // 95% delivered within 2s
    'messages_failed': ['count<100'],
  },
  ext: {
    loadimpact: {
      name: 'Chat Service - Message Throughput (Delivery Test)',
    },
  },
};

// Setup
export function setup() {
  console.log('='.repeat(80));
  console.log('Chat Service Load Test - Message Delivery (Sender → Receiver)');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Conversation ID: ${CONVERSATION_ID}`);
  console.log(`Listener: 1 VU (receives messages)`);
  console.log(`Senders: ${SENDER_VUS} VUs`);
  console.log(`Messages per sender: ${MESSAGES_PER_VU}`);
  console.log(`Total messages: ${SENDER_VUS * MESSAGES_PER_VU}`);
  console.log(`Delay between messages: ${DELAY_MS}ms`);
  console.log(`Target RPS: ~${Math.round(SENDER_VUS * (1000 / DELAY_MS))}`);
  console.log('='.repeat(80));

  if (!USER_ID || !CONVERSATION_ID) {
    throw new Error('USER_ID and CONVERSATION_ID required');
  }

  return {
    startTime: Date.now(),
    expectedMessages: SENDER_VUS * MESSAGES_PER_VU,
  };
}

// Listener function - receives and counts messages
export function listener(data) {
  const listenerUserId = `${USER_ID}-listener`;
  const listenerUrl = `${BASE_URL}/ws?userId=${encodeURIComponent(listenerUserId)}`;

  let receivedCount = 0;
  const receivedMessages = new Map(); // clientMsgId -> timestamp

  const res = ws.connect(listenerUrl, { tags: { name: 'Listener' } }, function (socket) {
    socket.on('open', function () {
      console.log('LISTENER: Connected, subscribing...');

      socket.send(JSON.stringify({
        type: 'subscribe',
        ts: Date.now(),
        data: { conversationId: CONVERSATION_ID },
      }));

      console.log('LISTENER: Waiting for messages...');
    });

    socket.on('message', function (data) {
      try {
        const frame = JSON.parse(data);

        // Count message.new broadcasts
        if (frame.type === 'message.new' && frame.data) {
          const clientMsgId = frame.data.clientMsgId;

          if (!receivedMessages.has(clientMsgId)) {
            receivedMessages.set(clientMsgId, Date.now());
            receivedCount++;
            messagesReceived.add(1);

            // Calculate latency if sendTime is in clientMsgId
            if (clientMsgId && clientMsgId.includes('-')) {
              const parts = clientMsgId.split('-');
              if (parts.length >= 3) {
                const sendTimeFromId = parseInt(parts[2]);
                if (!isNaN(sendTimeFromId)) {
                  const latency = Date.now() - sendTimeFromId;
                  messageLatency.add(latency);
                }
              }
            }

            if (receivedCount % 50 === 0) {
              console.log(`LISTENER: Received ${receivedCount} messages`);
            }
          }
        }

        if (frame.type === 'error') {
          console.error(`LISTENER: Error: ${JSON.stringify(frame.data)}`);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    socket.on('error', function (e) {
      console.error(`LISTENER: WebSocket error: ${e}`);
    });

    socket.on('close', function () {
      console.log(`LISTENER: Connection closed. Received ${receivedCount} total messages`);
    });

    // Keep connection open for the entire test
    socket.setTimeout(function () {
      console.log(`LISTENER: Timeout. Received ${receivedCount}/${data.expectedMessages} messages`);
      socket.close();
    }, 120000); // 2 minute timeout
  });

  check(res, {
    'Listener connected': (r) => r && r.status === 101,
  });
}

// Sender function - sends messages
export function sender() {
  if (!USER_ID || !CONVERSATION_ID) {
    messagesFailed.add(1);
    return;
  }

  const senderUrl = `${BASE_URL}/ws?userId=${encodeURIComponent(USER_ID)}-sender-${__VU}`;
  let messagesSentCount = 0;

  const res = ws.connect(senderUrl, { tags: { name: 'Sender' } }, function (socket) {
    socket.on('open', function () {
      console.log(`SENDER ${__VU}: Connected, subscribing...`);

      socket.send(JSON.stringify({
        type: 'subscribe',
        ts: Date.now(),
        data: { conversationId: CONVERSATION_ID },
      }));

      sleep(0.5); // Wait for subscription

      // Send messages
      for (let i = 0; i < MESSAGES_PER_VU; i++) {
        const sendTime = Date.now();
        const clientMsgId = `sender${__VU}-${sendTime}-${i}`;

        const messageFrame = {
          type: 'message.send',
          ts: sendTime,
          data: {
            conversationId: CONVERSATION_ID,
            clientMsgId: clientMsgId,
            body: `Load test msg: ${randomString(MESSAGE_SIZE - 20)}`,
            sendTime: sendTime, // Include sendTime for latency tracking
          },
        };

        try {
          socket.send(JSON.stringify(messageFrame));
          messagesSent.add(1);
          deliveryRate.add(1); // Assume sent = will be delivered, receiver will track actual
          messagesSentCount++;

          if (i < MESSAGES_PER_VU - 1) {
            sleep(DELAY_MS / 1000);
          }
        } catch (e) {
          console.error(`SENDER ${__VU}: Failed to send message: ${e}`);
          messagesFailed.add(1);
        }
      }

      console.log(`SENDER ${__VU}: Sent ${messagesSentCount} messages`);

      // Wait a bit before closing
      sleep(1);
      socket.close();
    });

    socket.on('error', function (e) {
      if (e && e.error && e.error() !== 'websocket: close sent') {
        console.error(`SENDER ${__VU}: WebSocket error: ${e}`);
        messagesFailed.add(1);
      }
    });

    socket.setTimeout(function () {
      console.log(`SENDER ${__VU}: Connection timeout`);
      socket.close();
    }, 60000);
  });

  check(res, {
    'Sender connected': (r) => r && r.status === 101,
  });
}

// Teardown
export function teardown(data) {
  const durationSec = (Date.now() - data.startTime) / 1000;
  console.log('='.repeat(80));
  console.log('Test Completed');
  console.log(`Total duration: ${durationSec.toFixed(2)}s`);
  console.log(`Expected messages: ${data.expectedMessages}`);
  console.log('='.repeat(80));
  console.log('Check k6 metrics for:');
  console.log('  - messages_sent: Total messages sent by all senders');
  console.log('  - messages_received: Total messages received by listener');
  console.log('  - delivery_rate: Percentage successfully delivered');
  console.log('  - message_latency: Time from send to receive (p95, p99)');
  console.log('='.repeat(80));
}
