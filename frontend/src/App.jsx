import { useMemo, useState } from 'react'
import { useYjsRoom } from './hooks/useYjsRoom.js'
import { useToasts } from './hooks/useToasts.js'
import Editor from './components/Editor.jsx'
import PresencePanel from './components/PresencePanel.jsx'
import ConnectionStatus from './components/ConnectionStatus.jsx'
import RoomBar from './components/RoomBar.jsx'
import QuestProgress from './components/QuestProgress.jsx'
import Toasts from './components/Toasts.jsx'
import { randomIdentity } from './utils/randomIdentity.js'

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8)
}

function getOrCreateRoomId() {
  const params = new URLSearchParams(window.location.search)
  let room = params.get('room')
  if (!room) {
    room = generateRoomId()
    params.set('room', room)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }
  return room
}

function getOrCreateIdentity() {
  // sessionStorage is per-tab, so each browser tab you open gets a stable
  // identity across refreshes but a distinct one from other tabs — handy
  // for the "does refresh recover state" test without renaming yourself
  // every time.
  const cached = sessionStorage.getItem('p2p-editor-identity')
  if (cached) return JSON.parse(cached)
  const identity = randomIdentity()
  sessionStorage.setItem('p2p-editor-identity', JSON.stringify(identity))
  return identity
}

/**
 * RoomApp is keyed by roomId at the mount point below so that the entire
 * Yjs/WebRTC stack (created inside useYjsRoom) is torn down and recreated
 * from scratch if the user ever navigates to a different room, instead of
 * trying to mutate a live Y.Doc/WebrtcProvider into pointing at a new room.
 */
function RoomApp({ roomId, identity }) {
  const { doc, provider, status, peers, ready } = useYjsRoom(roomId, identity)
  const toasts = useToasts(peers, status)

  return (
    <div className="app">
      <Toasts toasts={toasts} />

      <header className="app-header">
        <div className="app-title">
          <h1>⚔️ SyncQuest</h1>
          <span className="app-subtitle">a peer-to-peer realm editor</span>
        </div>
        <ConnectionStatus status={status} />
      </header>

      <RoomBar roomId={roomId} />

      {ready && <QuestProgress doc={doc} />}

      <main className="app-main">
        {ready ? (
          <Editor doc={doc} awareness={provider.awareness} />
        ) : (
          <div className="editor-loading">📜 Unrolling your scroll…</div>
        )}
        <PresencePanel peers={peers} />
      </main>
    </div>
  )
}

export default function App() {
  const [roomId] = useState(getOrCreateRoomId)
  const identity = useMemo(getOrCreateIdentity, [])

  return <RoomApp key={roomId} roomId={roomId} identity={identity} />
}
