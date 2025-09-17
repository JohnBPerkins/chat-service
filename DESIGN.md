# Live Chat Service — Design Specification

**Status:** Draft (ready to implement MVP)
**Target Demo:** Vercel (Next.js) + Railway (Go API) + MongoDB Atlas + NATS JetStream

---

## 1) Summary

A lightweight, production‑looking **real‑time chat** for portfolio/demo.

* **Frontend:** Next.js (App Router) on Vercel.
* **Backend:** Go (REST + WebSocket) on Railway.
* **Data:** MongoDB Atlas (users, conversations, participants, messages).
* **Realtime backbone:** **NATS JetStream** (durable fan‑out of messages) + plain NATS subjects for ephemeral signals (typing/presence).
* **Auth:** NextAuth (OAuth → RS256 JWT). Go verifies JWT (public key).

**MVP features:**

* OAuth login
* Create DM/group conversation
* Send/receive messages in real time
* Cursor (keyset) pagination for history
* Typing indicator (ephemeral)
* Read receipt (per‑user last read)

**Non‑goals (MVP):** attachments, push notifications, e2e encryption, message edits/deletes, full moderation tooling.

---

## 2) Goals & Non‑Goals

**Goals**

* Ship a polished demo with horizontal scalability story.
* Demonstrate correct realtime semantics (ack after persist, idempotency, ordering).
* Clean, well‑indexed NoSQL schema with a sharding path.

**Non‑Goals**

* Multi‑region consistency, strict once‑only delivery, enterprise SSO.

---

## 3) Architecture

```
Next.js (Vercel)
  ├─ NextAuth (GitHub/Google) → RS256 JWT
  └─ WS client + REST (React Query)
        │
        ▼
Go API/WS (Railway) ──► MongoDB Atlas (durable store)
        │                     ▲
        │                     │
        └────► NATS JetStream (chat.conv.<id>.msg)  [durable broadcast]
               └─ NATS subjects (typing/presence)   [ephemeral]
```

**Scale:** Multiple WS nodes subscribe to per‑conversation subjects only if they host local clients for those rooms. No sticky sessions required.

---

## 4) Tech Choices

* **Go libs:** `chi` (router), `nhooyr.io/websocket` (WS), `mongo-go-driver`, `nats.go` + `jetstream`, `lestrrat-go/jwx` (JWT), `golang-migrate` (optional) or code‑based index creation.
* **Next.js:** App Router, NextAuth, React Query, `react-virtual` for lists.
* **IDs:** time‑sortable int64 **Snowflake/KSUID** for `messages._id` (ensures stable order across nodes), UUIDv4 for `users/conversations`.

---

## 5) Data Model (MongoDB)

### 5.1 Collections

**users**

```json
{
  "_id": "uuid",
  "email": "x@x",
  "name": "Jaime",
  "avatarUrl": "https://…",
  "createdAt": { "$date": "…" }
}
```

Indexes: `email` unique

**conversations**

```json
{
  "_id": "uuid",
  "kind": "dm" | "group",
  "title": "optional",
  "createdAt": { "$date": "…" },
  "lastMessageAt": { "$date": "…" }
}
```

Indexes: `{ lastMessageAt: -1 }`

**participants** (avoid doc growth; separate collection)

```json
{
  "_id": "<conversationId>:<userId>",
  "conversationId": "uuid",
  "userId": "uuid",
  "role": "member" | "admin",
  "lastReadMessageId": 1234567890123,  // Snowflake of last read
  "joinedAt": { "$date": "…" }
}
```

Indexes: `{ conversationId: 1 }`, `{ userId: 1 }`, `_id` unique

**messages** (append‑only)

```json
{
  "_id": 1234567890123,           // Snowflake (int64, time‑sortable)
  "conversationId": "uuid",
  "senderId": "uuid",
  "clientMsgId": "uuid",        // for idempotency
  "body": "string",
  "createdAt": { "$date": "…" }
}
```

Indexes (critical):

* `{ conversationId: 1, createdAt: -1, _id: -1 }`
* unique `{ conversationId: 1, senderId: 1, clientMsgId: 1 }`

**Sharding path (later):** shard `messages` on **hashed** `conversationId`; preserve the query index `{ conversationId: 1, createdAt: -1 }`.

### 5.2 Keyset Pagination

* `GET /v1/conversations/:id/messages?before=<iso|id>&limit=50`
* Query: `find({conversationId, createdAt: {$lt: before}}).sort({createdAt:-1,_id:-1}).limit(n)`

---

## 6) Realtime with Message Queue

### 6.1 Subjects

* **Durable (JetStream):** `chat.conv.<conversationId>.msg` — published after DB insert; subscribers ack and push to local clients.
* **Ephemeral (plain NATS):** `chat.conv.<conversationId>.typing` and `chat.conv.<conversationId>.presence`.

### 6.2 WS Node Behavior

* On first local subscription to a room, create a JetStream consumer on `chat.conv.<id>.msg`.
* Maintain `refs` count; when last client leaves, close the consumer.
* Push `message.new` frames to relevant local sockets.

### 6.3 Delivery & Ordering

* **Persist‑then‑publish:** server inserts into Mongo, then publishes to `chat.conv.<id>.msg`.
* **Idempotency:** unique `(conversationId, senderId, clientMsgId)` treats retries as success.
* **Order:** client sorts by `createdAt` then `_id` (Snowflake). Publish order is best‑effort; Snowflake ensures consistent ordering across nodes.

### 6.4 Presence/Typing

* Client sends `typing` at most 1/sec.
* Presence heartbeat every 20s; WS nodes keep TTL map in memory; optionally also publish ephemeral presence events for room UIs.

---

## 7) API Surface

### 7.1 REST (JSON over HTTPS)

```
GET  /healthz
GET  /v1/me                                → current user profile (from users)
PUT  /v1/users/me                          → upsert user from session

GET  /v1/conversations                     → list user’s conversations (by participants)
POST /v1/conversations                     → create {kind, title?, members[]}
GET  /v1/conversations/:id/messages        → list messages (cursor)
POST /v1/messages                          → send (fallback if WS unavailable)
POST /v1/messages/:id/read                 → update lastReadMessageId
```

**Auth:** `Authorization: Bearer <JWT>` (RS256).
**CORS:** allow Vercel domain on API.

**Example: POST /v1/messages (fallback)**

```json
{
  "conversationId": "a0e4…",
  "clientMsgId": "6b7c…",
  "body": "hello"
}
```

**Response**

```json
{
  "id": 1234567890123,
  "conversationId": "a0e4…",
  "senderId": "user-uuid",
  "body": "hello",
  "createdAt": "2025-09-15T22:00:00Z"
}
```

### 7.2 WebSocket Protocol

All frames use envelope: `{ "type": string, "ts": number, "data": any }`.

**Client → Server**

* `auth` (optional; JWT is usually in subprotocol)

  ```json
  { "type": "auth", "data": { "jwt": "…" } }
  ```
* `subscribe`

  ```json
  { "type": "subscribe", "data": { "conversationId": "…" } }
  ```
* `unsubscribe`

  ```json
  { "type": "unsubscribe", "data": { "conversationId": "…" } }
  ```
* `message.send`

  ```json
  {
    "type": "message.send",
    "data": {
      "conversationId": "…",
      "clientMsgId": "uuid",
      "body": "hello"
    }
  }
  ```
* `typing.update`

  ```json
  { "type": "typing.update", "data": { "conversationId": "…", "isTyping": true } }
  ```
* `receipt.read`

  ```json
  { "type": "receipt.read", "data": { "conversationId": "…", "messageId": 1234567890123 } }
  ```

**Server → Client**

* `message.ack` — optimistic reconciliation

  ```json
  { "type": "message.ack", "data": { "clientMsgId": "uuid", "id": 1234567890123, "createdAt": "…" } }
  ```
* `message.new`

  ```json
  { "type": "message.new", "data": { "id": 123…, "conversationId": "…", "senderId": "…", "body": "…", "createdAt": "…" } }
  ```
* `typing.update`

  ```json
  { "type": "typing.update", "data": { "conversationId": "…", "userId": "…", "isTyping": true } }
  ```
* `receipt.update`

  ```json
  { "type": "receipt.update", "data": { "conversationId": "…", "userId": "…", "messageId": 123… } }
  ```
* `error`

  ```json
  { "type": "error", "data": { "code": "RATE_LIMIT", "message": "Too many messages" } }
  ```

**Handshake:** Use `Sec-WebSocket-Protocol: bearer,<JWT>` or `Authorization` header on upgrade.

---

## 8) Security & Auth

* **Issuer/Audience:** NextAuth config; Go validates `iss`/`aud` and RSA signature.
* **Scopes/Claims:** include `sub` (user id UUID), `email`, `name`, `exp`.
* **Transport:** HTTPS/WSS only. HSTS at Vercel; TLS terminated by Railway ingress.
* **Input limits:** `body` length cap (e.g., 4000 characters), JSON size cap.
* **Rate limiting:** token bucket per `userId` (e.g., 10 msgs / 5s). In‑memory is fine for demo; can switch to Redis later.

---

## 9) Reliability & Backpressure

* **Ack semantics:** `message.ack` only after Mongo insert succeeds.
* **Retries:** client resends `message.send` with same `clientMsgId` after timeout; server idempotency guarantees single write.
* **Outbound queues:** per-socket buffer cap (e.g., 100). Drop lowest‑priority events first (typing → presence → messages last) with backoff warn.
* **MQ outbox (optional):** If publish to NATS fails, a background projector tails Mongo change streams and republishes to MQ.

---

## 10) Observability

* **Metrics (Prometheus):** `ws_connections`, `ws_messages_in/out_total`, `api_requests_total`, `mongo_insert_latency_ms`, `nats_publish_latency_ms`, `fanout_backlog_gauge`, `rate_limit_drops_total`.
* **Tracing (OTel):** spans for `/v1/messages` → `mongo.insert` → `nats.publish`.
* **Logs:** JSON logs with `trace_id`, `user_id`, `conversation_id`, event type.

---

## 11) Config & Env

**Frontend (Vercel)**

* `NEXTAUTH_URL`
* `NEXTAUTH_SECRET`
* `GITHUB_ID` / `GITHUB_SECRET` (or Google)
* `API_BASE_URL` (Railway API)
* `JWT_ISSUER`, `JWT_AUDIENCE`

**Backend (Railway)**

* `PORT` (injected by Railway)
* `MONGODB_URI`
* `NATS_URL`
* `JWT_PUBLIC_KEY_PEM` (RS256)
* `JWT_ISSUER`, `JWT_AUDIENCE`
* `ALLOWED_ORIGINS` (CORS)

---

## 12) Deployment

* **Vercel:** build Next.js, configure NextAuth providers; set callback URLs.
* **Railway:** Go service (Dockerfile), scale to 2 instances to demonstrate MQ fan‑out.
* **MongoDB Atlas:** free tier; set network access; create indexes at startup.
* **NATS:** managed instance or Railway NATS container; create JetStream stream `CHAT` with subjects `chat.conv.*.msg`.

---

## 13) Testing & Demo Plan

**Local (docker‑compose):**

* Services: `api`, `next`, `mongo`, `nats`, `mongo-express`.

**Unit/Integration:**

* Insert idempotency test (duplicate `clientMsgId`).
* WS echo test (subscribe → send → receive `message.new`).
* Pagination correctness (no gaps/dups across pages).

**Load (k6):**

* 200 VUs send 1 msg/sec across 100 conversations; expect p95 publish+fan‑out < 200ms on laptop.

**Live Demo Script:**

1. Login with GitHub.
2. Create conversation; open incognito as second user.
3. Send message → instant receive.
4. Go offline, queue 2 messages → reconnect → see acks reconcile.
5. Scroll up, show pagination.
6. Show NATS stream and Mongo indexes in UI for credibility.

---

## 14) Risks & Mitigations

* **Hot conversations:** fan‑out pressure → consider per‑room write limits or backpressure; scale WS nodes horizontally; shard messages.
* **Clock skew:** Snowflake uses server time; run single time source (Chrony) or tolerate small skew.
* **MQ outage:** write still succeeds; projector via change streams can backfill publishes.

---

## 15) Roadmap (post‑MVP)

* Attachments with S3/R2 (presigned uploads) + antivirus scan hook.
* Message edits/deletes with audit trail.
* Push notifications (Web Push / Firebase).
* Full‑text search (Atlas Search) with highlighting.
* Basic moderation filters and admin console.
* Read receipts per‑message (receipt table/collection), delivery receipts.
* Presence federation across nodes using ephemeral NATS subjects + shared TTL cache.

---

## 16) Glossary

* **ClientMsgId:** client‑generated UUID to dedupe retries.
* **Snowflake:** time‑sortable 64‑bit id (for order + pagination).
* **JetStream:** NATS persistence layer for durable subjects.
* **Ephemeral Subject:** NATS non‑persisted pub/sub for transient UI signals.

---

## 17) Appendix — Example Snowflake Layout

`[ 41 bits timestamp | 10 bits worker | 12 bits seq ]`

* Epoch: 2025‑01‑01T00:00:00Z
* Worker id: process index or hashed hostname
* Sequence: per‑ms counter
