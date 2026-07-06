import { useState, useEffect } from 'react'
import AuthPage  from './pages/Auth.jsx'
import LobbyPage from './pages/Lobby.jsx'
import EditorPage from './pages/Editor.jsx'

/**
 * App.jsx — root component, owns all top-level state
 *
 * Three possible screens (no React Router needed — simple state machine):
 *   !user              → AuthPage  (login / register)
 *   user && !room      → LobbyPage (create / join room)
 *   user && room       → EditorPage (the actual editor)
 *
 * Auth state persisted in localStorage so the user stays logged in
 * across browser refreshes. On mount, useEffect reads the stored
 * token and user — if both exist, skip straight to the lobby.
 */
export default function App() {
  const [user, setUser] = useState(null)
  const [room, setRoom] = useState(null)   // { id, name }

  // Rehydrate auth state from localStorage on first load
  useEffect(() => {
    try {
      const storedUser  = localStorage.getItem('cc_user')
      const storedToken = localStorage.getItem('cc_token')
      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser))
      }
    } catch {
      // Corrupted storage — clear it and force re-login
      localStorage.removeItem('cc_user')
      localStorage.removeItem('cc_token')
    }
  }, [])

  function handleLogin(userData, token) {
    localStorage.setItem('cc_token', token)
    localStorage.setItem('cc_user', JSON.stringify(userData))
    setUser(userData)
  }

  function handleLogout() {
    localStorage.removeItem('cc_token')
    localStorage.removeItem('cc_user')
    setUser(null)
    setRoom(null)
  }

  function handleJoinRoom(roomId, roomName) {
    setRoom({ id: roomId, name: roomName })
  }

  function handleLeaveRoom() {
    setRoom(null)
  }

  if (!user)  return <AuthPage  onLogin={handleLogin} />
  if (!room)  return <LobbyPage user={user} onJoin={handleJoinRoom} onLogout={handleLogout} />
  return (
    <EditorPage
      user={user}
      roomId={room.id}
      roomName={room.name}
      onLeave={handleLeaveRoom}
    />
  )
}
