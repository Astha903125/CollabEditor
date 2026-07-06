import { useState, useEffect } from 'react'

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

export default function LobbyPage({ user, onJoin, onLogout }) {
  const [roomId,  setRoomId]  = useState('')
  const [rooms,   setRooms]   = useState([])
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  // Load user's recent rooms on mount
  useEffect(() => {
    fetchMyRooms()
  }, [])

  async function fetchMyRooms() {
    try {
      const token = localStorage.getItem('cc_token')
      const res = await fetch(
        `${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/rooms`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        setRooms(data.rooms || [])
      }
    } catch { /* ignore — rooms list is non-critical */ }
  }

  async function createRoom() {
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('cc_token')
      const res = await fetch(
        `${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/rooms/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: `${user.username}'s Room`, language: 'javascript' }),
        }
      )
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create room'); return }
      onJoin(data.room.roomId, data.room.name)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function joinRoom() {
    if (!roomId.trim()) { setError('Enter a room ID'); return }
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('cc_token')
      const res = await fetch(
        `${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/rooms/join`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ roomId: roomId.trim() }),
        }
      )
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Room not found'); return }
      onJoin(data.room.roomId, data.room.name)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const langColor = { javascript: '#f59e0b', typescript: '#38bdf8', python: '#22c55e', cpp: '#94a3b8', java: '#f97316', rust: '#f97316', go: '#06b6d4' }

  return (
    <div style={styles.page}>
      {/* Nav */}
      <nav style={styles.nav}>
        <div style={styles.navLeft}>
          <div style={styles.logoIcon}>{'{}'}</div>
          <span style={styles.logoText}>CollabCode</span>
        </div>
        <div style={styles.navRight}>
          <div style={{ ...styles.avatar, background: user.color || COLORS[0] }}>
            {user.username[0].toUpperCase()}
          </div>
          <span style={styles.username}>{user.username}</span>
          <button onClick={onLogout} style={styles.signOutBtn}>Sign out</button>
        </div>
      </nav>

      {/* Content */}
      <div style={styles.content}>
        <div style={styles.inner}>
          <h1 style={styles.heading}>Your workspace</h1>
          <p style={styles.subheading}>Create a room or join one to start coding together</p>

          {/* Actions */}
          <div style={styles.actionGrid}>
            <button onClick={createRoom} disabled={loading} style={styles.createBtn}>
              <span style={{ fontSize: 22, marginBottom: 8, display: 'block' }}>＋</span>
              <span style={{ fontWeight: 600, fontSize: 15, display: 'block' }}>Create room</span>
              <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, marginTop: 3, display: 'block' }}>
                Start a new session
              </span>
            </button>

            <div style={styles.joinCard}>
              <div style={styles.joinLabel}>Join by Room ID</div>
              <input
                placeholder="Paste room ID here…"
                value={roomId}
                onChange={e => { setRoomId(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && joinRoom()}
                style={styles.joinInput}
              />
              {error && <div style={styles.error}>{error}</div>}
              <button onClick={joinRoom} disabled={loading} style={styles.joinBtn}>
                Join room
              </button>
            </div>
          </div>

          {/* Recent rooms */}
          {rooms.length > 0 && (
            <div>
              <div style={styles.sectionLabel}>Recent rooms</div>
              {rooms.map(r => (
                <button
                  key={r.roomId}
                  onClick={() => onJoin(r.roomId, r.name)}
                  style={styles.roomRow}
                >
                  <div style={{ flex: 1 }}>
                    <div style={styles.roomName}>{r.name}</div>
                    <div style={styles.roomMeta}>
                      <span style={{ color: langColor[r.language] || '#94a3b8' }}>{r.language}</span>
                      {' · '}
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={styles.joinArrow}>→</span>
                </button>
              ))}
            </div>
          )}

          {rooms.length === 0 && (
            <div style={styles.emptyState}>
              No rooms yet — create one above to get started
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page:        { height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f1117', overflow: 'hidden' },
  nav:         { padding: '12px 24px', borderBottom: '1px solid #2d3149', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  navLeft:     { display: 'flex', alignItems: 'center', gap: 10 },
  logoIcon:    { width: 28, height: 28, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: '#fff' },
  logoText:    { fontWeight: 700, fontSize: 16, color: '#e2e8f0' },
  navRight:    { display: 'flex', alignItems: 'center', gap: 10 },
  avatar:      { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' },
  username:    { color: '#94a3b8', fontSize: 13 },
  signOutBtn:  { background: 'transparent', border: '1px solid #2d3149', color: '#64748b', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 },
  content:     { flex: 1, overflowY: 'auto', padding: '40px 24px' },
  inner:       { maxWidth: 720, margin: '0 auto' },
  heading:     { fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 },
  subheading:  { color: '#64748b', fontSize: 14, marginBottom: 32 },
  actionGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 40 },
  createBtn:   { padding: '22px 24px', background: '#6366f1', border: 'none', borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'left' },
  joinCard:    { background: '#1e2130', borderRadius: 12, border: '1px solid #2d3149', padding: '22px 24px' },
  joinLabel:   { fontSize: 13, color: '#64748b', marginBottom: 10 },
  joinInput:   { width: '100%', padding: '9px 12px', background: '#0f1117', border: '1px solid #2d3149', borderRadius: 7, color: '#e2e8f0', fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  error:       { color: '#f87171', fontSize: 12, marginBottom: 10 },
  joinBtn:     { width: '100%', padding: '8px 0', background: 'transparent', border: '1px solid #4f46e5', color: '#818cf8', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  sectionLabel:{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  roomRow:     { display: 'flex', alignItems: 'center', width: '100%', padding: '13px 16px', background: '#1e2130', border: '1px solid #2d3149', borderRadius: 10, cursor: 'pointer', textAlign: 'left', marginBottom: 8 },
  roomName:    { color: '#e2e8f0', fontWeight: 500, fontSize: 14 },
  roomMeta:    { color: '#64748b', fontSize: 12, marginTop: 3 },
  joinArrow:   { color: '#4b5563', fontSize: 16 },
  emptyState:  { textAlign: 'center', color: '#374151', fontSize: 13, padding: '40px 0' },
}
