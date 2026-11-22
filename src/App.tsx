import { useEffect, useRef, useState } from 'react'
import { Flashcards } from './components/Flashcards'
import { Quiz } from './components/Quiz'
import { decideRoute, parseFlashcards, parseQuiz } from './lib/router'
import type { Flashcard, QuizQuestion, RouteTarget } from './lib/router'
import { buildFlashcardsPrompt, buildQuizPrompt, buildSummaryPrompt } from './lib/prompts'
import { MockProvider } from './lib/inference'
import type { InferenceKind, InferenceProvider, InferenceSource } from './lib/inference'
import {
  DEFAULT_SETTINGS,
  getServices,
  initFirebase,
  isFirebaseConfigured,
} from './lib/firebase'
import type { RoutingSettings } from './lib/firebase'
import {
  deleteSet,
  loadSets,
  makeSetId,
  saveSet,
  titleFromNotes,
} from './lib/library'
import type { StudySet } from './lib/library'
import { saveSetToCloud } from './lib/sync'
import './App.css'

const SAMPLE_NOTES = [
  'Photosynthesis is how plants make food from light.',
  'Chlorophyll in the leaves absorbs sunlight, mostly red and blue light.',
  'Water enters through the roots and travels up to the leaves.',
  'Carbon dioxide enters through small pores called stomata.',
  'The light reactions split water and release oxygen.',
  'The Calvin cycle then builds glucose from carbon dioxide.',
  'Glucose stores energy the plant uses to grow.',
  'Factors that change the rate are light, carbon dioxide, and temperature.',
].join('\n')

type DeviceState = 'unknown' | 'downloading' | 'ready' | 'unavailable'
type Tab = 'summary' | 'flashcards' | 'quiz'

interface LastRun {
  kind: InferenceKind
  source: InferenceSource
  planned: RouteTarget
  reason: string
  latencyMs: number
  charCount: number
}

function sourceLabel(source: InferenceSource): string {
  if (source === 'on-device') return 'On-device'
  if (source === 'cloud') return 'Cloud'
  return 'Demo'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Try again.'
}

export default function App() {
  const [notes, setNotes] = useState('')
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [preferOnDevice, setPreferOnDevice] = useState(true)
  const [provider, setProvider] = useState<InferenceProvider>(() => new MockProvider())
  const [firebaseReady, setFirebaseReady] = useState(false)
  // True only while config exists and initFirebase has not settled yet.
  // Without it the first paint wrongly claims demo mode on a configured
  // build, because the provider starts as the mock until init resolves.
  const [firebaseConnecting, setFirebaseConnecting] = useState(() =>
    isFirebaseConfigured(),
  )
  const [signedIn, setSignedIn] = useState(false)
  const [settings, setSettings] = useState<RoutingSettings>(DEFAULT_SETTINGS)
  const [deviceState, setDeviceState] = useState<DeviceState>('unknown')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [deviceError, setDeviceError] = useState<string | null>(null)

  const [summary, setSummary] = useState('')
  const [cards, setCards] = useState<Flashcard[]>([])
  const [quiz, setQuiz] = useState<QuizQuestion[]>([])
  const [tab, setTab] = useState<Tab>('summary')
  const [busy, setBusy] = useState<InferenceKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)

  const [sets, setSets] = useState<StudySet[]>(() => loadSets())
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const providerRef = useRef(provider)
  providerRef.current = provider

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    initFirebase()
      .then((services) => {
        if (cancelled) return
        setFirebaseConnecting(false)
        if (services === null) return
        setProvider(services.provider)
        setSettings(services.settings)
        setFirebaseReady(true)
        setSignedIn(services.user !== null)
      })
      .catch((error: unknown) => {
        if (!cancelled) setFirebaseConnecting(false)
        console.warn('Firebase init failed. Demo mode stays on.', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const onDeviceAvailable = deviceState !== 'unavailable'

  const decision = decideRoute({
    charCount: notes.length,
    online,
    preferOnDevice,
    onDeviceAvailable,
    cloudThresholdChars: settings.cloudThresholdChars,
    maxOnDeviceChars: settings.maxOnDeviceChars,
  })

  async function run(kind: InferenceKind) {
    const trimmed = notes.trim()
    if (trimmed.length === 0) {
      setError('Add some notes first.')
      return
    }
    setBusy(kind)
    setError(null)
    const prompt =
      kind === 'summary'
        ? buildSummaryPrompt(trimmed)
        : kind === 'flashcards'
          ? buildFlashcardsPrompt(trimmed)
          : buildQuizPrompt(trimmed)
    try {
      const result = await providerRef.current.generate(prompt, kind)
      if (kind === 'summary') {
        setSummary(result.text)
        setTab('summary')
      } else if (kind === 'flashcards') {
        setCards(parseFlashcards(result.text))
        setTab('flashcards')
      } else {
        setQuiz(parseQuiz(result.text))
        setTab('quiz')
      }
      if (result.source === 'on-device') {
        setDeviceState('ready')
      }
      setLastRun({
        kind,
        source: result.source,
        planned: decision.target,
        reason: decision.reason,
        latencyMs: result.latencyMs,
        charCount: trimmed.length,
      })
    } catch (caught: unknown) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  async function prepareDeviceModel() {
    const current = providerRef.current
    if (!current.initializeDeviceModel) {
      return
    }
    setDeviceState('downloading')
    setDeviceError(null)
    setDownloadProgress(0)
    try {
      await current.initializeDeviceModel((progress) => {
        setDownloadProgress(Math.round(progress * 100))
      })
      setDeviceState('ready')
    } catch (caught: unknown) {
      setDeviceState('unavailable')
      setDeviceError(errorMessage(caught))
    }
  }

  async function saveCurrentSet() {
    const trimmed = notes.trim()
    if (trimmed.length === 0) {
      setError('Add some notes first.')
      return
    }
    const set: StudySet = {
      id: makeSetId(),
      title: titleFromNotes(trimmed),
      notes: trimmed,
      summary,
      flashcards: cards,
      quiz,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setSets(saveSet(set))
    const services = getServices()
    if (services !== null && services.user !== null) {
      try {
        await saveSetToCloud(services.db, services.user.uid, set)
        setSyncMessage('Saved on this device and synced to Firestore.')
      } catch (caught: unknown) {
        setSyncMessage(`Saved on this device. Sync failed: ${errorMessage(caught)}`)
      }
    } else {
      setSyncMessage('Saved on this device. Sign in to sync.')
    }
  }

  function loadSetIntoEditor(set: StudySet) {
    setNotes(set.notes)
    setSummary(set.summary)
    setCards(set.flashcards)
    setQuiz(set.quiz)
    setTab('summary')
    setError(null)
    setLastRun(null)
  }

  function removeSet(id: string) {
    setSets(deleteSet(id))
  }

  const canPrepareModel =
    provider.initializeDeviceModel !== undefined && deviceState !== 'downloading'

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Aral</h1>
          <p>Study offline first. Your notes stay on your device when they can.</p>
        </div>
        <div className="badges">
          <span className={`pill ${online ? 'pill-online' : 'pill-offline'}`}>
            {online ? 'Online' : 'Offline'}
          </span>
          <span className="pill">
            {firebaseConnecting ? 'Connecting…' : provider.label}
          </span>
          {firebaseReady ? (
            <span className="pill">Firebase connected</span>
          ) : firebaseConnecting ? (
            <span className="pill">Connecting…</span>
          ) : (
            <span className="pill">Demo mode</span>
          )}
          {signedIn && <span className="pill">Signed in</span>}
        </div>
      </header>

      {!firebaseReady && !firebaseConnecting && (
        <p className="notice">
          Demo mode is on. No Firebase project is configured yet, so results
          come from a built-in demo provider. Add your Firebase keys to a .env
          file to use real hybrid inference. See the README.
        </p>
      )}

      <main className="layout">
        <section className="editor">
          <label htmlFor="notes">Your notes</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Paste lecture notes here."
            rows={14}
          />
          <p className="count">
            {notes.length} characters · Routing: {decision.target === 'on-device' ? 'On-device' : 'Cloud'} ·{' '}
            {decision.reason}
          </p>
          <div className="row">
            <button type="button" onClick={() => setNotes(SAMPLE_NOTES)}>
              Load sample notes
            </button>
            <button type="button" onClick={() => setNotes('')} disabled={notes.length === 0}>
              Clear
            </button>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={preferOnDevice}
              onChange={(event) => setPreferOnDevice(event.target.checked)}
            />
            Prefer on-device inference when possible
          </label>

          <div className="row">
            <button
              type="button"
              onClick={() => void prepareDeviceModel()}
              disabled={!canPrepareModel}
            >
              {deviceState === 'downloading'
                ? `Preparing on-device model (${downloadProgress}%)`
                : deviceState === 'ready'
                  ? 'On-device model ready'
                  : 'Prepare on-device model'}
            </button>
          </div>
          {deviceState === 'downloading' && (
            <progress value={downloadProgress} max={100}>
              {downloadProgress}%
            </progress>
          )}
          {deviceError !== null && <p className="error">{deviceError}</p>}
          {!firebaseConnecting && !canPrepareModel && provider.initializeDeviceModel === undefined && (
            <p className="hint">
              Model preparation needs Firebase. Demo mode has no model to download.
            </p>
          )}

          <div className="actions">
            <button type="button" onClick={() => void run('summary')} disabled={busy !== null}>
              {busy === 'summary' ? 'Summarizing...' : 'Summarize'}
            </button>
            <button type="button" onClick={() => void run('flashcards')} disabled={busy !== null}>
              {busy === 'flashcards' ? 'Making cards...' : 'Flashcards'}
            </button>
            <button type="button" onClick={() => void run('quiz')} disabled={busy !== null}>
              {busy === 'quiz' ? 'Making quiz...' : 'Quiz'}
            </button>
            <button type="button" onClick={() => void saveCurrentSet()}>
              Save set
            </button>
          </div>
          {error !== null && <p className="error">{error}</p>}

          {lastRun !== null && (
            <p className="run-info">
              Last run: {sourceLabel(lastRun.source)}
              {lastRun.source !== lastRun.planned &&
                ` (planned ${lastRun.planned === 'on-device' ? 'on-device' : 'cloud'}, fell back)`}{' '}
              · {lastRun.latencyMs} ms · {lastRun.charCount} chars · {lastRun.reason}
            </p>
          )}
        </section>

        <section className="results">
          <div className="tabs" role="tablist" aria-label="Results">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'summary'}
              className={tab === 'summary' ? 'active' : ''}
              onClick={() => setTab('summary')}
            >
              Summary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'flashcards'}
              className={tab === 'flashcards' ? 'active' : ''}
              onClick={() => setTab('flashcards')}
            >
              Flashcards ({cards.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'quiz'}
              className={tab === 'quiz' ? 'active' : ''}
              onClick={() => setTab('quiz')}
            >
              Quiz ({quiz.length})
            </button>
          </div>

          {tab === 'summary' && (
            <div className="summary">
              {summary ? (
                summary.split('\n').map((line, index) => <p key={index}>{line}</p>)
              ) : (
                <p>Your summary will appear here.</p>
              )}
            </div>
          )}
          {tab === 'flashcards' && <Flashcards cards={cards} />}
          {tab === 'quiz' && <Quiz questions={quiz} />}
        </section>
      </main>

      <section className="library">
        <h2>Library</h2>
        {syncMessage !== null && <p className="sync">{syncMessage}</p>}
        {sets.length === 0 ? (
          <p>No saved sets yet. Save a set to keep it here.</p>
        ) : (
          <ul>
            {sets.map((set) => (
              <li key={set.id}>
                <button type="button" className="set-title" onClick={() => loadSetIntoEditor(set)}>
                  {set.title}
                </button>
                <span className="set-meta">
                  {set.flashcards.length} cards · {set.quiz.length} questions
                </span>
                <button type="button" onClick={() => removeSet(set.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer>
        <p>
          Aral runs on-device first with Firebase AI Logic and falls back to
          the cloud for long notes. Built for #BuildHybridAI 2026.
        </p>
      </footer>
    </div>
  )
}
