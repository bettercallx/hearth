/**
 * The two windows beside Hearth on the desk: Looking back (left) and the
 * exchange diary (right). Each is a small, live preview that opens its full
 * page; both fade away while you write, so the middle stays yours.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useQuery, useUserLookup } from 'deepspace'
import { ArrowUpRight, Mail } from 'lucide-react'
import { formatDay, localToday } from '@/lib/client'
import { lastLetterSeen } from '@/lib/letters'
import { addDays, findPatterns } from '@/lib/patterns'
import { displayName, useFriends, useMyEntries } from '@/lib/social'
import { normalizeSignals } from '@/lib/signals'
import type { Entry, Insight } from '@/lib/types'
import { cn } from '@/lib/utils'
import { moodColor } from './bits'
import { dayMood } from './MonthCalendar'
import { EntryPhoto } from './EntryPhoto'

type Row = { recordId: string; createdAt: string; data: Entry }

const WINDOW = 'rounded-[18px] bg-card shadow-[0_1px_2px_rgba(43,38,34,0.06),0_12px_30px_-18px_rgba(43,38,34,0.25)]'
const PEN_ME = '#c03a6f'
const PEN_FRIEND = '#2f5fb3'
const pad = (n: number) => String(n).padStart(2, '0')

function OpenLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground" aria-label={label}>
      Open <ArrowUpRight className="h-3 w-3" aria-hidden />
    </Link>
  )
}

export function LookingBackWindow({ className }: { className?: string }) {
  const today = localToday()
  const month = today.slice(0, 7)
  const { records } = useMyEntries({ orderBy: 'createdAt', orderDir: 'asc', limit: 500 })
  const { records: letters } = useQuery<Insight>('insights', { orderBy: 'createdAt', orderDir: 'desc', limit: 1 })

  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of records as Row[]) m.set(r.data.entryDate, [...(m.get(r.data.entryDate) ?? []), r])
    return m
  }, [records])

  const pattern = useMemo(() => {
    const from = addDays(today, -13)
    const pts = (records as Row[])
      .filter((r) => r.data.status === 'analyzed' && !r.data.riskFlag && r.data.entryDate >= from)
      .map((r) => ({ date: r.data.entryDate, signals: normalizeSignals(r.data.signals) }))
    return findPatterns(pts)[0] ?? null
  }, [records, today])

  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const days = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${month}-${pad(i + 1)}`)
  const letter = letters[0]
  const letterNew = letter && letter.recordId !== lastLetterSeen()

  return (
    <section aria-label="Looking back" data-testid="looking-back-window" className={cn(WINDOW, 'flex flex-col gap-4 p-5', className)}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl text-foreground">Looking back</h2>
        <OpenLink to="/insights" label="Open Looking back" />
      </div>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">{new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' })}</p>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {days.map((d) => {
            const has = byDate.has(d)
            const cell = cn(
              'aspect-square rounded-[4px]',
              !has && 'border border-dashed border-border',
              d === today && 'ring-1 ring-foreground/50 ring-offset-1 ring-offset-card',
            )
            return has ? (
              <Link
                key={d}
                to={`/insights?day=${d}`}
                aria-label={formatDay(d)}
                className={cn(cell, 'transition-transform hover:scale-110')}
                style={{ background: moodColor(dayMood(byDate.get(d))) }}
              />
            ) : (
              <span key={d} className={cell} />
            )
          })}
        </div>
      </div>
      <div className="rounded-xl bg-secondary/70 p-3.5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Hearth noticed</p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">
          {pattern ? pattern.statement : 'Patterns appear after about four days of entries. Keep going.'}
        </p>
      </div>
      <Link
        to="/insights#letter"
        className={cn(
          'mt-auto flex items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3 text-sm transition-colors hover:bg-secondary/60',
          letterNew ? 'border-primary/40 text-foreground' : 'border-border text-muted-foreground',
        )}
      >
        <Mail className="h-4 w-4 text-primary" aria-hidden />
        {letterNew ? 'A letter from Hearth is waiting' : letter ? 'Read your last letter' : 'Ask Hearth for a letter'}
      </Link>
    </section>
  )
}

export function ExchangeWindow({ className }: { className?: string }) {
  const { userId } = useAuth()
  const { friends } = useFriends()
  const { getName } = useUserLookup()
  const { records } = useQuery<Entry>('entries', { orderBy: 'createdAt', orderDir: 'asc', limit: 500 })

  // The friend whose notebook moved most recently, and its last two pages.
  const { friend, pages, photoPage } = useMemo(() => {
    const me = userId ?? ''
    const rows = records as Row[]
    const thread = (fid: string) =>
      rows
        .filter(
          (r) =>
            (r.data.userId === fid && (r.data.sharedWith ?? []).includes(me)) ||
            (r.data.userId === me && (r.data.sharedWith ?? []).includes(fid)),
        )
        .sort((a, b) => a.data.entryDate.localeCompare(b.data.entryDate) || a.createdAt.localeCompare(b.createdAt))
    const ranked = friends
      .map((f) => ({ f, t: thread(f.id) }))
      .sort((a, b) => (b.t.at(-1)?.createdAt ?? '').localeCompare(a.t.at(-1)?.createdAt ?? ''))
    const top = ranked[0]
    if (!top) return { friend: null, pages: [] as Row[], photoPage: null }
    const theirPhotos = top.t.filter((r) => r.data.userId === top.f.id && r.data.photo)
    return { friend: top.f, pages: top.t.slice(-2), photoPage: theirPhotos.at(-1) ?? null }
  }, [records, friends, userId])

  const name = (id: string | undefined) => displayName(id, getName).split(' ')[0]

  return (
    <section
      aria-label="Exchange diary"
      data-testid="exchange-window"
      className={cn(
        'relative flex flex-col overflow-hidden rounded-md bg-[#fdfdf8] pb-4 pl-12 pr-5 pt-4 shadow-[0_1px_2px_rgba(30,40,55,0.08),0_12px_30px_-18px_rgba(30,40,55,0.35)]',
        '[background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,#c9dbef_31px,#c9dbef_32px)] bg-[position:0_64px]',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-[34px] w-0.5 bg-[#f0a3a3]" />
      <div className="flex h-12 items-center justify-between">
        <span className="-rotate-2 border-2 border-[#26303b] bg-[#fdfdf8] px-2.5 font-pen text-[24px] leading-tight text-[#26303b] shadow-[2px_2px_0_#26303b]">
          {friend ? `${name(userId ?? '')} + ${name(friend.id)}` : 'exchange diary'}
        </span>
        <OpenLink to="/exchange" label="Open the exchange diary" />
      </div>

      {!friend ? (
        <div className="mt-4 space-y-1">
          <p className="font-pen text-[25px] leading-8 text-[#26303b]">a notebook you pass back and forth with one friend.</p>
          <Link to="/exchange" className="font-pen text-[24px] leading-8 text-[#2f5fb3] underline decoration-[#c9dbef] underline-offset-4">
            invite someone →
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 min-h-0 space-y-0 overflow-hidden">
            {pages.length === 0 && (
              <p className="font-pen text-[25px] leading-8 text-[#8995a3]">a fresh notebook. write the first page…</p>
            )}
            {pages.map((p, i) => (
              <div key={p.recordId}>
                {(i === 0 || pages[i - 1].data.entryDate !== p.data.entryDate) && (
                  <p className="h-8 text-[11px] uppercase leading-8 tracking-[0.14em] text-[#4d5866]">
                    {formatDay(p.data.entryDate, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                )}
                <p
                  className="line-clamp-4 font-pen text-[25px] leading-8"
                  style={{ color: p.data.userId === userId ? PEN_ME : PEN_FRIEND }}
                >
                  {name(p.data.userId)}: {p.data.text}
                </p>
              </div>
            ))}
          </div>
          {photoPage && (
            <EntryPhoto entryId={photoPage.recordId} photo={photoPage.data.photo} tilt={-4} className="ml-1 mt-4 w-40 shrink-0" />
          )}
          <Link
            to="/exchange"
            className="mt-auto block border-b-2 border-[#c9dbef] pt-4 font-pen text-[24px] leading-8 text-[#8995a3] hover:text-[#4d5866]"
          >
            write to {name(friend.id)}…
          </Link>
        </>
      )}
    </section>
  )
}
