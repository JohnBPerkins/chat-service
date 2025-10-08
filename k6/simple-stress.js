import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// Custom metrics
const messagesPerSecond = new Rate('messages_per_second');
const messagesSent = new Counter('messages_sent');

// Aggressive load test configuration
export const options = {
  stages: [
    { duration: '10s', target: 100 },   // Ramp up to 100 concurrent users
    { duration: '30s', target: 500 },   // Ramp up to 500 users
    { duration: '1m', target: 1000 },   // Spike to 1000 users
    { duration: '2m', target: 1000 },   // Hold at 1000 users
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    'messages_per_second': ['rate>0.8'], // 80% success rate
  },
};

const BASE_URL = __ENV.BASE_URL || 'wss://chatservicews.up.railway.app';
const USER_ID = __ENV.USER_ID || '';
const WS_URL = `${BASE_URL}/ws?userId=${encodeURIComponent(USER_ID)}`;
const CONVERSATION_ID = __ENV.CONVERSATION_ID || '';

export default function () {
  if (!USER_ID || !CONVERSATION_ID) {
    return;
  }

  const params = {
    // No auth headers needed - userId is in query parameter
  };

  ws.connect(WS_URL, params, function (socket) {
    socket.on('open', function () {
      // Subscribe
      socket.send(JSON.stringify({
        type: 'subscribe',
        ts: Date.now(),
        data: { conversationId: CONVERSATION_ID },
      }));

      // Blast messages as fast as possible (no think time)
      for (let i = 0; i < 50; i++) {
        socket.send(JSON.stringify({
          type: 'message.send',
          ts: Date.now(),
          data: {
            conversationId: CONVERSATION_ID,
            clientMsgId: `stress-vu${__VU}-${Date.now()}-${i}`,
            body: `Stress test message ${i}`,
          },
        }));
        messagesSent.add(1);
        messagesPerSecond.add(1);
      }

      socket.close();
    });
  });
}
