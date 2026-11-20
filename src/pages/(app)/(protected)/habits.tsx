import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutations, useQuery } from 'deepspace'
import { Plus, Trash2, Pause, Play, Flame } from 'lucide-react'
import {
  Button,
  ConfirmModal,
  Input,
  Label,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@/components/ui'
import { addDays, habitProgress, type DayPoint, type HabitProgress } from '@/lib/patterns'
import { HABIT_SIGNALS, normalizeSignals, type HabitSignal } from '@/lib/signals'
import { formatDay, localToday } from '@/lib/client'
import type { Habit } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useMyEntries } from '@/lib/social'

const WINDOW = 14

export default function HabitsPage() {
  const today = localToday()
  const start = addDays(today, -(WINDOW - 1))
  const { records: habits, status } = useQuery<Habit>('habits', { orderBy: 'createdAt', orderDir: 'asc' })
  const { records: entries } = useMyEntries({ limit: 500 })
  const [creating, setCreating] = useState(false)

  const points: DayPoint[] = useMemo(
    () =>
      entries
        .filter((e) => e.data.status === 'analyzed' && e.data.entryDate >= start)
        .map((e) => ({ date: e.data.entryDate, signals: normalizeSignals(e.data.signals) })),
    [entries, start],
  )

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-light text-foreground">Small habits</h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            No checkboxes to tick. Hearth fills these in from what you tell it each day. Keep them tiny: every day you
            show up is a vote for the person you want to be.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="new-habit">
          <Plus className="h-4 w-4" aria-hidden /> New habit
        </Button>
      </div>

      <div className="mt-8 space-y-4">
        {status === 'loading' ? (
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        ) : habits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <p>No habits yet. Start with one, and make it almost too small to skip.</p>
            <p className="mt-2">
              Or open <Link to="/insights" className="text-foreground underline underline-offset-4">Looking back</Link>, where
              Hearth suggests habits based on your own patterns.
            </p>
          </div>
        ) : (
          habits.map((h) => (
            <HabitCard
              key={h.recordId}
              id={h.recordId}
              habit={h.data}
              progress={h.data.signal ? habitProgress(h.data.signal as HabitSignal, points, start, today) : null}
            />
          ))
        )}
      </div>

      <NewHabitModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function HabitCard({ id, habit, progress }: { id: string; habit: Habit; progress: HabitProgress | null }) {
  const { put, remove, ready } = useMutations<Habit>('habits')
  const [confirming, setConfirming] = useState(false)

  return (
    <article data-testid="habit-card" className={cn('rounded-2xl border border-border bg-card p-5', !habit.active && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-foreground">{habit.name}</h2>
          {habit.identity && <p className="mt-0.5 font-display text-sm italic text-muted-foreground">{habit.identity}</p>}
        </div>
        <div className="flex items-center gap-1">
          {progress && progress.streak >= 2 && (
            <span className="mr-2 inline-flex items-center gap-1 text-sm text-primary" title="Days in a row">
              <Flame className="h-4 w-4" aria-hidden /> {progress.streak}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            disabled={!ready}
            aria-label={habit.active ? 'Pause habit' : 'Resume habit'}
            onClick={() => void put(id, { active: !habit.active })}
          >
            {habit.active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          </Button>
          <Button variant="ghost" size="icon" disabled={!ready} aria-label="Delete habit" onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {(habit.stack || habit.twoMinute) && (
        <dl className="mt-3 space-y-1 text-sm">
          {habit.stack && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">Stack it</dt>
              <dd className="text-foreground/90">{habit.stack}</dd>
            </div>
          )}
          {habit.twoMinute && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">2 minutes</dt>
              <dd className="text-foreground/90">{habit.twoMinute}</dd>
            </div>
          )}
        </dl>
      )}

      {progress ? (
        <>
          <div className="mt-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${progress.days.length}, minmax(0, 1fr))` }}>
            {progress.days.map((d) => (
              <span
                key={d.date}
                title={`${formatDay(d.date)} — ${d.done === null ? 'no entry' : d.done ? 'done' : 'not this day'}`}
                className={cn(
                  'aspect-square rounded',
                  d.done === true && 'bg-primary',
                  d.done === false && 'bg-secondary',
                  d.done === null && 'border border-dashed border-border',
                )}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground" data-testid="habit-status">
            {progress.missedTwice
              ? "Two misses in a row. That's fine, it happens. The rule is never miss twice, so today is the day: just the two-minute version."
              : progress.missedOnce
                ? 'Missed one. One miss is an accident; just don’t let it become two.'
                : `${progress.doneCount} of the last ${progress.days.length} days, ${HABIT_SIGNALS[habit.signal as HabitSignal].label.toLowerCase()}.`}
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Not linked to anything Hearth can notice, so it's a reminder only.</p>
      )}

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          void remove(id)
          setConfirming(false)
        }}
        title="Delete this habit?"
        description="Its history comes from your journal, so nothing in your entries is lost."
        confirmText="Delete"
        variant="destructive"
      />
    </article>
  )
}

function NewHabitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createConfirmed, ready } = useMutations<Habit>('habits')
  const { success, error } = useToast()
  const [name, setName] = useState('')
  const [identity, setIdentity] = useState('')
  const [stack, setStack] = useState('')
  const [twoMinute, setTwoMinute] = useState('')
  const [signal, setSignal] = useState<HabitSignal | ''>('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createConfirmed({ name: name.trim(), identity: identity.trim(), stack: stack.trim(), twoMinute: twoMinute.trim(), signal, active: true })
      success('Habit added')
      setName('')
      setIdentity('')
      setStack('')
      setTwoMinute('')
      setSignal('')
      onClose()
    } catch (e) {
      error('Could not add habit', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>New habit</Modal.Header>
      <Modal.Body>
        <div className="space-y-4">
          <Field label="Habit" hint="Small and specific.">
            <Input data-testid="habit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Eat lunch before 1pm" />
          </Field>
          <Field label="Who this makes you" hint="Identity first: “I'm someone who…”">
            <Input value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="I'm someone who takes care of my energy" />
          </Field>
          <Field label="Stack it" hint="After I [something you already do], I will [this].">
            <Input value={stack} onChange={(e) => setStack(e.target.value)} placeholder="After my 11:30 meeting ends, I will go get lunch" />
          </Field>
          <Field label="Two-minute version" hint="What it looks like on your worst day.">
            <Input value={twoMinute} onChange={(e) => setTwoMinute(e.target.value)} placeholder="Eat the snack in my bag" />
          </Field>
          <Field label="Hearth tracks it by noticing" hint="Filled in from your entries — nothing to check off.">
            <Select value={signal} onValueChange={(v) => setSignal((v as HabitSignal) ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick what Hearth listens for" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(HABIT_SIGNALS) as HabitSignal[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {HABIT_SIGNALS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={!ready || !name.trim()} loading={saving} data-testid="save-habit">
          Add habit
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
