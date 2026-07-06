import { useState } from 'react'

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

/**
 * AuthPage — login / register
 *
 * On success: calls onLogin(user, token)
 * Parent (App.jsx) stores them in localStorage and sets user state.
 *
 * Error messages are deliberately vague for login ("Invalid credentials")
 * to prevent user enumeration — an attacker shouldn't know whether
 * the email exists or the password is wrong.
 */
export default function AuthPage({ onLogin }) {
  const [mode,    setMode]    = useState('login')
  const [form,    setForm]    = useState({ username: '', email: '', password: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError('')
    if (!form.email || !form.password)   { setError('Email and password are required'); return }
    if (mode === 'register' && !form.username) { setError('Username is required'); return }

    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const res = await fetch(
        `${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        // Show first validation error or the server's error message
        const msg = data.errors?.[0]?.message || data.error || 'Something went wrong'
        setError(msg)
        return
      }

      // Assign a random avatar color if server didn't set one
      const user = { ...data.user, color: data.user.color || COLORS[Math.floor(Math.random() * COLORS.length)] }
      onLogin(user, data.token)

    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Logo */}
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}>{'{}'}</div>
          <span style={styles.logoText}>CollabCode</span>
        </div>
        <p style={styles.tagline}>Real-time collaborative code editor</p>

        <div style={styles.card}>
          {/* Mode toggle */}
          <div style={styles.toggleWrap}>
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                style={{ ...styles.toggleBtn, ...(mode === m ? styles.toggleActive : {}) }}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {/* Fields */}
          {mode === 'register' && (
            <input
              placeholder="Username (3–20 chars, letters/numbers/_)"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              style={styles.input}
            />
          )}
          <input
            placeholder="Email address"
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            style={styles.input}
          />
          <input
            placeholder="Password (min 6 characters)"
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{ ...styles.input, marginBottom: 0 }}
          />

          {/* Error */}
          {error && <div style={styles.error}>{error}</div>}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p style={styles.hint}>
            {mode === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '}
            <span
              style={{ color: '#818cf8', cursor: 'pointer' }}
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    height: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#0f1117', padding: '24px',
  },
  container: { width: '100%', maxWidth: 380 },
  logoRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginBottom: 6,
  },
  logoIcon: {
    width: 36, height: 36,
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    borderRadius: 10, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff',
  },
  logoText: { fontWeight: 700, fontSize: 22, color: '#e2e8f0', letterSpacing: -0.5 },
  tagline:  { textAlign: 'center', color: '#64748b', fontSize: 13, marginBottom: 28 },
  card: {
    background: '#1e2130', borderRadius: 14,
    border: '1px solid #2d3149', padding: 28,
  },
  toggleWrap: {
    display: 'flex', background: '#0f1117',
    borderRadius: 8, padding: 3, marginBottom: 20,
  },
  toggleBtn: {
    flex: 1, padding: '7px 0', border: 'none', borderRadius: 6,
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: 'transparent', color: '#64748b', transition: 'all .15s',
  },
  toggleActive: { background: '#6366f1', color: '#fff' },
  input: {
    width: '100%', padding: '9px 12px', marginBottom: 12,
    background: '#0f1117', border: '1px solid #2d3149',
    borderRadius: 7, color: '#e2e8f0', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  },
  error: {
    color: '#f87171', fontSize: 12, marginTop: 10, marginBottom: 10,
    padding: '8px 10px', background: '#2d1515', borderRadius: 6,
  },
  submitBtn: {
    width: '100%', marginTop: 14, padding: '10px 0',
    background: '#6366f1', color: '#fff', border: 'none',
    borderRadius: 8, cursor: 'pointer', fontWeight: 600,
    fontSize: 14, transition: 'opacity .15s',
  },
  hint: {
    color: '#475569', fontSize: 12, textAlign: 'center',
    marginTop: 14, marginBottom: 0,
  },
}
