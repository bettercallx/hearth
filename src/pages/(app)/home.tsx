/* home pattern: product-preview-first — the listening companion is the home; signed-out visitors see it idle with a sign-in invitation */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuth, useMutations, useQuery } from 'deepspace'
import { Keyboard, Mic, Square, Loader2, ArrowRight } from 'lucide-react'
import { Button, Textarea, useToast } from '@/components/ui'
import { ListeningOrb, type OrbMode } from '@/components/hearth/ListeningOrb'
import { CrisisCard, EntryCard, SpeakButton, Tag } from '@/components/hearth/bits'
import { callAction, localToday, transcribe } from '@/lib/client'
import { useRecorder } from '@/lib/useRecorder'
import type { Entry } from '@/lib/types'

const PROMPTS = [
  'What stayed with you today?',
  'How did your body feel this afternoon?',
  'What took more energy than you expected?',
  'Was there a moment you felt like yourself?',
  'What would you like to let go of tonight?',
]

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Still up?'
  if (h < 12) return 'Good morning.'
  if (h < 18) return 'Good afternoon.'
  return 'Good evening.'
}

export default function HomePage() {
  const { isSignedIn } = useAuth()
  return isSignedIn ? <Companion /> : <SignedOutPreview />
}

function SignedOutPreview() {
  const [showAuth, setShowAuth] = useState(false)
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <ListeningOrb mode="idle" />
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-light text-foreground sm:text-4xl">{greeting()} How was today?</h1>
        <p className="text-muted-foreground">
          Talk or type for a minute. Hearth listens, reflects back what it heard, and over a week or two helps you see
          what lifts you and what wears you down.
        </p>
      </div>
      <Button size="lg" onClick={() => setShowAuth(true)} data-testid="home-sign-in">
        Sign in to start
      </Button>
      <p className="text-xs text-muted-foreground/80">Your entries are private to you — not even the app owner can read them.</p>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}

type Phase = 'compose' | 'recording' | 'transcribing' | 'saving' | 'thinking'

function Companion() {
  const today = localToday()
  const { records: todays } = useQuery<Entry>('entries', { where: { entryDate: today }, orderBy: 'createdAt', orderDir: 'desc' })
  const { records: anyEntries, status: anyStatus } = useQuery<Entry>('entries', { limit: 1 })
  const { ready, createConfirmed } = useMutations<Entry>('entries')
  const { error, success } = useToast()
  const recorder = useRecorder()

  const [phase, setPhase] = useState<Phase>('compose')
  const [text, setText] = useState('')
  const [source, setSource] = useState<'text' | 'voice'>('text')
  const [typing, setTyping] = useState(false)
  const [latestId, setLatestId] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const prompt = useMemo(() => PROMPTS[new Date().getDate() % PROMPTS.length], [])
  const textRef = useRef<HTMLTextAreaElement>(null)

  const latest = todays.find((r) => r.recordId === latestId) ?? null
  const earlier = todays.filter((r) => r.recordId !== latestId)

  // The reflection arrives over the realtime socket when the action writes it.
  useEffect(() => {
    if (phase === 'thinking' && latest && latest.data.status !== 'pending') setPhase('compose')
  }, [phase, latest])

  useEffect(() => {
    if (typing) textRef.current?.focus()
  }, [typing])

  const startRecording = async () => {
    setLatestId(null)
    await recorder.start()
    setPhase('recording')
  }

  const stopRecording = async () => {
    const blob = await recorder.stop()
    if (!blob.size) return setPhase('compose')
    setPhase('transcribing')
    try {
      const words = await transcribe(blob)
      if (!words) {
        error("I didn't catch anything", 'Try again a little closer to the mic, or type instead.')
      } else {
        setText((t) => (t ? `${t}\n\n${words}` : words))
        setSource('voice')
        setTyping(true)
      }
    } catch (e) {
      error('Could not transcribe', e instanceof Error ? e.message : undefined)
    } finally {
      setPhase('compose')
    }
  }

  const save = async () => {
    const body = text.trim()
    if (!body) return
    setPhase('saving')
    try {
      const id = await createConfirmed({ text: body, entryDate: today, source, status: 'pending' })
      setLatestId(id)
      setText('')
      setTyping(false)
      setSource('text')
      setPhase('thinking')
      await callAction('analyzeEntry', { entryId: id })
    } catch (e) {
      setPhase('compose')
      error('Hearth could not respond', e instanceof Error ? e.message : undefined)
    }
  }

  const seed = async () => {
    setSeeding(true)
    try {
      const r = await callAction<{ created: number }>('seedDemo', { today })
      success('Demo journal added', `${r.created} days of sample entries are in your journal.`)
    } catch (e) {
      error('Could not add demo data', e instanceof Error ? e.message : undefined)
    } finally {
      setSeeding(false)
    }
  }

  const orbMode: OrbMode = phase === 'recording' ? 'listening' : phase === 'compose' ? 'idle' : 'thinking'
  const statusLine =
    phase === 'recording'
      ? `Listening… ${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')}`
      : phase === 'transcribing'
        ? 'Catching your words…'
        : phase === 'saving' || phase === 'thinking'
          ? 'Sitting with what you said…'
          : null

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 pb-20 pt-10 sm:pt-14">
      <ListeningOrb mode={orbMode} level={recorder.level} size={200} />

      <h1 className="mt-6 text-center font-display text-3xl font-light text-foreground sm:text-[2.5rem] sm:leading-tight">
        {latest ? 'Thank you for telling me.' : `${greeting()} ${prompt}`}
      </h1>
      <p className="mt-3 h-5 text-sm text-muted-foreground" aria-live="polite">
        {statusLine ?? (latest ? '' : 'Tap the mic and just talk. Hearth will listen.')}
      </p>

      {/* Reflection for the entry just written */}
      {latest && latest.data.status !== 'pending' && (
        <section data-testid="reflection" className="mt-6 w-full space-y-4">
          {latest.data.riskFlag ? (
            <>
              {latest.data.reflection && (
                <p className="text-center font-display text-xl font-light leading-relaxed text-foreground">{latest.data.reflection}</p>
              )}
              <CrisisCard />
            </>
          ) : latest.data.status === 'failed' ? (
            <p className="text-center text-muted-foreground">Your words are saved. I couldn't reflect on them just now — they will still count.</p>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="font-display text-xl font-light leading-relaxed text-foreground sm:text-2xl">{latest.data.reflection}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {latest.data.moodTags?.map((t) => <Tag key={t}>{t}</Tag>)}
                {latest.data.reflection && <SpeakButton text={latest.data.reflection} />}
              </div>
              {latest.data.summary && <p className="mt-4 text-sm text-muted-foreground">Noted: {latest.data.summary}</p>}
            </div>
          )}
        </section>
      )}

      {/* Composer */}
      <div className="mt-8 w-full">
        {typing || text ? (
          <div className="space-y-3">
            <Textarea
              ref={textRef}
              data-testid="entry-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write as much or as little as you like…"
              className="min-h-[160px] resize-y rounded-2xl bg-card p-4 text-[15px] leading-relaxed"
              disabled={phase !== 'compose'}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => void startRecording()} disabled={phase !== 'compose' || recorder.state === 'unsupported'}>
                  <Mic className="h-4 w-4" aria-hidden /> Add by voice
                </Button>
                {phase === 'recording' && (
                  <Button variant="secondary" size="sm" onClick={() => void stopRecording()}>
                    <Square className="h-3.5 w-3.5" aria-hidden /> Done talking
                  </Button>
                )}
              </div>
              <Button data-testid="save-entry" onClick={() => void save()} disabled={!ready || !text.trim() || phase !== 'compose'}>
                {phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Share with Hearth
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {phase === 'recording' ? (
              <button
                type="button"
                onClick={() => void stopRecording()}
                className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_8px_rgba(233,138,77,0.15)] transition-transform hover:scale-105"
                aria-label="Stop recording"
              >
                <Square className="h-5 w-5" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                data-testid="mic-button"
                onClick={() => void startRecording()}
                disabled={phase !== 'compose' || recorder.state === 'unsupported'}
                className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
                aria-label="Start talking"
              >
                {phase === 'transcribing' ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
              </button>
            )}
            {recorder.state === 'denied' && (
              <p className="text-sm text-muted-foreground">Microphone access was blocked. You can type instead.</p>
            )}
            <button
              type="button"
              data-testid="type-instead"
              onClick={() => setTyping(true)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <Keyboard className="h-4 w-4" aria-hidden /> I'd rather type
            </button>
          </div>
        )}
      </div>

      {/* First run: offer a demo journal so patterns are visible right away */}
      {anyStatus === 'ready' && anyEntries.length === 0 && (
        <div className="mt-12 w-full rounded-2xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Patterns need a week or two of entries. Want to see what Hearth notices? Load ten days of a sample journal
            (you can remove it any time in Settings).
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void seed()} loading={seeding} data-testid="seed-demo">
            Load a sample journal
          </Button>
        </div>
      )}

      {earlier.length > 0 && (
        <section className="mt-12 w-full space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Earlier today</h2>
            <Link to="/journal" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Whole journal <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          {earlier.map((r) => (
            <EntryCard key={r.recordId} id={r.recordId} createdAt={r.createdAt} entry={r.data} showDate={false} />
          ))}
        </section>
      )}
    </div>
  )
}
