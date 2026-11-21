/* home pattern: product-preview-first — today's notebook page is the home; signed-out visitors see the same page with a sign-in invitation */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuth, useMutations, useQuery } from 'deepspace'
import { Mic, Square, ArrowRight, Users, Lock, Mail } from 'lucide-react'
import { Button, Textarea, useToast } from '@/components/ui'
import { VoiceWave } from '@/components/hearth/VoiceWave'
import { CrisisCard, EntryCard, SpeakButton, Tag } from '@/components/hearth/bits'
import { callAction, formatDay, localToday, transcribe } from '@/lib/client'
import { useRecorder } from '@/lib/useRecorder'
import { lastLetterSeen } from '@/lib/letters'
import { addDays } from '@/lib/patterns'
import { AfterEntry, NeverMissTwice } from '@/components/hearth/AfterEntry'
import type { Entry, Insight } from '@/lib/types'
import { joinNames, useFriends, useMyEntries } from '@/lib/social'

const PROMPTS = [
  'What stayed with you today?',
  'How did your body feel this afternoon?',
  'What took more energy than you expected?',
  'Was there a moment you felt like yourself?',
  'What would you like to let go of tonight?',
]

/** The share toggle remembers your last choice, so sharing is one decision, not one per entry. */
const SHARE_KEY = 'hearth.shareWithFriends'

function readShare() {
  try {
    return localStorage.getItem(SHARE_KEY) === '1'
  } catch {
    return false
  }
}

/** Ruled-paper lines behind the editor, spaced to match its 2rem line height. */
const RULED =
  'bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_calc(2rem-1px),var(--color-border)_calc(2rem-1px),var(--color-border)_2rem)] bg-local leading-8'

function DateLine() {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {formatDay(localToday(), {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })}
    </p>
  )
}

export default function HomePage() {
  const { isSignedIn } = useAuth()
  return isSignedIn ? <Companion /> : <SignedOutPreview />
}

function SignedOutPreview() {
  const [showAuth, setShowAuth] = useState(false)
  return (
    <div className="mx-auto max-w-2xl px-6 pb-20 pt-16 sm:pt-24">
      <DateLine />
      <h1 className="mt-4 font-display text-4xl font-light leading-tight text-foreground sm:text-5xl">
        How was today?
      </h1>
      <VoiceWave levels={[]} active={false} className="mt-8" />
      <p className="mt-6 max-w-lg leading-relaxed text-muted-foreground">
        Talk or write for a minute. Hearth listens, reflects back what it heard, and over a week or two helps you see
        what lifts you and what wears you down.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button size="lg" className="rounded-full px-6" onClick={() => setShowAuth(true)} data-testid="home-sign-in">
          Sign in to start
        </Button>
        <span className="text-sm text-muted-foreground">Private to you. Not even the app's admins can read it.</span>
      </div>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}

type Phase = 'compose' | 'recording' | 'transcribing' | 'saving' | 'thinking'

/** A letter from Hearth stays "new" for a week, until it's opened. */
const LETTER_FRESH_MS = 7 * 24 * 60 * 60 * 1000

function LetterNotice() {
  const { records } = useQuery<Insight>('insights', { orderBy: 'createdAt', orderDir: 'desc', limit: 1 })
  const letter = records[0]
  if (!letter || letter.recordId === lastLetterSeen() || Date.now() - Date.parse(letter.createdAt) > LETTER_FRESH_MS)
    return null
  return (
    <Link
      to="/insights#letter"
      data-testid="letter-notice"
      className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-foreground hover:bg-primary/10"
    >
      <Mail className="h-4 w-4 text-primary" aria-hidden />
      Hearth wrote you a letter about {letter.data.trigger === 'weekly' ? 'your week' : `the last ${letter.data.days} days`}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    </Link>
  )
}

function Companion() {
  const today = localToday()
  // Recent entries feed today's list, the reflection, and Hearth's nudges.
  const { records: recent, status: recentStatus } = useMyEntries({ orderBy: 'createdAt', orderDir: 'desc', limit: 200 })
  const todays = recent.filter((r) => r.data.entryDate === today)
  const [writeDate, setWriteDate] = useState(today)
  const { ready, createConfirmed } = useMutations<Entry>('entries')
  const { error, success } = useToast()
  const recorder = useRecorder()
  const { friends } = useFriends()
  const [share, setShareState] = useState(readShare)
  const setShare = (on: boolean) => {
    setShareState(on)
    try {
      localStorage.setItem(SHARE_KEY, on ? '1' : '0')
    } catch {
      // Storage blocked (private mode): the toggle still works for this visit.
    }
  }
  const sharing = share && friends.length > 0

  const [phase, setPhase] = useState<Phase>('compose')
  const [text, setText] = useState('')
  const [source, setSource] = useState<'text' | 'voice'>('text')
  const [typing, setTyping] = useState(false)
  const [latestId, setLatestId] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const prompt = useMemo(() => PROMPTS[new Date().getDate() % PROMPTS.length], [])
  const textRef = useRef<HTMLTextAreaElement>(null)

  const latest = recent.find((r) => r.recordId === latestId) ?? null
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
        error("I didn't catch anything", 'Try again a little closer to the mic, or write instead.')
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
      const id = await createConfirmed({
        text: body,
        entryDate: writeDate,
        source,
        status: 'pending',
        sharedWith: sharing ? friends.map((f) => f.id) : [],
      })
      setLatestId(id)
      setText('')
      setTyping(false)
      setSource('text')
      setWriteDate(today)
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
      success('Sample data loaded', `${r.created} sample pages: two weeks of journal and an exchange diary with Mia.`)
    } catch (e) {
      error('Could not add the sample journal', e instanceof Error ? e.message : undefined)
    } finally {
      setSeeding(false)
    }
  }

  const clock = `${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')}`
  const statusLine =
    phase === 'recording'
      ? 'Listening…'
      : phase === 'transcribing'
        ? 'Catching your words…'
        : phase === 'saving' || phase === 'thinking'
          ? 'Reading what you wrote…'
          : latest || typing || text
            ? ''
            : 'Talk for a minute, or write. Nothing is shared until you say so.'

  const busy = phase !== 'compose' && phase !== 'recording'

  return (
    <div className="mx-auto max-w-2xl px-6 pb-24 pt-12 sm:pt-20">
      <DateLine />
      <LetterNotice />
      <h1 className="mt-4 font-display text-4xl font-light leading-tight text-foreground sm:text-5xl">
        {latest ? 'Thank you for telling me.' : prompt}
      </h1>

      <VoiceWave levels={recorder.levels} active={phase === 'recording'} className="mt-8" />
      <p className="mt-3 min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {statusLine}
      </p>
      {!latest && phase === 'compose' && !typing && !text && <NeverMissTwice rows={recent} today={today} />}

      {/* First run: a sample journal makes Hearth's memory and patterns visible in a minute */}
      {recentStatus === 'ready' && recent.length === 0 && (
        <div data-testid="first-run" className="mt-6 rounded-xl border border-border bg-card p-5">
          <p className="text-[15px] text-foreground">New here? Give Hearth something to remember.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Load two weeks of sample data (a freelance designer's journal, plus an exchange diary with a friend), then
            tell Hearth about your day. It will connect today to those days and suggest one small thing for tomorrow.
            Remove the sample any time in Settings.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4 rounded-full"
            onClick={() => void seed()}
            loading={seeding}
            data-testid="seed-demo"
          >
            Load two weeks of sample data
          </Button>
        </div>
      )}

      {/* Reflection for the entry just written, as a note in the margin */}
      {latest && latest.data.status !== 'pending' && (
        <section data-testid="reflection" className="mt-8 space-y-4">
          {latest.data.riskFlag ? (
            <>
              {latest.data.reflection && (
                <p className="border-l-2 border-primary pl-5 font-display text-xl font-light leading-relaxed text-foreground">
                  {latest.data.reflection}
                </p>
              )}
              <CrisisCard />
            </>
          ) : latest.data.status === 'failed' ? (
            <p className="text-muted-foreground">
              Your words are saved. I couldn't reflect on them just now; they still count.
            </p>
          ) : (
            <div className="border-l-2 border-primary pl-5">
              <p className="font-display text-xl font-light leading-relaxed text-foreground sm:text-2xl">
                {latest.data.reflection}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {latest.data.moodTags?.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
                {latest.data.reflection && <SpeakButton text={latest.data.reflection} />}
              </div>
              {latest.data.summary && (
                <p className="mt-3 text-sm text-muted-foreground">Noted: {latest.data.summary}</p>
              )}
            </div>
          )}
          {latest.data.status === 'analyzed' && !latest.data.riskFlag && (
            <AfterEntry entry={latest.data} rows={recent} />
          )}
        </section>
      )}

      {/* Composer */}
      <div className="mt-8">
        {typing || text ? (
          <div className="space-y-4">
            <Textarea
              ref={textRef}
              data-testid="entry-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write as much or as little as you like…"
              className={`min-h-[12rem] resize-y rounded-none border-0 border-b border-border bg-transparent px-0 py-0 text-[16px] shadow-none focus-visible:ring-0 ${RULED}`}
              disabled={busy || phase === 'recording'}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                {phase === 'recording' ? (
                  <Button variant="secondary" size="sm" className="rounded-full" onClick={() => void stopRecording()}>
                    <Square className="h-3.5 w-3.5" aria-hidden /> Done · {clock}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    onClick={() => void startRecording()}
                    disabled={busy || recorder.state === 'unsupported'}
                  >
                    <Mic className="h-4 w-4" aria-hidden /> Add by voice
                  </Button>
                )}
                <label className="sr-only" htmlFor="write-date">
                  Which day is this about?
                </label>
                <select
                  id="write-date"
                  data-testid="write-date"
                  value={writeDate}
                  onChange={(e) => setWriteDate(e.target.value)}
                  disabled={busy}
                  className="rounded-full bg-transparent px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map((d, i) => (
                    <option key={d} value={d}>
                      {i === 0
                        ? 'About today'
                        : i === 1
                          ? 'About yesterday'
                          : `About ${formatDay(d, { weekday: 'long' })}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                {friends.length > 0 && (
                  <button
                    type="button"
                    data-testid="share-toggle"
                    aria-pressed={sharing}
                    onClick={() => setShare(!share)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      sharing
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {sharing ? (
                      <Users className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {sharing ? `Also shared with ${joinNames(friends)}` : 'Just for me'}
                  </button>
                )}
                <Button
                  data-testid="save-entry"
                  className="rounded-full px-5"
                  onClick={() => void save()}
                  disabled={!ready || !text.trim() || phase !== 'compose'}
                  loading={phase === 'saving'}
                >
                  Share with Hearth
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-5">
            {phase === 'recording' ? (
              <Button
                size="lg"
                className="rounded-full px-6"
                onClick={() => void stopRecording()}
                aria-label="Stop recording"
              >
                <Square className="h-4 w-4" aria-hidden /> Done · {clock}
              </Button>
            ) : (
              <Button
                size="lg"
                className="rounded-full px-6"
                data-testid="mic-button"
                onClick={() => void startRecording()}
                disabled={busy || recorder.state === 'unsupported'}
                loading={phase === 'transcribing'}
                aria-label="Start talking"
              >
                {phase !== 'transcribing' && <Mic className="h-4 w-4" aria-hidden />} Talk
              </Button>
            )}
            {phase !== 'recording' && (
              <button
                type="button"
                data-testid="type-instead"
                onClick={() => setTyping(true)}
                disabled={busy}
                className="text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground disabled:opacity-50"
              >
                or write instead
              </button>
            )}
          </div>
        )}
        {recorder.state === 'denied' && (
          <p className="mt-3 text-sm text-muted-foreground">Microphone access was blocked. You can write instead.</p>
        )}
      </div>

      {earlier.length > 0 && (
        <section className="mt-16 space-y-3 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Earlier today</h2>
            <Link
              to="/insights"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              All your days <ArrowRight className="h-3 w-3" aria-hidden />
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
