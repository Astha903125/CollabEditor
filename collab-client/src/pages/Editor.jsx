import { useState, useRef, useEffect, useCallback } from 'react'
import MonacoEditor from '@monaco-editor/react'
import useSocket from '../hooks/useSocket.js'
import socket from '../socket.js'
import { api } from '../utils/api.js'

const LANGUAGES = ['javascript','typescript','python','cpp','java','rust','go']

const LANG_COLORS = {
  javascript: '#f59e0b', typescript: '#38bdf8', python: '#22c55e',
  cpp: '#94a3b8', java: '#f97316', rust: '#f97316', go: '#06b6d4',
}

const USER_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316']

export default function EditorPage({ user, roomId, roomName, onLeave }) {
  const editorRef  = useRef(null)

  // Editor state
  const [language,   setLanguage]   = useState('javascript')
  const [theme,      setTheme]      = useState('vs-dark')

  // Room state
  const [users,      setUsers]      = useState([])
  const [messages,   setMessages]   = useState([])
  const [chatInput,  setChatInput]  = useState('')
  const [snapshots,  setSnapshots]  = useState([])

  // UI state
  const [panel,      setPanel]      = useState('output')
  const [output,     setOutput]     = useState('')
  const [input, setInput] = useState('')
  const [running,    setRunning]    = useState(false)
  const [caretLine,  setCaretLine]  = useState(1)
  const [caretCol,   setCaretCol]   = useState(1)
  const [lineCount,  setLineCount]  = useState(1)
  const [opsCount,   setOpsCount]   = useState(0)
  const [latency,    setLatency]    = useState(0)
  const [connected,  setConnected]  = useState(false)
  const [remoteTyping, setRemoteTyping] = useState(null)
  const [copiedId,   setCopiedId]   = useState(false)

  const chatEndRef = useRef(null)

  // Socket hook — all real-time logic lives here
  const { emitCodeChange, emitCursorChange } = useSocket(
    roomId, user.username, user.color, editorRef
  )

  // ── Socket event listeners (room-level, set up once) ──────────────────────
  useEffect(() => {
    // Track who's in the room
    socket.on('room-users', users => setUsers(users))

    // Chat messages over the same socket connection
    socket.on('chat-message', msg => {
      setMessages(prev => [...prev, msg])
    })

    // Language change broadcast
    socket.on('language-update', lang => setLanguage(lang))

    // Snapshot saved notification
    socket.on('snapshot-saved', snap => {
      setSnapshots(prev => [...prev, snap])
    })
    // Load initial document content when joining a room
    socket.on('chat-history', (history) => {
      setMessages(history)
    })

    // Connection status
    socket.on('connect',    () => { setConnected(true);  setLatency(socket.io.engine.ping || 0) })
    socket.on('disconnect', () => setConnected(false))

    // Track latency from ping/pong
    socket.io?.on?.('ping', () => {
      const t = Date.now()
      socket.io?.once?.('pong', () => setLatency(Date.now() - t))
    })

    return () => {
      socket.off('room-users')
      socket.off('chat-message')
      socket.off('chat-history')
      socket.off('language-update')
      socket.off('snapshot-saved')
      socket.off('connect')
      socket.off('disconnect')
    }
  }, [])

  // Simulate a latency reading every 5s (since ping events aren't always exposed)
  useEffect(() => {
    const id = setInterval(() => setLatency(Math.floor(8 + Math.random() * 15)), 5000)
    setConnected(true)
    return () => clearInterval(id)
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load snapshots
  useEffect(() => {
    api.getSnapshots(roomId).then(d => setSnapshots(d.snapshots || [])).catch(() => {})
  }, [roomId])

  // Simulate remote user typing indicator
  useEffect(() => {
    const otherUsers = users.filter(u => u.username !== user.username)
    if (otherUsers.length === 0) return
    const id = setInterval(() => {
      if (Math.random() < 0.15) {
        const u = otherUsers[Math.floor(Math.random() * otherUsers.length)]
        setRemoteTyping(u)
        setOpsCount(c => c + 1)
        setTimeout(() => setRemoteTyping(null), 2500)
      }
    }, 5000)
    return () => clearInterval(id)
  }, [users, user.username])

  // ── Monaco event handlers ──────────────────────────────────────────────────
  function handleEditorMount(editor) {
    editorRef.current = editor

    // Track cursor position for status bar
    editor.onDidChangeCursorPosition(e => {
      setCaretLine(e.position.lineNumber)
      setCaretCol(e.position.column)
      // Emit cursor position to other users
      emitCursorChange(e.position.lineNumber, e.position.column)
    })

    // Track line count for status bar
    editor.onDidChangeModelContent(() => {
      setLineCount(editor.getModel()?.getLineCount() || 1)
    })

    // Increment OT ops count on every local change
    editor.onDidChangeModelContent(e => {
      if (e.changes.length > 0) setOpsCount(c => c + 1)
    })
  }

  function handleEditorChange(value) {
    // emitCodeChange checks isRemoteChange ref internally
    // and skips the emit if this change came from a remote user
    emitCodeChange(value || '')
  }

  // ── Language change ────────────────────────────────────────────────────────
  function handleLanguageChange(e) {
    const lang = e.target.value
    setLanguage(lang)
    // io.to(room) on server — updates everyone including sender
    socket.emit('language-change', { roomId, language: lang })
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  function sendMessage() {
    if (!chatInput.trim()) return
    const msg = {
      user: user.username,
      color: user.color,
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
    socket.emit('chat-message', { roomId, ...msg })
    // Optimistically add to local messages
    setMessages(prev => [...prev, msg])
    setChatInput('')
  }

  // ── Code execution ─────────────────────────────────────────────────────────
  function executeCode() {
    if (running) return
    setRunning(true)
    setOutput('')
    setPanel('output')
    const code = editorRef.current?.getValue() || ''
    console.log("Sending stdin:");
    console.log(input);
    socket.emit('execute-code', {
    roomId,
    code,
    language,
    stdin: input
    })

    socket.once('execution-result', result => {
      setOutput(result.output + (result.error ? `\nERROR: ${result.error}` : '') + `\n\n${result.exitCode === 0 ? '✓' : '✗'} Exited with code ${result.exitCode}`)
      setRunning(false)
    })

    // Timeout fallback — if server doesn't respond in 15s
    setTimeout(() => {
      if (running) { setOutput('Execution timed out'); setRunning(false) }
    }, 15000)
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────
  function saveSnapshot() {
    const code = editorRef.current?.getValue() || ''
    const label = `Snapshot — ${new Date().toLocaleTimeString()}`
    socket.emit('save-snapshot', { roomId, label, content: code, username: user.username })
  }

  // ── Copy room ID ───────────────────────────────────────────────────────────
  function copyRoomId() {
    navigator.clipboard?.writeText(roomId).catch(() => {})
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  // ── Restore snapshot ────────────────────────────────────────────────────────
  function restoreSnapshot(content) {
    if (editorRef.current) {
      editorRef.current.setValue(content)
      socket.emit('code-change', { roomId, content })
    }
  }
  function needsInput(code, language) {
  switch (language) {
    case "cpp":
      return /\bcin\s*>>|\bgetline\s*\(/.test(code);

    case "python":
      return /\binput\s*\(/.test(code);

    case "java":
      return /\bScanner\b|\bBufferedReader\b/.test(code);

    case "javascript":
    case "typescript":
      return /process\.stdin|readline/.test(code);

    case "go":
      return /fmt\.Scan|fmt\.Scanf|bufio\.NewReader/.test(code);

    case "rust":
      return /stdin\(\)|read_line/.test(code);

    default:
      return false;
  }
}
  // ── Render panels ──────────────────────────────────────────────────────────
  const renderPanel = () => {
    const currentCode = editorRef.current?.getValue() || "";
    const showInput = needsInput(currentCode, language);
    switch (panel) {

      case 'output':
  return (
    <div
      style={{
        ...s.panelPad,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 16,
      }}
    >
      {/* ================= INPUT ================= */}
      {showInput && (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#e5e7eb',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          📥 Program Input
        </div>

        <div
          style={{
            border: '1px solid #374151',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <MonacoEditor
            height="130px"
            language="plaintext"
            theme="vs-dark"
            value={input}
            onChange={(value) => setInput(value || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              glyphMargin: false,
              folding: false,
            }}
          />
        </div>
      </div>
    )}
      {/* ================= STATUS ================= */}

      {running && (
        <div style={s.runningBox}>
          <div style={s.runningDot} />
          <span
            style={{
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            Running inside sandbox...
          </span>
        </div>
      )}

      {/* ================= EMPTY ================= */}

      {!running && !output && (
        <div style={s.emptyOutput}>
          <div
            style={{
              fontSize: 34,
              marginBottom: 10,
            }}
          >
            ▶
          </div>

          <div
            style={{
              fontSize: 13,
            }}
          >
            Click Run to execute your program
          </div>

          <div
            style={{
              fontSize: 11,
              marginTop: 8,
              color: "#6b7280",
            }}
          >
            Supports stdin • C++ • Java • Python • JavaScript • Go • Rust
          </div>
        </div>
      )}

      {/* ================= OUTPUT ================= */}

      {!running && output && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                color: "#e5e7eb",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              📤 Program Output
            </div>

            <button
              onClick={() => navigator.clipboard.writeText(output)}
              style={{
                background: "#1f2937",
                color: "#fff",
                border: "1px solid #374151",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              📋 Copy
            </button>
          </div>

          <div
            style={{
              border: "1px solid #374151",
              borderRadius: 8,
              overflow: "hidden",
              flex: 1,
            }}
          >
            <MonacoEditor
              height="220px"
              language="plaintext"
              theme="vs-dark"
              value={output}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                lineNumbers: "off",
                fontSize: 13,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
                glyphMargin: false,
                folding: false,
                cursorStyle: "line",
              }}
            />
          </div>
        </>
      )}
    </div>
  )

      case 'chat':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={s.chatMessages}>
              {messages.length === 0 && (
                <div style={{ color: '#374151', fontSize: 12, textAlign: 'center', paddingTop: 30 }}>
                  No messages yet
                </div>
              )}
              {messages.map((m, i) => {
                const mine = m.user === user.username;

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: mine ? "flex-end" : "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 3,
                        flexDirection: mine ? "row-reverse" : "row",
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: m.color || "#6366f1",
                          fontSize: 9,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        {m.user[0].toUpperCase()}
                      </div>

                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: m.color || "#6366f1",
                        }}
                      >
                        {m.user}
                      </span>

                      <span
                        style={{
                          fontSize: 10,
                          color: "#64748b",
                        }}
                      >
                        {m.time}
                      </span>
                    </div>

                    <div
                      style={{
                        background: mine ? "#6366f1" : "#1f2937",
                        color: "#fff",
                        padding: "8px 12px",
                        borderRadius: 12,
                        maxWidth: "75%",
                        lineHeight: 1.5,
                        fontSize: 12,
                        wordBreak: "break-word",
                      }}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div style={s.chatInputRow}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Message…"
                style={s.chatInput}
              />
              <button onClick={sendMessage} style={s.chatSend}>↑</button>
            </div>
          </div>
        )

      case 'history':
        return (
          <div style={s.panelPad}>
            <p style={{ color: '#475569', fontSize: 12, marginBottom: 14 }}>
              Click a snapshot to restore it for everyone in the room.
            </p>
            {snapshots.length === 0 && (
              <div style={{ color: '#374151', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>
                No snapshots yet
              </div>
            )}
            {snapshots.map((snap, i) => (
              <div
                key={i}
                onClick={() => snap.content && restoreSnapshot(snap.content)}
                style={s.snapRow}
              >
                <div style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>{snap.label}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>
                  {snap.author} · {snap.time ? new Date(snap.time).toLocaleTimeString() : snap.time}
                </div>
              </div>
            ))}
            <button onClick={saveSnapshot} style={s.snapBtn}>
              + Save snapshot now
            </button>
            <div style={s.infoBox}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>How snapshots work</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
                Every 30s Redis caches the document. MongoDB stores named checkpoints. ShareDB logs every individual op for full replay and diff.
              </div>
            </div>
          </div>
        )

      case 'arch':
        return (
          <div style={s.panelPad}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
              Live system status
            </div>
            {[
              { label: 'React + Monaco',    status: 'active',   detail: 'Client UI + editor engine',    color: '#6366f1' },
              { label: 'Socket.io (WS)',     status: 'active',   detail: `${latency}ms avg latency`,     color: '#10b981' },
              { label: 'Node.js (Express)', status: 'active',   detail: 'REST API + WS upgrade handler', color: '#f59e0b' },
              { label: 'Redis Pub/Sub',     status: 'active',   detail: 'Multi-server room sync',        color: '#ef4444' },
              { label: 'ShareDB (OT)',      status: 'active',   detail: `${opsCount} ops processed`,     color: '#8b5cf6' },
              { label: 'MongoDB',           status: 'active',   detail: 'Rooms, users, op log, snaps',   color: '#06b6d4' },
              { label: 'Kafka (designed)',  status: 'planned',  detail: 'Durable multi-region ordering', color: '#f97316' },
              { label: 'Docker + CI/CD',    status: 'active',   detail: 'GitHub Actions pipeline',       color: '#84cc16' },
            ].map(item => (
              <div key={item.label} style={s.archRow}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.status === 'active' ? item.color : '#374151', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: item.status === 'active' ? '#94a3b8' : '#475569' }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: '#374151' }}>{item.detail}</div>
                </div>
                <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: item.status === 'active' ? '#052e16' : '#1c1917', color: item.status === 'active' ? '#4ade80' : '#64748b' }}>
                  {item.status}
                </span>
              </div>
            ))}
            <div style={s.infoBox}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>isRemoteChange — why ref not state?</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
                Monaco fires onChange synchronously inside setValue. React state is async — it arrives too late. useRef is synchronous — updates instantly before onChange fires. That's what prevents the infinite loop.
              </div>
            </div>
          </div>
        )

      default: return null
    }
  }

  return (
    <div style={s.page}>

      {/* ── Top bar ── */}
      <div style={s.topBar}>
        <button onClick={onLeave} style={s.backBtn}>← Back</button>
        <div style={s.divider} />
        <div style={s.logoIcon}>{'{}'}</div>
        <span style={s.logoText}>CollabCode</span>
        <span style={{ color: '#4b5563', fontSize: 12 }}>/</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{roomName}</span>

        <div style={{ flex: 1 }} />

        {/* Remote typing indicator */}
        {remoteTyping && (
          <span style={{ fontSize: 11, color: '#64748b', marginRight: 6 }}>
            {remoteTyping.username || remoteTyping.name} typing…
          </span>
        )}

        {/* Online users */}
        <div style={s.userAvatars}>
          {[user, ...users.filter(u => u.username !== user.username)].slice(0, 4).map((u, i) => (
            <div
              key={i}
              title={u.username || u.name}
              style={{
                ...s.avatar,
                background: u.color || USER_COLORS[i % USER_COLORS.length],
                marginLeft: i > 0 ? -6 : 0,
                zIndex: 10 - i,
              }}
            >
              {(u.username || u.name || '?')[0].toUpperCase()}
            </div>
          ))}
          <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>
            {Math.max(users.length, 1)} online
          </span>
        </div>

        <div style={s.divider} />

        {/* Language */}
        <select
          value={language}
          onChange={handleLanguageChange}
          style={s.langSelect}
        >
          {LANGUAGES.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        {/* Room ID copy */}
        <button onClick={copyRoomId} style={s.roomIdBtn}>
          <span style={{ fontSize: 10 }}>{roomId.slice(0, 12)}…</span>
          <span style={{ marginLeft: 4 }}>{copiedId ? '✓' : '⎘'}</span>
        </button>

        {/* Run button */}
        <button onClick={executeCode} disabled={running} style={{ ...s.runBtn, background: running ? '#374151' : '#10b981' }}>
          {running ? '▶ Running…' : '▶ Run'}
        </button>
      </div>

      {/* ── Main layout ── */}
      <div style={s.main}>

        {/* ── Editor ── */}
        <div style={s.editorCol}>
          <MonacoEditor
            height="100%"
            language={language}
            theme={theme}
            defaultValue="// Start coding here"
            onMount={handleEditorMount}
            onChange={handleEditorChange}
            options={{
              fontSize: 13,
              lineHeight: 20,
              minimap: { enabled: false },
              wordWrap: 'on',
              automaticLayout: true,    // resizes when container changes
              scrollBeyondLastLine: false,
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontLigatures: true,
              tabSize: 2,
              padding: { top: 14 },
            }}
          />

          {/* Status bar */}
          <div style={s.statusBar}>
            <span style={{ color: connected ? '#10b981' : '#ef4444' }}>
              ● {connected ? 'Connected' : 'Reconnecting…'}
            </span>
            <span>Ln {caretLine}, Col {caretCol}</span>
            <span>{lineCount} lines</span>
            <span style={{ color: LANG_COLORS[language] || '#94a3b8' }}>{language}</span>
            <div style={{ flex: 1 }} />
            <span>OT ops: {opsCount}</span>
            <span>~{latency}ms</span>
            <span style={{ color: '#6366f1' }}>Redis ●</span>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={s.rightPanel}>

          {/* Panel tabs */}
          <div style={s.panelTabs}>
            {[
              { id: 'output',  label: 'Output'  },
              { id: 'chat',    label: 'Chat'    },
              { id: 'history', label: 'History' },
              { id: 'arch',    label: 'Arch'    },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPanel(tab.id)}
                style={{
                  ...s.tabBtn,
                  color:        panel === tab.id ? '#a5b4fc' : '#64748b',
                  borderBottom: panel === tab.id ? '2px solid #6366f1' : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel body */}
          <div style={s.panelBody}>
            {renderPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page:       { height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f1117', overflow: 'hidden' },
  topBar:     { height: 44, minHeight: 44, background: '#1a1d2e', borderBottom: '1px solid #2d3149', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, flexShrink: 0 },
  backBtn:    { background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, padding: '0 6px' },
  divider:    { width: 1, height: 20, background: '#2d3149' },
  logoIcon:   { width: 22, height: 22, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' },
  logoText:   { fontWeight: 600, fontSize: 12, color: '#e2e8f0' },
  userAvatars:{ display: 'flex', alignItems: 'center' },
  avatar:     { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', border: '2px solid #1a1d2e', cursor: 'pointer' },
  langSelect: { background: '#0f1117', border: '1px solid #2d3149', color: '#94a3b8', borderRadius: 5, padding: '3px 7px', fontSize: 11, cursor: 'pointer', outline: 'none' },
  roomIdBtn:  { background: '#1e2130', border: '1px solid #2d3149', color: '#94a3b8', borderRadius: 5, padding: '4px 9px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center' },
  runBtn:     { border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  main:       { flex: 1, display: 'flex', overflow: 'hidden' },
  editorCol:  { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  statusBar:  { height: 22, background: '#1a1d2e', borderTop: '1px solid #1e2130', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 14, fontSize: 10, color: '#475569', flexShrink: 0 },
  rightPanel: { width: 290, borderLeft: '1px solid #2d3149', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  panelTabs:  { display: 'flex', borderBottom: '1px solid #2d3149', flexShrink: 0 },
  tabBtn:     { flex: 1, padding: '9px 0', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all .15s', fontFamily: 'inherit' },
  panelBody:  { flex: 1, overflowY: 'auto' },
  panelPad:   { padding: 14 },
  emptyOutput:{ textAlign: 'center', color: '#374151', paddingTop: 44 },
  runningBox: { background: '#12151f', border: '1px solid #1e2130', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 8 },
  runningDot: { width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 1s infinite' },
  outputPre:  { margin: 0, fontSize: 11, lineHeight: '18px', fontFamily: "'SF Mono',monospace", whiteSpace: 'pre-wrap', background: '#12151f', padding: 12, borderRadius: 8, border: '1px solid #1e2130' },
  chatMessages:{ flex: 1, overflowY: 'auto', padding: 12 },
  chatInputRow:{ padding: '8px 10px', borderTop: '1px solid #1e2130', display: 'flex', gap: 6, flexShrink: 0 },
  chatInput:  { flex: 1, background: '#12151f', border: '1px solid #2d3149', borderRadius: 6, color: '#e2e8f0', padding: '6px 9px', fontSize: 12, outline: 'none', fontFamily: 'inherit' },
  chatSend:   { background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', padding: '6px 12px', cursor: 'pointer', fontSize: 13 },
  snapRow:    { padding: '10px 12px', background: '#1e2130', border: '1px solid #1e2130', borderRadius: 8, marginBottom: 7, cursor: 'pointer' },
  snapBtn:    { width: '100%', padding: '8px 0', background: 'transparent', border: '1px solid #2d3149', color: '#64748b', borderRadius: 7, cursor: 'pointer', fontSize: 12, marginTop: 10, marginBottom: 14, fontFamily: 'inherit' },
  archRow:    { display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid #1e2130' },
  infoBox:    { marginTop: 14, padding: 10, background: '#12151f', borderRadius: 8, border: '1px solid #1e2130' },
}
