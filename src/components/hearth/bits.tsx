import { useState } from 'react'
import { LifeBuoy, Lock, Mic, Users, Volume2, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { callAction, formatDay, speak } from '@/lib/client'
import type { Entry } from '@/lib/types'
import { useMutations, useQuery, useUserLookup } from 'deepspace'
import { joinNames, useFriends } from '@/lib/social'
import { ConfirmModal, useToast } from '@/components/ui'

/** Cool dusk for low days, warming to sunlight for good ones (theme tokens). */
const MOOD_COLORS = [1, 2, 3, 4, 5].map((n) => `var(--hearth-mood-${n})`)
const MOOD_WORDS = ['very low', 'low', 'okay', 'good', 'very good']

export function moodColor(mood: number | null | undefined) {
  if (mood == null) return 'var(--color-muted)'
  return MOOD_COLORS[Math.min(4, Math.max(0, Math.round(mood) - 1))]
}

export function moodWord(mood: number | null | undefined) {
  return mood == null ? 'unrated' : MOOD_WORDS[Math.min(4, Math.max(0, Math.round(mood) - 1))]
}

export function MoodDot({ mood, className }: { mood: number | null | undefined; className?: string }) {
  return (
    <span
      title={`Mood: ${moodWord(mood)}`}
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ background: moodColor(mood) }}
    />
  )
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground', className)}>
      {children}
    </span>
  )
}

export function CrisisCard() {
  return (
    <div role="alert" data-testid="crisis-card" className="rounded-xl border border-primary/40 bg-primary/10 p-5">
      <div className="flex items-start gap-3">
        <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-2 text-sm leading-relaxed">
          <p className="font-medium text-foreground">It sounds like you are carrying something really heavy. You don't have to carry it alone.</p>
          <p className="text-muted-foreground">
            If you are in the US, you can call or text <strong className="text-foreground">988</strong> (Suicide &amp; Crisis
            Lifeline) any time. Elsewhere, <a className="underline underline-offset-2 hover:text-foreground" href="https://findahelpline.com" target="_blank" rel="noreferrer">findahelpline.com</a> lists free, confidential lines near you. If you are in immediate danger, call your local emergency number.
          </p>
          <p className="text-muted-foreground">Hearth won't analyze this entry for patterns. It's saved privately, just for you.</p>
        </div>
      </div>
    </div>
  )
}

export function SpeakButton({ text, className }: { text: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const { error } = useToast()
  const play = async () => {
    setState('loading')
    try {
      const url = await speak(text)
      const audio = new Audio(url)
      audio.onended = () => setState('idle')
      setState('playing')
      await audio.play()
    } catch (e) {
      setState('idle')
      error('Could not play voice', e instanceof Error ? e.message : undefined)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void play()}
      disabled={state !== 'idle'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60',
        className,
      )}
    >
      {state === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
      {state === 'playing' ? 'Speaking…' : 'Hear it'}
    </button>
  )
}

/** An analysis that hasn't landed after this long is treated as stuck. */
const STUCK_MS = 60_000

export function EntryCard({
  entry,
  id,
  createdAt,
  showDate = true,
}: {
  entry: Entry
  id: string
  createdAt: string
  showDate?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { removeConfirmed, put, ready } = useMutations<Entry>('entries')
  const { error } = useToast()
  const { friends } = useFriends()
  const sharedWith = entry.sharedWith ?? []
  const sharedFriends = friends.filter((f) => sharedWith.includes(f.id))
  const canShare = friends.length > 0 && !entry.riskFlag
  const stuck = entry.status === 'failed' || (entry.status === 'pending' && Date.now() - Date.parse(createdAt) > STUCK_MS)
  const retry = async () => {
    setRetrying(true)
    try {
      await callAction('analyzeEntry', { entryId: id })
    } catch (e) {
      error('Still could not read it', e instanceof Error ? e.message : undefined)
    } finally {
      setRetrying(false)
    }
  }
  return (
    <article id={`entry-${entry.entryDate}`} data-testid="entry-card" data-entry-id={id} className="rounded-xl border border-border bg-card p-5">
      <header className="flex items-center gap-3">
        <MoodDot mood={entry.mood} />
        {showDate && <span className="text-sm font-medium text-foreground">{formatDay(entry.entryDate)}</span>}
        {entry.source === 'voice' && <Mic className="h-3.5 w-3.5 text-muted-foreground" aria-label="Spoken entry" />}
        <div className="flex flex-wrap gap-1.5">
          {entry.moodTags?.map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {sharedFriends.length > 0 && (
            <span data-testid="shared-badge" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Shared in your exchange diary">
              <Users className="h-3 w-3" aria-hidden /> {joinNames(sharedFriends)}
            </span>
          )}
          {entry.isDemo && <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">demo</span>}
        </div>
      </header>

      {stuck ? (
        <p className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          Not read yet — your words are saved.
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="text-foreground underline underline-offset-4 disabled:opacity-60"
          >
            {retrying ? 'Trying…' : 'Try again'}
          </button>
        </p>
      ) : (
        entry.status === 'pending' && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Hearth is reading this…
          </p>
        )
      )}
      {entry.riskFlag ? (
        <p className="mt-3 text-sm text-muted-foreground">A hard moment, kept private.</p>
      ) : (
        entry.summary && <p className="mt-3 text-[15px] text-foreground">{entry.summary}</p>
      )}

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          aria-expanded={open}
          aria-controls={`entry-body-${id}`}
        >
          {open ? 'Hide entry' : 'Read entry'}
        </button>
        {open && canShare && (
          <button
            type="button"
            data-testid="toggle-share"
            disabled={!ready}
            onClick={() => void put(id, { sharedWith: sharedFriends.length ? [] : friends.map((f) => f.id) })}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {sharedFriends.length ? <Lock className="h-3 w-3" aria-hidden /> : <Users className="h-3 w-3" aria-hidden />}
            {sharedFriends.length ? 'Make private' : `Share with ${joinNames(friends)}`}
          </button>
        )}
        {open && (
          <button
            type="button"
            data-testid="delete-entry"
            disabled={!ready}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" aria-hidden /> Delete
          </button>
        )}
      </div>
      <Replies entryId={id} />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          removeConfirmed(id).catch((e: unknown) => error('Could not delete', e instanceof Error ? e.message : undefined))
        }}
        title="Delete this entry?"
        description="It's removed for good, and it stops counting toward your patterns."
        confirmText="Delete"
        variant="destructive"
      />
      {open && (
        <div id={`entry-body-${id}`} className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{entry.text}</p>
          {entry.reflection && !entry.riskFlag && (
            <p className="font-display text-[15px] italic leading-relaxed text-foreground/90">“{entry.reflection}”</p>
          )}
        </div>
      )}
    </article>
  )
}

export type Reply = { userId?: string; entryId: string; text?: string; emoji?: string; participants: string[] }

/** Friends' replies and reactions on an entry, live. Renders nothing when there are none. */
export function Replies({ entryId, className }: { entryId: string; className?: string }) {
  const { records } = useQuery<Reply>('replies', { where: { entryId }, orderBy: 'createdAt', orderDir: 'asc' })
  const { getName } = useUserLookup()
  if (!records.length) return null
  return (
    <ul data-testid="replies" className={cn('mt-4 space-y-2 border-t border-border pt-3', className)}>
      {records.map((r) => (
        <li key={r.recordId} className="flex items-baseline gap-2 text-sm">
          <span className="shrink-0 font-medium text-foreground">{(getName(r.data.userId ?? '') ?? 'Friend').split(' ')[0]}</span>
          {r.data.emoji && <span aria-label="reaction">{r.data.emoji}</span>}
          {r.data.text && <span className="text-muted-foreground">{r.data.text}</span>}
        </li>
      ))}
    </ul>
  )
}
