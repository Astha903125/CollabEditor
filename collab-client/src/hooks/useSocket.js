import { useEffect, useRef, useCallback } from 'react'
import socket from '../socket.js'

/**
 * useSocket — encapsulates ALL Socket.io logic
 *
 * Why a custom hook and not inline in Editor?
 * ─ Separation of concerns: Editor renders UI, this hook manages the network layer
 * ─ Testable in isolation without mounting the full editor
 * ─ Any component can import this hook if it needs socket access
 *
 * ═══════════════════════════════════════════════════════════════
 * THE INFINITE LOOP PROBLEM — interview question #1
 * ═══════════════════════════════════════════════════════════════
 *
 * What goes wrong without isRemoteChange:
 *
 *   Remote edit arrives
 *     → we call editor.setValue(newContent)
 *     → Monaco fires onChange SYNCHRONOUSLY inside setValue
 *     → onChange calls emitCodeChange
 *     → emitCodeChange emits to server
 *     → server broadcasts to everyone in room
 *     → everyone's onChange fires
 *     → everyone emits to server
 *     → INFINITE LOOP
 *
 * Fix: isRemoteChange ref
 *   ─ Set isRemoteChange.current = true BEFORE setValue
 *   ─ In emitCodeChange, skip the emit if isRemoteChange.current is true
 *   ─ Set it back to false AFTER setValue
 *
 * Why REF not STATE?
 *   React state updates are ASYNCHRONOUS — batched and applied after the
 *   current call stack finishes. By the time the state update lands,
 *   Monaco's onChange has already fired with the OLD (false) value.
 *   The loop continues.
 *
 *   useRef updates are SYNCHRONOUS — isRemoteChange.current = true
 *   takes effect IMMEDIATELY, before Monaco's onChange fires inside setValue.
 *   Loop prevented.
 */
export default function useSocket(roomId, username, userColor, editorRef) {
  const isRemoteChange = useRef(false)
  const decorationsRef = useRef([])  // tracks remote cursor decorations

  useEffect(() => {
    if (!roomId || !username) return
    if (socket.connected) return
    // Connect only when entering a room — not on the login page
    socket.connect()
    socket.emit('join-room', { roomId, username, color: userColor })

    // Refresh presence every 30 seconds
  const heartbeat = setInterval(() => {
    socket.emit('heartbeat', { roomId })
  }, 30000)

    // ── Load initial document ──────────────────────────────────────────────
    // Server sends this ONLY to the joining socket (socket.emit, not socket.to)
    // so existing users don't see a full document reset when someone joins
    socket.on('load-document', content => {
      if (!editorRef.current) return
      isRemoteChange.current = true
      editorRef.current.setValue(content)
      isRemoteChange.current = false
    })

    // ── Receive remote edits ───────────────────────────────────────────────
    socket.on('code-update', content => {
      if (!editorRef.current) return

      // MUST set flag BEFORE setValue because onChange fires SYNCHRONOUSLY
      // inside setValue — same call stack, not deferred
      isRemoteChange.current = true

      // Preserve cursor position and scroll — setValue resets both to 0
      const position  = editorRef.current.getPosition()
      const scrollTop = editorRef.current.getScrollTop()

      editorRef.current.setValue(content)

      if (position)  editorRef.current.setPosition(position)
      editorRef.current.setScrollTop(scrollTop)

      isRemoteChange.current = false
    })

    // ── Receive remote cursor positions ────────────────────────────────────
    // Monaco decorations API: renders a colored line/range overlay
    // This is what shows other users' cursors as colored markers
    socket.on('cursor-update', ({ socketId, username: remoteUser, line, column, color }) => {
      if (!editorRef.current) return

      const newDecorations = [{
        range: window.monaco
  ? new window.monaco.Range(line, column, line, column + 1)
  : {
      startLineNumber: line,
      startColumn: column,
      endLineNumber: line,
      endColumn: column + 1,
    },
        options: {
          className: `remote-cursor-${socketId.slice(0, 6)}`,
          hoverMessage: { value: `**${remoteUser}**` },
          overviewRuler: { color, position: 1 },
          // Inline style injected for the cursor color
          beforeContentClassName: `cursor-${socketId.slice(0, 6)}`,
        },
      }]

      // deltaDecorations: replace old decorations for this socket with new ones
      // Returns new decoration IDs — store them so we can update/remove later
      decorationsRef.current = editorRef.current.deltaDecorations(
        decorationsRef.current,
        newDecorations
      )
    })

    // ── Handle user leaving ────────────────────────────────────────────────
    socket.on('user-left', ({ socketId }) => {
      // Remove their cursor decoration when they disconnect
      if (editorRef.current) {
        editorRef.current.deltaDecorations(decorationsRef.current, [])
      }
    })

    // ── Cleanup ────────────────────────────────────────────────────────────
    // CRITICAL: without cleanup, listeners stack on every re-render.
    // If roomId changes and useEffect runs again, you'd have 2 'code-update'
    // handlers — every change would apply twice, document doubles up.
    return () => {
      clearInterval(heartbeat)
      socket.off('load-document')
      socket.off('code-update')
      socket.off('cursor-update')
      socket.off('user-left')
      socket.disconnect()
    }
  }, [roomId, username])  // re-run if room or user changes

  // Called by Editor on every keystroke
  const emitCodeChange = useCallback(content => {
    // Skip if WE applied a remote edit — prevents the echo/infinite-loop
    if (!isRemoteChange.current) {
      socket.emit('code-change', { roomId, content })
    }
  }, [roomId])

  // Called when cursor moves (click, arrow keys)
  const emitCursorChange = useCallback((line, column) => {
    socket.emit('cursor-change', { roomId, username, line, column, color: userColor })
  }, [roomId, username, userColor])

  return { emitCodeChange, emitCursorChange }
}
