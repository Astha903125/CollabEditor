/**
 * api.js — centralized API client
 *
 * Why centralize instead of inline fetch() everywhere?
 * ─ One place to change the base URL (dev vs prod)
 * ─ Auth header injected automatically — no copy-paste across every call
 * ─ Error handling is consistent — 401 auto-redirects to login
 * ─ Easy to add request interceptors later (logging, retry logic)
 */

const BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

async function request(path, options = {}) {
  const token = localStorage.getItem('cc_token')

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const data = await res.json()

  // Auto-logout on 401 — token expired or invalid
  if (res.status === 401) {
    localStorage.removeItem('cc_token')
    localStorage.removeItem('cc_user')
    window.location.reload()
  }

  if (!res.ok) throw new Error(data.error || data.errors?.[0]?.message || 'Request failed')

  return data
}

export const api = {
  // Auth
  login:    body => request('/api/auth/login',    { method: 'POST', body: JSON.stringify(body) }),
  register: body => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me:       ()   => request('/api/auth/me'),

  // Rooms
  createRoom: body     => request('/api/rooms/create',          { method: 'POST', body: JSON.stringify(body) }),
  joinRoom:   body     => request('/api/rooms/join',            { method: 'POST', body: JSON.stringify(body) }),
  getRoom:    roomId   => request(`/api/rooms/${roomId}`),
  getMyRooms: ()       => request('/api/rooms'),
  getSnapshots: roomId => request(`/api/rooms/${roomId}/snapshots`),
}
