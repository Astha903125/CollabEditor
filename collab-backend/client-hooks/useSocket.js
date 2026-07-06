/**
 * useSocket — Custom hook encapsulating all Socket.io logic
 *
 * Why a custom hook and not inline in Editor?
 * - Separation of concerns: Editor renders UI, this hook manages the network layer
 * - Testable in isolation: you can test socket behavior without mounting Editor
 * - Reusable: any component that needs socket access just imports this hook
 *
 * The infinite loop problem and why isRemoteChange is a REF not STATE:
 *
 *   When a remote edit arrives, we call editor.setValue(content).
 *   Monaco's onChange fires SYNCHRONOUSLY inside that setValue call.
 *   onChange → emitCodeChange → socket.emit → server broadcasts back → repeat.
 *   That's an infinite loop.
 *
 *   Fix: set isRemoteChange.current = true BEFORE setValue.
 *   emitCodeChange checks this and skips the emit.
 *
 *   Why ref not state?
 *   State updates are ASYNCHRONOUS in React — batched and applied after the
 *   current call stack finishes. By the time the state update lands,
 *   onChange has already fired with the old (false) value → loop continues.
 *
 *   useRef updates are SYNCHRONOUS — isRemoteChange.current = true takes
 *   effect immediately, before Monaco's onChange fires inside setValue.
 */

import { useEffect, useRef, useCallback } from 'react'
import socket from '../socket'

function useSocket(roomId, username, editorRef) {
  const isRemoteChange = useRef(false)

  useEffect(() => {
    if (!roomId || !username) return

    socket.connect()
    socket.emit('join-room', { roomId, username })

    // ── Receive initial document content ───────────────────────────────────
    // The server sends this only to the joining user (socket.emit not socket.to)
    // so existing users don't get a full document reset
    socket.on('load-document', content => {
      if (!editorRef.current) return
      isRemoteChange.current = true
      editorRef.current.setValue(content)
      isRemoteChange.current = false
    })

    // ── Receive remote edits ───────────────────────────────────────────────
    socket.on('code-update', content => {
      if (!editorRef.current) return

      // MUST set flag BEFORE setValue — onChange fires synchronously INSIDE setValue
      isRemoteChange.current = true

      // Save cursor — setValue resets cursor to position 0
      const position = editorRef.current.getPosition()
      const scrollTop = editorRef.current.getScrollTop()

      editorRef.current.setValue(content)

      // Restore cursor and scroll position
      if (position) editorRef.current.setPosition(position)
      editorRef.current.setScrollTop(scrollTop)

      isRemoteChange.current = false
    })

    // ── Receive cursor updates from other users ────────────────────────────
    // These are decorations rendered as colored overlays in Monaco
    socket.on('cursor-update', ({ socketId, username: name, line, column, color }) => {
      if (!editorRef.current) return

      // Monaco decorations API — add a colored cursor marker at their position
      const range = {
        startLineNumber: line, startColumn: column,
        endLineNumber:   line, endColumn:   column + 1,
      }
      editorRef.current.deltaDecorations([], [{
        range,
        options: {
          className: `remote-cursor-${socketId}`,
          hoverMessage: { value: name },
          overviewRuler: { color, position: 1 },
        }
      }])
    })

    // Cleanup on unmount or roomId change
    // Without cleanup, listeners stack up: join room twice = 2 code-update handlers
    // = every remote change applies twice = document doubles up
    return () => {
      socket.off('load-document')
      socket.off('code-update')
      socket.off('cursor-update')
      socket.disconnect()
    }
  }, [roomId, username])

  // Called by Editor on every keystroke
  const emitCodeChange = useCallback(content => {
    if (!isRemoteChange.current) {
      socket.emit('code-change', { roomId, content })
    }
  }, [roomId])

  // Called when cursor moves
  const emitCursorChange = useCallback((line, column, color) => {
    socket.emit('cursor-change', { roomId, username, line, column, color })
  }, [roomId, username])

  return { emitCodeChange, emitCursorChange, isRemoteChange }
}

export default useSocket
