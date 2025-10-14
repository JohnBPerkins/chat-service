import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Metrics
const messagesSent = new Counter('messages_sent');
const messagesRecv = new Counter('messages_received');
const messagesFail = new Counter('messages_failed');
const messageLatency = new Trend('message_latency');
const deliveryRate = new Rate('delivery_rate');

// Env
const BASE_URL = __ENV.BASE_URL || 'wss://chatservicews.up.railway.app';
const USER_ID = __ENV.USER_ID || '';
const CONVERSATION_ID = __ENV.CONVERSATION_ID || '';
const MESSAGE_SIZE = parseInt(__ENV.MESSAGE_SIZE || '100', 10);

// Rate tuning
const SENDER_VUS = parseInt(__ENV.SENDER_VUS || '20', 10);        // more VUs = more sockets (default: 20)
const MSGS_PER_SEC = parseInt(__ENV.MSGS_PER_SEC || '50', 10);    // per VU (default: 50)
const BURST = parseInt(__ENV.BURST || '10', 10);                   // messages per tick (default: 10)
const TICK_MS = Math.max(1, Math.floor(1000 / Math.max(1, (MSGS_PER_SEC / BURST))));

// Test length
const DURATION = __ENV.DURATION || '30s';  // Shorter default: 30s

// Optional extra listeners to avoid single-consumer bottleneck
const LISTENERS = parseInt(__ENV.LISTENERS || '1', 10);

// Scenarios
export const options = {
  scenarios: {
    listeners: {
      executor: 'constant-vus',
      vus: LISTENERS,
      duration: DURATION,
      exec: 'listener',
      startTime: '0s',
    },
    senders: {
      executor: 'constant-vus',
      vus: SENDER_VUS,
      duration: DURATION,
      exec: 'sender',
      startTime: '2s',
    },
  },
  thresholds: {
    delivery_rate: ['rate>0.95'],
    message_latency: ['p(95)<2000'],
    messages_failed: ['count<100'],
  },
};

// Lightweight setup checks
export function setup() {
  if (!USER_ID || !CONVERSATION_ID) throw new Error('USER_ID and CONVERSATION_ID required');
}

// Listener(s) – minimal logging, map for de-dupe & latency
export function listener() {
  const uid = `${USER_ID}-listener-${__VU}`;
  const url = `${BASE_URL}/ws?userId=${encodeURIComponent(uid)}`;
  const seen = new Set();

  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', ts: Date.now(), data: { conversationId: CONVERSATION_ID } }));
    });

    socket.on('message', (raw) => {
      // Parsing can be a hotspot—keep it lean
      let f;
      try { f = JSON.parse(raw); } catch { return; }
      if (f.type !== 'message.new' || !f.data) return;

      // Backend sends server-generated 'id', not 'clientMsgId'
      const msgId = f.data.id;
      if (!msgId || seen.has(msgId)) return;
      seen.add(msgId);
      messagesRecv.add(1);
      deliveryRate.add(1);

      // Latency: approximate from frame timestamp to now (not exact sender time)
      if (f.ts) {
        const latency = Date.now() - f.ts;
        if (latency > 0 && latency < 60000) messageLatency.add(latency);
      }
    });

    socket.on('error', () => { /* swallow to avoid spam */ });
    socket.setTimeout(() => socket.close(), 2 * 60 * 1000); // individual listener lifespan guard
  });

  check(res, { 'listener connected': (r) => r && r.status === 101 });
}

// Sender – emits bursts on setInterval for tighter pacing
export function sender() {
  const uid = `${USER_ID}-sender-${__VU}`;
  const url = `${BASE_URL}/ws?userId=${encodeURIComponent(uid)}`;
  const body = `Load test: ${randomString(Math.max(1, MESSAGE_SIZE - 12))}`;

  const res = ws.connect(url, {}, (socket) => {
    let sent = 0;

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', ts: Date.now(), data: { conversationId: CONVERSATION_ID } }));

      socket.setInterval(() => {
        const now = Date.now();
        for (let i = 0; i < BURST; i++) {
          const id = `s${__VU}-${now}-${(sent + i) & 0xffff}`;
          const frame = {
            type: 'message.send',
            ts: now,
            data: { conversationId: CONVERSATION_ID, clientMsgId: id, body, sendTime: now },
          };
          try {
            socket.send(JSON.stringify(frame));
            messagesSent.add(1);
          } catch {
            messagesFail.add(1);
          }
        }
        sent += BURST;
      }, TICK_MS);
    });

    socket.on('error', () => { messagesFail.add(1); });
    socket.setTimeout(() => socket.close(), 2 * 60 * 1000);
  });

  check(res, { 'sender connected': (r) => r && r.status === 101 });
}
