/**
 * CollabCode — Real-Time Collaborative Editor
 * Production-grade Node.js backend
 *
 * Architecture:
 *   Express (HTTP)  ──┐
 *                     ├── httpServer ──── port 3001
 *   Socket.io (WS)  ──┘
 *
 *   ShareDB (OT)  ──── /sharedb WS upgrade ──── MongoDB
 *
 *   Redis ──── Socket.io adapter (multi-server rooms)
 *          └── Session cache (active users, document content)
 */

const express     = require('express')
const mongoose    = require('mongoose')
const cors        = require('cors')
const http        = require('http')
const { Server }  = require('socket.io')
const { createClient } = require('redis')
const { createAdapter } = require('@socket.io/redis-adapter')
const WebSocket   = require('ws')
const WebSocketJSONStream = require('@teamwork/websocket-json-stream')
const ShareDB     = require('sharedb')
const ShareDBMongo = require('sharedb-mongo')
const richText    = require('rich-text')
require('dotenv').config()

const logger      = require('./utils/logger')
const authRoutes  = require('./routes/auth')
const roomRoutes  = require('./routes/rooms')
const Room        = require('./models/Room')
const { helmetMiddleware, globalLimiter, authLimiter } = require('./middleware/security')

// Register OT type — ShareDB uses this for conflict resolution
ShareDB.types.register(richText.type)

const app = express()
const httpServer = http.createServer(app)

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmetMiddleware)
app.use(globalLimiter)
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json({ limit: '10kb' }))  // prevent large payload attacks

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',  authLimiter, authRoutes)
app.use('/api/rooms', roomRoutes)
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }))

// ── Main async startup ─────────────────────────────────────────────────────
async function startServer() {

  // ─ Redis setup ────────────────────────────────────────────────────────────
  // Two clients because Redis protocol doesn't allow a single connection
  // to both publish AND subscribe simultaneously. Once in subscribe mode,
  // a connection can only receive — it can't send. So we need separate ones.
  const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
  const subClient = pubClient.duplicate()

  pubClient.on('error', err => logger.error('Redis pub error', { error: err.message }))
  subClient.on('error', err => logger.error('Redis sub error', { error: err.message }))

  await pubClient.connect()
  await subClient.connect()
  logger.info('Redis connected')
/* cleanup code for testing only — not needed in production (to delete all presence data on server restart)
  const keys = await pubClient.keys("room:*:users");

  if (keys.length) {
    console.log("Deleting:", keys);
    await pubClient.del(...keys);
  }

  console.log("Presence cleaned");
*/
  // Helper: consistent key naming prevents collisions
  // "room:abc123:users" is readable and namespaced
  const roomKey = id => `room:${id}:users`
  const contentKey = id => `room:${id}:content`

  // ─ Socket.io with Redis adapter ──────────────────────────────────────────
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,   // 60s before considering connection dead
    pingInterval: 25000,  // heartbeat every 25s
  })

  // The Redis adapter is what makes multi-server deployments work.
  // Without it: socket rooms exist in one server's memory only.
  // With it: all events go through Redis Pub/Sub, so ANY server
  // instance can reach ANY socket regardless of which server it's on.
  io.adapter(createAdapter(pubClient, subClient))

  // ─ ShareDB setup ─────────────────────────────────────────────────────────
  // ShareDB handles OT (Operational Transformation):
  // - Stores ops (individual edits) in MongoDB
  // - Transforms concurrent ops to guarantee convergence
  // - Every document has a version number; each op increments it
  const shareDBBackend = new ShareDB({
    db: ShareDBMongo(process.env.MONGODB_URI)
  })

  // ShareDB needs its own WebSocket upgrade path (/sharedb)
  // separate from Socket.io's path (/socket.io)
  const shareDBwss = new WebSocket.Server({ noServer: true })

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`)

    if (url.pathname === '/sharedb') {
      shareDBwss.handleUpgrade(request, socket, head, ws => {
        const stream = new WebSocketJSONStream(ws)
        // Each WS connection gets its own ShareDB agent
        // The agent handles the OT protocol: submit ops, subscribe to changes
        shareDBBackend.listen(stream)
      })
    }
  })

  // ─ Socket.io event handlers ───────────────────────────────────────────────
  io.on('connection', socket => {
    logger.info('Client connected', { socketId: socket.id })

    // ── JOIN ROOM ────────────────────────────────────────────────────────────
    // Fires when user opens a room URL in the browser
    socket.on('join-room', async ({ roomId, username }) => {
      try {
        // socket.join() is a Socket.io concept: group sockets into named rooms
        // Any event emitted to a room reaches ALL sockets in it
        // This is purely in-memory (or Redis with adapter) — not a MongoDB room
        socket.join(roomId)

        const Existingusers = await pubClient.hGetAll(roomKey(roomId));

        for (const [sid, name] of Object.entries(Existingusers)) {
            if (name === username) {
                await pubClient.hDel(roomKey(roomId), sid);
            }
        }
        // Persist presence in Redis hash
        // hSet(key, field, value): stores { socketId: username } under room key
        // Perfect for "get all users in this room" with one hGetAll() call
        await pubClient.hSet(roomKey(roomId), socket.id, username)

        // TTL prevents ghost users if server crashes (disconnect never fires)
        // 24 hours = 86400 seconds
        await pubClient.expire(roomKey(roomId), 300)  // 5 minutes

        // Load document for the joining user from Redis cache first (fast),
        // fall back to MongoDB (slightly slower but always accurate)
        const cached = await pubClient.get(contentKey(roomId))
        if (cached) {
          // Cache hit — serve from memory
          socket.emit('load-document', cached)
        } else {
          // Cache miss — hit the DB and warm the cache
          const room = await Room.findOne({ roomId })
          if (room) {
            socket.emit('load-document', room.content)
            await pubClient.set(contentKey(roomId), room.content, { EX: 3600 })
          }
        }

        // Broadcast updated user list to everyone in room
        const usersObj = await pubClient.hGetAll(roomKey(roomId))
        console.log("JOIN:", roomId)
        console.log("Redis users after join:", usersObj)

        const users = Object.entries(usersObj).map(([socketId, name]) => ({ socketId, username: name }))
        io.to(roomId).emit('room-users', users)

        logger.info('User joined room', { username, roomId })

        const room = await Room.findOne({ roomId })
        if (room) {
          socket.emit('load-document', room.content)
          // Send last 50 messages to the joining user
          if (room.messages?.length) {
            socket.emit('chat-history', room.messages.slice(-50))
          }
        }
      } catch (err) {
        logger.error('join-room error', { error: err.message })
        socket.emit('error', 'Failed to join room')
      }
    })

    // ── HEARTBEAT ───────────────────────────────────────────────
    socket.on('heartbeat', async ({ roomId }) => {
      try {
        await pubClient.expire(roomKey(roomId), 300)
      } catch (err) {
        logger.error('heartbeat error', { error: err.message })
      }
    })

    // ── CHAT MESSAGE ─────────────────────────────────────────────────────────
    socket.on('chat-message', async ({ roomId, user, color, text, time }) => {
      // Broadcast to others
      socket.to(roomId).emit('chat-message', { user, color, text, time })

      // Persist to MongoDB
      await Room.findOneAndUpdate(
        { roomId },
        { $push: { messages: { user, color, text, time } } }
      )
    })
    // ── CODE CHANGE ──────────────────────────────────────────────────────────

    // Fires on every keystroke from any client
    socket.on('code-change', async ({ roomId, content }) => {
      try {
        // Broadcast to EVERYONE EXCEPT sender
        // Why exclude sender? They already see their own change optimistically.
        // If we sent it back, they'd apply it twice → cursor jumps, infinite loop.
        socket.to(roomId).emit('code-update', content)

        // Persist to MongoDB (source of truth)
        await Room.findOneAndUpdate(
          { roomId },
          { content, updatedAt: new Date() },
          { new: true }
        )

        // Update Redis cache (1 hour TTL — refreshed on every change)
        // This is the cache-aside pattern: write to both cache and DB
        await pubClient.set(contentKey(roomId), content, { EX: 3600 })
      } catch (err) {
        logger.error('code-change error', { error: err.message })
      }
    })

    // ── CURSOR CHANGE ────────────────────────────────────────────────────────
    // Fires when cursor position changes — enables live cursor presence
    socket.on('cursor-change', ({ roomId, username, line, column, color }) => {
      // Broadcast cursor position to everyone else
      socket.to(roomId).emit('cursor-update', { socketId: socket.id, username, line, column, color })
    })

    // ── LANGUAGE CHANGE ──────────────────────────────────────────────────────
    socket.on('language-change', async ({ roomId, language }) => {
      // Update everyone INCLUDING sender for UI consistency
      io.to(roomId).emit('language-update', language)
      await Room.findOneAndUpdate({ roomId }, { language })
    })

    // ── SNAPSHOT / VERSION ───────────────────────────────────────────────────
    // Save named version checkpoint
    socket.on('save-snapshot', async ({ roomId, label, content, username }) => {
      try {
        await Room.findOneAndUpdate(
          { roomId },
          {
            $push: {
              snapshots: {
                label,
                content,
                author: username,
                createdAt: new Date()
              }
            }
          }
        )
        io.to(roomId).emit('snapshot-saved', { label, author: username, time: new Date().toISOString() })
      } catch (err) {
        logger.error('save-snapshot error', { error: err.message })
      }
    })

    // ── CODE EXECUTION ───────────────────────────────────────────────────────
    // Sandboxed execution via child_process
    socket.on('execute-code', async ({ roomId, code, language }) => {
      try {
        const { execCode } = require('./utils/executor')
        socket.emit('execution-start')
        const result = await execCode(code, language)
        socket.emit('execution-result', result)
        // Broadcast to room so everyone sees the output
        socket.to(roomId).emit('execution-result', result)
      } catch (err) {
        socket.emit('execution-result', { output: '', error: err.message, exitCode: 1 })
      }
    })

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    // Fires automatically when browser tab closes or network drops
    // ── DISCONNECT ───────────────────────────────────────────────────────────
socket.on("disconnecting", async () => {
    //console.log("========== DISCONNECT ==========");
    //console.log("Socket ID:", socket.id);

   // console.log("Rooms:", [...socket.rooms]);

    for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue;

        //console.log("Deleting from:", roomKey(roomId));

        const before = await pubClient.hGetAll(roomKey(roomId));
        //console.log("Before delete:", before);

        await pubClient.hDel(roomKey(roomId), socket.id);

        const after = await pubClient.hGetAll(roomKey(roomId));
        //console.log("After delete:", after);

        io.to(roomId).emit(
            "room-users",
            Object.entries(after).map(([id, username]) => ({
                socketId: id,
                username,
            }))
        );
    }
});
})

  // ─ MongoDB + start ────────────────────────────────────────────────────────
  await mongoose.connect(process.env.MONGODB_URI)
  logger.info('MongoDB connected')

  // httpServer.listen (not app.listen) because Socket.io attached to httpServer
  // app.listen would create a DIFFERENT server that Socket.io can't reach
  httpServer.listen(process.env.PORT || 3001, () => {
    logger.info(`Server running`, { port: process.env.PORT || 3001 })
  })
}

startServer().catch(err => {
  logger.error('Startup failed', { error: err.message })
  process.exit(1)
})
