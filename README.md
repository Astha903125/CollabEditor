# CollabCode — Real-Time Collaborative Code Editor

A full-stack collaborative code editor built with **React, Node.js, Express, Socket.io, Redis, and MongoDB** that enables multiple users to write, edit, and execute code simultaneously within shared rooms. The application provides low-latency real-time synchronization, authenticated collaboration, persistent chat history, version snapshots, and support for multiple programming languages.

**Live Demo:** https://collab-editor-nine-sigma.vercel.app

---


## Features

* Real-time collaborative editing using **Socket.io** and WebSockets
* Room-based collaboration with authenticated users
* Echo prevention mechanism to eliminate synchronization loops
* Live online presence with colored user badges and typing indicators
* Multi-language code execution (JavaScript, TypeScript, Python, Java, C++, Go, Rust)
* Persistent collaborative chat stored in MongoDB
* Named version snapshots for saving and restoring checkpoints
* JWT authentication with bcrypt password hashing
* Redis-backed presence tracking with automatic expiration (TTL)
* Horizontally scalable real-time communication using Redis Pub/Sub

---

## Tech Stack

| Layer                   | Technology                   |
| ----------------------- | ---------------------------- |
| Frontend                | React, Vite, Monaco Editor   |
| Backend                 | Node.js, Express             |
| Real-time Communication | Socket.io                    |
| Authentication          | JWT, bcrypt                  |
| Database                | MongoDB                      |
| Cache & Messaging       | Redis (Pub/Sub, Hashes, TTL) |
| Containerization        | Docker, Docker Compose       |
| CI/CD                   | GitHub Actions               |

---

## Architecture

```text
                        +----------------------+
                        |      Browser        |
                        | React + Monaco      |
                        +----------+----------+
                                   |
                 +-----------------+-----------------+
                 |                                   |
              HTTP                               WebSocket
                 |                                   |
                 v                                   v
        +------------------+               +------------------+
        |  Express REST API |               |    Socket.io     |
        | Auth • Rooms      |               | Code • Chat      |
        | Snapshots         |               | Presence          |
        +---------+---------+               +---------+---------+
                  \                           /
                   \                         /
                    +-----------------------+
                    |     Node.js Server    |
                    +-----------+-----------+
                                |
                 +--------------+--------------+
                 |                             |
                 v                             v
          +--------------+             +---------------+
          |    Redis     |             |   MongoDB     |
          | Pub/Sub      |             | Users         |
          | Presence     |             | Rooms         |
          | Room Cache   |             | Chat History  |
          | TTL Cleanup  |             | Snapshots     |
          +--------------+             +---------------+
```

---

## Project Structure

```text
collabcode/
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── socket.js
│   │   ├── hooks/
│   │   │   └── useSocket.js
│   │   ├── pages/
│   │   │   ├── Auth.jsx
│   │   │   ├── Lobby.jsx
│   │   │   └── Editor.jsx
│   │   └── utils/
│   │       └── api.js
│   └── public/
│
├── server/
│   ├── src/
│   │   ├── index.js
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── utils/
│   │   │   ├── executor.js
│   │   │   └── logger.js
│   │   └── sockets/
│   └── Dockerfile
│
├── docker-compose.yml
├── .github/
│   └── workflows/
└── README.md
```

---

## Synchronization Strategy

Each editing room maintains a shared document synchronized through **Socket.io**. Whenever a user modifies the editor:

1. The client emits the updated code to the server.
2. The server broadcasts the update to all other clients in the same room.
3. Remote clients apply the update while using an **echo-prevention flag** to avoid infinite synchronization loops.
4. Redis Pub/Sub propagates events across multiple backend instances, enabling horizontal scalability.

---

## Environment Variables

Create a `.env` file inside the `server` directory.

```env
PORT=3001
JWT_SECRET=your_secret_key
MONGO_URI=your_mongodb_connection_string
REDIS_URL=your_redis_connection_string
CLIENT_URL=http://localhost:5173
```

---

## Running Locally

### Prerequisites

* Node.js 18+
* MongoDB (Local or Atlas)
* Redis (Local or Redis Cloud)

### Installation

```bash
git clone https://github.com/Astha903125/collabcode.git

cd collabcode

# Backend
cd server
npm install
cp .env.example .env
npm run dev

# Frontend
cd ../client
npm install
npm run dev
```

The frontend will be available at:

```
http://localhost:5173
```

---

## Docker

```bash
JWT_SECRET=your_secret docker-compose up --build
```

---

## REST API

| Method | Endpoint             | Description                     |
| ------ | -------------------- | ------------------------------- |
| POST   | `/auth/register`     | Register a new user             |
| POST   | `/auth/login`        | Authenticate user               |
| POST   | `/rooms`             | Create a new collaboration room |
| GET    | `/rooms/:id`         | Fetch room details              |
| GET    | `/snapshots/:roomId` | Retrieve saved snapshots        |

---

## Deployment

| Service       | Purpose         | Cost      |
| ------------- | --------------- | --------- |
| Vercel        | Frontend        | Free      |
| Render        | Backend         | Free      |
| MongoDB Atlas | Database        | Free Tier |
| Redis Cloud   | Cache & Pub/Sub | Free Tier |

---

## Future Improvements

* Conflict-free synchronization using **CRDTs** or **Operational Transform**
* Shared file explorer with multiple files
* Collaborative terminal support
* Voice collaboration
* Kubernetes deployment

---

## License

This project is licensed under the **MIT License**.

---

## Author

**Astha Kumari**

* GitHub: https://github.com/Astha903125
* LinkedIn: https://www.linkedin.com/in/astha-kumari-390824290
* Email: [asthamehta.8888@gmail.com](mailto:asthamehta.8888@gmail.com)
