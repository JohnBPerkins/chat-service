import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Local randomString implementation (avoid external dependency)
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Metrics
const messagesSent = new Counter('messages_sent');
const messagesRecv = new Counter('messages_received');
const messagesFail = new Counter('messages_failed');
const messageLatency = new Trend('message_latency');

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

// Always use 1 listener (multiple listeners count same message multiple times)
const LISTENERS = 1;

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
    message_latency: ['p(95)<2000'],
    messages_failed: ['count<100'],
    // Note: Delivery rate calculated as messages_received / messages_sent
    // Target: >95% (compare counters manually)
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

      // Latency: backend ts is Unix milliseconds
      if (typeof f.ts === 'number' && f.ts > 0) {
        const latency = Date.now() - f.ts;
        if (latency >= 0 && latency < 60000) {
          messageLatency.add(latency);
        }
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

// Custom summary to display delivery rate
export function handleSummary(data) {
  const sent = data.metrics.messages_sent?.values.count || 0;
  const recv = data.metrics.messages_received?.values.count || 0;
  const deliveryPct = sent > 0 ? ((recv / sent) * 100).toFixed(2) : 0;

  console.log('\n' + '='.repeat(80));
  console.log('MESSAGE THROUGHPUT TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Messages Sent:       ${sent.toLocaleString()}`);
  console.log(`Messages Received:   ${recv.toLocaleString()}`);
  console.log(`Delivery Rate:       ${deliveryPct}% (${recv}/${sent})`);
  console.log('='.repeat(80));

  if (recv > sent) {
    console.log('⚠️  WARNING: More messages received than sent!');
    console.log('   This usually means multiple listeners are counting the same message.');
    console.log('   LISTENERS is now hardcoded to 1 to prevent this.');
  } else if (deliveryPct < 95) {
    console.log('⚠️  WARNING: Delivery rate below 95% threshold');
    console.log(`   ${sent - recv} messages dropped or not yet received`);
  } else {
    console.log('✅  Delivery rate meets >95% threshold');
  }
  console.log('='.repeat(80) + '\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}
