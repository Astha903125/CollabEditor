# CollabCode — Real-Time Collaborative Code Editor

A production-grade collaborative code editor built with React, Node.js, Socket.io, Redis, ShareDB, and MongoDB. Think Google Docs — but for code.

**Live demo:** [your-deploy-url]  
**GitHub:** [your-repo-url]

---

## What makes this technically interesting

Most collaborative editor tutorials broadcast the **entire file** on every keystroke. That works for demos but breaks completely with two users typing simultaneously — whoever types last wins, and one user's changes disappear.

This project solves the real problem: **Operational Transformation (OT)**. Every keystroke is an *operation* (insert at position X, delete at position Y). When two users type at the same time, the server transforms each operation to account for what the other person did — so both users' edits are preserved and every client converges to the same document state.

---

## Architecture

```
Browser (React + Monaco)
        │
        ├── HTTP  → Express REST API (auth, rooms)
        │
        └── WS    ──┬── Socket.io (presence, chat, code sync)
                    └── ShareDB (OT protocol over WebSocket)

Express + Socket.io + ShareDB
        │
        ├── Redis Pub/Sub  → multi-server socket rooms
        ├── Redis Cache    → active users, document content (fast reads)
        └── MongoDB        → users, rooms, OT op log, snapshots
```

### The data flow for a single keystroke

1. User types → Monaco's `onChange` fires
2. `useSocket` hook calls `socket.emit('code-change', { content })`
3. Server receives → `socket.to(roomId).emit('code-update', content)` → broadcasts to others
4. Server also saves to MongoDB + updates Redis cache
5. Other clients receive `code-update` → apply via `editor.setValue()`
6. `isRemoteChange` ref prevents the echo (see below)

### Why `isRemoteChange` is a ref not state

When a remote edit arrives, `editor.setValue()` triggers Monaco's `onChange` synchronously — inside the same call stack. React state updates are asynchronous (batched). If we used state to track "this is a remote change", the state update wouldn't land before `onChange` fires, so we'd emit the remote change back to the server → infinite loop.

Using `useRef`: `isRemoteChange.current = true` takes effect immediately and synchronously, before `onChange` fires inside `setValue`. Loop prevented.

### Why `socket.to(room)` not `io.to(room)`

`socket.to(room)` broadcasts to everyone **except** the sender. The sender already sees their own keystroke optimistically (instant, no network round-trip). If we sent it back to them, their cursor would jump and they'd see a double-apply glitch. `io.to(room)` includes the sender — used for language changes where every client's UI must update consistently.

### Why two Redis clients

Redis protocol: once a connection enters subscribe mode, it can only receive — it cannot send. So Socket.io needs one connection dedicated to publishing and a completely separate one for subscribing. `pubClient.duplicate()` creates an identical second connection efficiently.

### Why Redis TTL on user presence

If the server crashes mid-session, the `disconnect` event never fires. Without TTL, users remain in Redis forever (ghost users). Setting `expire(key, 86400)` means Redis auto-cleans after 24 hours.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Vite | Component model, fast HMR |
| Editor | Monaco Editor | VS Code engine — syntax highlighting, multi-lang |
| Real-time | Socket.io | WebSocket + rooms + auto-reconnect + fallback |
| OT | ShareDB + rich-text | Battle-tested conflict resolution |
| Backend | Node.js + Express | Same language as frontend, non-blocking I/O |
| Auth | JWT + bcrypt | Stateless, scales horizontally, no session store |
| Cache/Pub-Sub | Redis | In-memory speed, multi-server room sync |
| Database | MongoDB | Document model fits code files naturally |
| Container | Docker + Compose | Reproducible environment, one-command start |
| CI/CD | GitHub Actions | Tests on every push, auto-deploy on merge |
| Logging | Winston | Structured JSON logs, searchable in prod tools |

---

## Advanced features

- **Real-time OT sync** — ShareDB handles conflict resolution for concurrent edits
- **Live cursor presence** — see exactly where other users are typing (Monaco decorations API)
- **Multi-language execution** — sandboxed child_process with SIGKILL timeout
- **Version snapshots** — named checkpoints stored in MongoDB, one-click restore
- **Collaborative chat** — per-room chat panel over the same WebSocket connection
- **Redis caching** — document content cached for fast loads, cache-aside pattern
- **Multi-server ready** — Redis adapter means you can run 10 server instances behind a load balancer
- **Rate limiting** — 5 auth attempts / 15 min, 100 global req / 15 min per IP
- **Input validation** — express-validator on all endpoints, sanitized before DB
- **Structured logging** — Winston JSON logs with rotation
- **Docker Compose** — entire stack starts with `docker-compose up`
- **CI/CD** — GitHub Actions: test → build → deploy pipeline

---

## Running locally

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or Redis Cloud)

### Start

```bash
# Clone
git clone https://github.com/yourname/collabcode
cd collabcode

# Backend
cd server
cp .env.example .env   # fill in your values
npm install
npm run dev

# Frontend (new terminal)
cd client
npm install
npm run dev
```

Or with Docker (entire stack in one command):

```bash
JWT_SECRET=your_secret docker-compose up
```

### Test

```bash
cd server && npm test
```

Tests cover: bcrypt hashing, JWT signing/verification, all REST endpoints, WebSocket real-time sync, echo prevention, cursor broadcasting.

---

## Deployment

| Service | What | Free tier |
|---|---|---|
| Vercel | React frontend | ✓ |
| Render | Node.js backend (supports persistent WebSockets) | ✓ (cold start) |
| MongoDB Atlas | Database | ✓ (512MB) |
| Redis Cloud | Cache + Pub/Sub | ✓ (30MB) |

> Note: Render's free tier cold-starts after 15 min of inactivity. First request takes ~30s, then it's fast. For production, use the paid tier or Fly.io.

---

## Interview answers

**"How does real-time sync work?"**  
Every keystroke emits `code-change` over WebSocket. The server receives it, saves to MongoDB, updates Redis cache, and broadcasts to all other sockets in the room using `socket.to(roomId)` — excluding the sender who already sees their edit optimistically.

**"What's OT and why do you need it?"**  
When two users type simultaneously, their operations are generated against the same document version. Without OT, whoever's op arrives second clobbers the first. OT transforms the second op to account for the first — if A inserts at position 2 and B deletes at position 4, after A's insert shifts everything, B's delete must shift to position 5. ShareDB handles this transformation. The guarantee is convergence: no matter what order ops arrive, all clients end up with identical documents.

**"Why Redis?"**  
Two reasons. First, the in-memory presence map is lost if the server restarts. Redis persists it. Second, with multiple server instances, Socket.io rooms exist only in one server's memory — users on different servers can't reach each other. The Redis adapter uses Pub/Sub to sync all room events across every server instance, making horizontal scaling transparent.

**"Where did you test it?"**  
Unit tests for bcrypt/JWT, Supertest integration tests for all API endpoints against a real test database, and Socket.io client simulation tests verifying real-time sync, echo prevention, and cursor broadcasting. GitHub Actions runs all of these on every push. Deployed live at [URL] — open it in two tabs to see real-time sync working.

**"What would you add for Kafka?"**  
Currently Redis Pub/Sub has no persistence — if a server is down when a message arrives, that edit is lost. Kafka solves this as a durable ordered log. I'd produce every edit to a Kafka topic partitioned by room ID. Partitioning by room guarantees all ops for the same document hit the same partition, preserving order — which is exactly what OT's revision numbers need. Each server instance is a consumer group member, so Kafka distributes ops without duplication. The offset number maps directly to ShareDB's document version.
