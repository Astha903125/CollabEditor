import { io } from 'socket.io-client'

/**
 * socket.js — single shared Socket.io instance
 *
 * Why a singleton exported from one file?
 * If every component called io() separately, each would open its own
 * WebSocket connection to the server — multiple connections per browser tab,
 * duplicate events firing, wasted resources.
 *
 * One file imports io() once and exports the result.
 * Every other file that imports socket.js gets the SAME instance.
 * This is the module singleton pattern.
 *
 * autoConnect: false — don't connect immediately when this file is imported.
 * The login page imports this file too, but we don't want a WebSocket
 * connection on the login page. We call socket.connect() explicitly
 * inside useSocket.js only when the user is actually in a room.
 */
const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
  autoConnect: false,
  // Reconnection settings — Socket.io auto-reconnects on network drop
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
})

export default socket
