# CollabCode — Real-Time Collaborative Code Editor

A production-grade collaborative code editor where multiple users can write and run code simultaneously in the same room, with changes synced in real time via WebSockets.

**Live Demo:** [collabcode.vercel.app](https://collabcode.vercel.app)

---

## Features

- Real-time code sync across multiple users via WebSockets
- Live user presence — colored badges and typing indicators
- Multi-language support — JavaScript, TypeScript, Python, C++, Java, Rust, Go
- Code execution with output panel
- Collaborative chat per room, persisted to MongoDB
- Version snapshots — save and restore named checkpoints
- JWT authentication with bcrypt password hashing
- Rate-limited endpoints and input validation
- Docker Compose for one-command local setup
- GitHub Actions CI pipeline

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Monaco Editor |
| Real-time | Socket.io, Redis Pub/Sub adapter |
| Backend | Node.js, Express |
| Auth | JWT, bcrypt |
| Database | MongoDB |
| Cache | Redis |
| Container | Docker, Docker Compose |
| CI/CD | GitHub Actions |

---

## Architecture

```
Browser (React + Monaco Editor)
        │
        ├── HTTP  ──▶  Express REST API     (auth, rooms, snapshots)
        └── WS    ──▶  Socket.io            (presence, chat, code sync)
                              │
                              └── Redis Pub/Sub  (multi-server room sync)

Node.js Server
        ├── Redis   ──▶  presence cache (hSet + 24h TTL), document cache
        └── MongoDB ──▶  users, rooms, snapshots, chat history
```

---

## Project Structure

```
collabcode/
├── client/
│   └── src/
│       ├── App.jsx               # Auth state machine
│       ├── socket.js             # Singleton Socket.io instance
│       ├── hooks/
│       │   └── useSocket.js      # Real-time sync, echo prevention
│       ├── pages/
│       │   ├── Auth.jsx          # Login / register
│       │   ├── Lobby.jsx         # Create / join rooms
│       │   └── Editor.jsx        # Monaco editor + panels
│       └── utils/
│           └── api.js            # Centralized API client
│
└── server/
    └── src/
        ├── index.js              # Express + Socket.io + Redis
        ├── models/               # User, Room schemas
        ├── routes/               # auth, rooms
        ├── middleware/           # JWT auth, rate limiting
        └── utils/
            ├── logger.js         # Winston structured logging
            └── executor.js       # Sandboxed code execution
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- MongoDB — local or [Atlas free tier](https://mongodb.com/atlas)
- Redis — local or [Redis Cloud free tier](https://redis.io/try-free)

### Setup

```bash
# Clone
git clone https://github.com/Astha903125/collabcode.git
cd collabcode

# Backend
cd server
cp .env.example .env
npm install
npm run dev

# Frontend (new terminal)
cd client
npm install
npm run dev
# → http://localhost:5173
```

### Docker

```bash
JWT_SECRET=your_secret docker-compose up
```

---

## Deployment

| Service | Purpose | Cost |
|---|---|---|
| [Vercel](https://vercel.com) | Frontend | Free |
| [Render](https://render.com) | Backend | Free |
| [MongoDB Atlas](https://mongodb.com/atlas) | Database | Free |
| [Redis Cloud](https://redis.io/try-free) | Cache + Pub/Sub | Free |

---

## Author

**Astha Kumari**  
[github.com/Astha903125](https://github.com/Astha903125) · [LinkedIn](https://www.linkedin.com/in/astha-kumari-390824290) · asthamehta.8888@gmail.com
