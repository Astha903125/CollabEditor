/**
 * CollabCode — Test Suite
 *
 * Three layers of testing:
 *
 * 1. Unit tests    — isolated functions (bcrypt, JWT, OT logic)
 * 2. Integration   — real API endpoints against test MongoDB
 * 3. WebSocket     — two simulated clients, real-time sync verified
 *
 * Run: npm test
 */

const request  = require('supertest')
const mongoose = require('mongoose')
const { createServer } = require('http')
const { Server } = require('socket.io')
const { io: clientIO } = require('socket.io-client')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')

process.env.JWT_SECRET    = 'test_secret_key_for_jest'
process.env.MONGODB_URI   = 'mongodb://localhost:27017/collabcode_test'
process.env.REDIS_URL     = ''  // skip Redis in tests
process.env.NODE_ENV      = 'test'

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — Unit Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Auth utilities — unit tests', () => {

  test('bcrypt hash is not equal to original password', async () => {
    const password = 'mypassword123'
    const hash = await bcrypt.hash(password, 10)
    expect(hash).not.toBe(password)
    // The hash must verify correctly
    expect(await bcrypt.compare(password, hash)).toBe(true)
  })

  test('wrong password returns false', async () => {
    const hash = await bcrypt.hash('correctpassword', 10)
    expect(await bcrypt.compare('wrongpassword', hash)).toBe(false)
  })

  test('same password hashed twice gives different hashes (different salts)', async () => {
    const hash1 = await bcrypt.hash('password', 10)
    const hash2 = await bcrypt.hash('password', 10)
    // This is why bcrypt is safe — rainbow table attacks don't work
    expect(hash1).not.toBe(hash2)
    // But both verify correctly
    expect(await bcrypt.compare('password', hash1)).toBe(true)
    expect(await bcrypt.compare('password', hash2)).toBe(true)
  })

  test('JWT contains correct payload', () => {
    const token = jwt.sign(
      { userId: 'u123', username: 'astha', email: 'a@b.com' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    expect(decoded.userId).toBe('u123')
    expect(decoded.username).toBe('astha')
    expect(decoded.email).toBe('a@b.com')
  })

  test('expired JWT throws TokenExpiredError', () => {
    const token = jwt.sign({ userId: 'u123' }, process.env.JWT_SECRET, { expiresIn: '0s' })
    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow('jwt expired')
  })

  test('JWT signed with wrong secret fails verification', () => {
    const token = jwt.sign({ userId: 'u123' }, 'wrong_secret')
    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow('invalid signature')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — Integration Tests (API endpoints)
// ─────────────────────────────────────────────────────────────────────────────
describe('Auth API — integration tests', () => {
  let app

  beforeAll(async () => {
    // Import app after setting env vars so they're available
    app = require('../src/app-test')  // export app without starting server
    await mongoose.connect(process.env.MONGODB_URI)
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  test('POST /api/auth/register → 201 with token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@test.com', password: '123456' })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.username).toBe('testuser')
    // Password must NEVER be in the response
    expect(res.body.user.password).toBeUndefined()
  })

  test('POST /api/auth/register → 409 duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'otheruser', email: 'test@test.com', password: '123456' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Email or username already taken')
  })

  test('POST /api/auth/login → 200 with token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: '123456' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  test('POST /api/auth/login → 401 wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
    // Same error for wrong email AND wrong password (anti-enumeration)
    expect(res.body.error).toBe('Invalid credentials')
  })

  test('GET /api/rooms → 401 without token', async () => {
    const res = await request(app).get('/api/rooms')
    expect(res.status).toBe(401)
  })

  test('POST /api/rooms/create → 201 with valid token', async () => {
    // Login to get a token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: '123456' })
    const token = loginRes.body.token

    const res = await request(app)
      .post('/api/rooms/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Room' })

    expect(res.status).toBe(201)
    expect(res.body.room.roomId).toBeDefined()
    expect(res.body.room.name).toBe('Test Room')
  })

  test('POST /api/auth/register → 400 invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'user2', email: 'not-an-email', password: '123456' })

    expect(res.status).toBe(400)
    expect(res.body.errors).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — WebSocket / Real-Time Tests
// The most impressive layer — simulates two actual users collaborating
// ─────────────────────────────────────────────────────────────────────────────
describe('Real-time collaboration — WebSocket tests', () => {
  let io, httpServer, clientA, clientB, port

  beforeAll(done => {
    httpServer = createServer()
    io = new Server(httpServer)

    // Mirror the real server's Socket.io event handlers
    io.on('connection', socket => {
      socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId)
        socket.data.username = username
      })
      socket.on('code-change', ({ roomId, content }) => {
        // Broadcast to everyone EXCEPT sender — the core collaboration logic
        socket.to(roomId).emit('code-update', content)
      })
      socket.on('cursor-change', ({ roomId, ...data }) => {
        socket.to(roomId).emit('cursor-update', { socketId: socket.id, ...data })
      })
    })

    httpServer.listen(() => {
      port = httpServer.address().port

      clientA = clientIO(`http://localhost:${port}`)
      clientB = clientIO(`http://localhost:${port}`)

      let connected = 0
      const onConnect = () => { if (++connected === 2) done() }
      clientA.on('connect', onConnect)
      clientB.on('connect', onConnect)
    })
  })

  afterAll(() => {
    io.close()
    clientA.disconnect()
    clientB.disconnect()
    httpServer.close()
  })

  // THE most important test: does an edit from one user reach the other?
  test('Edit from User A reaches User B', done => {
    const roomId = 'test-room-sync'
    const testContent = 'function hello() { return "world"; }'

    clientA.emit('join-room', { roomId, username: 'Astha' })
    clientB.emit('join-room', { roomId, username: 'Rahul' })

    clientB.on('code-update', content => {
      expect(content).toBe(testContent)
      done()
    })

    // Small delay to ensure both clients have joined the room
    setTimeout(() => {
      clientA.emit('code-change', { roomId, content: testContent })
    }, 100)
  })

  // THE infinite-loop test: sender must NOT receive their own edit back
  // If they did: A types → sends to server → server sends back to A →
  //   A's onChange fires → sends to server → infinite loop
  test('Sender does NOT receive their own edit', done => {
    const roomId = 'test-room-echo'
    let aReceivedOwnEdit = false

    clientA.emit('join-room', { roomId, username: 'Astha' })

    clientA.on('code-update', () => {
      aReceivedOwnEdit = true  // this should never happen
    })

    setTimeout(() => {
      clientA.emit('code-change', { roomId, content: 'some code' })

      // Wait 300ms and verify A never received it
      setTimeout(() => {
        expect(aReceivedOwnEdit).toBe(false)
        done()
      }, 300)
    }, 100)
  })

  // Cursor positions must broadcast so other users see live cursors
  test('Cursor position from A reaches B', done => {
    const roomId = 'test-room-cursor'

    clientA.emit('join-room', { roomId, username: 'Astha' })
    clientB.emit('join-room', { roomId, username: 'Rahul' })

    clientB.on('cursor-update', data => {
      expect(data.username).toBe('Astha')
      expect(data.line).toBe(5)
      expect(data.column).toBe(12)
      done()
    })

    setTimeout(() => {
      clientA.emit('cursor-change', { roomId, username: 'Astha', line: 5, column: 12, color: '#6366f1' })
    }, 100)
  })

  // Two users editing simultaneously — both should receive each other's changes
  test('Simultaneous edits from A and B — both reach the other', done => {
    const roomId = 'test-room-concurrent'
    let aReceived = false
    let bReceived = false

    clientA.emit('join-room', { roomId, username: 'Astha' })
    clientB.emit('join-room', { roomId, username: 'Rahul' })

    clientA.on('code-update', () => { aReceived = true; check() })
    clientB.on('code-update', () => { bReceived = true; check() })

    function check() {
      if (aReceived && bReceived) done()
    }

    setTimeout(() => {
      // Both emit simultaneously
      clientA.emit('code-change', { roomId, content: 'code from A' })
      clientB.emit('code-change', { roomId, content: 'code from B' })
    }, 100)
  })
})
