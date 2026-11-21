/**
 * Energy & mood as a grid, in the calendar's language: one column per day,
 * a mood row on top (the mood colours) and a row per part of the day for
 * energy (one blue, light to dark). Beside it, the average energy for each
 * part of the day as horizontal bars, so "afternoons are my low point" reads
 * at a glance. Gaps stay visibly empty: a day not written is not a low day.
 */

import { Link } from 'react-router-dom'
import { formatDay } from '@/lib/client'
import type { DaySignals } from '@/lib/signals'
import { cn } from '@/lib/utils'
import { moodColor, moodWord } from './bits'

export interface RhythmDay {
  date: string
  signals: DaySignals | null
}

const PARTS = [
  { key: 'energyMorning', label: 'Morning' },
  { key: 'energyAfternoon', label: 'Afternoon' },
  { key: 'energyEvening', label: 'Evening' },
] as const

const ENERGY_WORDS = ['very low', 'low', 'some', 'good', 'high']
/** How much lower (on the 1–5 scale) a part of the day must be to be called the low point. */
const LOW_POINT_GAP = 0.2
const energyColor = (v: number) => `var(--hearth-energy-${Math.min(5, Math.max(1, Math.round(v)))})`
const energyWord = (v: number) => ENERGY_WORDS[Math.min(4, Math.max(0, Math.round(v) - 1))]

function Cell({ date, color, label }: { date: string; color: string | null; label: string }) {
  const base = 'block aspect-square w-full rounded-[5px]'
  return color ? (
    <Link
      to={`/insights?day=${date}`}
      title={label}
      aria-label={label}
      className={cn(base, 'transition-transform hover:scale-110')}
      style={{ background: color }}
    />
  ) : (
    <span title={label} className={cn(base, 'border border-dashed border-border')} />
  )
}

export function DayRhythm({ days }: { days: RhythmDay[] }) {
  const averages = PARTS.map((p) => {
    const vals = days.map((d) => d.signals?.[p.key]).filter((v): v is number => typeof v === 'number')
    return { ...p, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null }
  })
  // Name a low point only when one part of the day is clearly lower than the rest.
  const known = [...averages.filter((a) => a.avg !== null)].sort((a, b) => (a.avg as number) - (b.avg as number))
  const lowest = known.length > 1 && (known[1].avg as number) - (known[0].avg as number) >= LOW_POINT_GAP ? known[0] : null
  const cols = { gridTemplateColumns: `5.5rem repeat(${days.length}, minmax(0, 1fr))` }

  return (
    <div data-testid="day-rhythm" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <figure className="m-0 overflow-x-auto">
        <div className="min-w-[30rem] space-y-1.5">
          <div className="grid items-center gap-1.5" style={cols}>
            <span className="text-xs font-medium text-foreground">Mood</span>
            {days.map((d) => (
              <Cell
                key={d.date}
                date={d.date}
                color={d.signals?.mood != null ? moodColor(d.signals.mood) : null}
                label={`${formatDay(d.date)}: ${d.signals?.mood != null ? `mood ${moodWord(d.signals.mood)}` : 'no entry'}`}
              />
            ))}
          </div>
          <div className="h-1" />
          {PARTS.map((p) => (
            <div key={p.key} className="grid items-center gap-1.5" style={cols}>
              <span className="text-xs text-muted-foreground">{p.label}</span>
              {days.map((d) => {
                const v = d.signals?.[p.key]
                return (
                  <Cell
                    key={d.date}
                    date={d.date}
                    color={typeof v === 'number' ? energyColor(v) : null}
                    label={`${formatDay(d.date)}, ${p.label.toLowerCase()}: ${typeof v === 'number' ? `${energyWord(v)} energy` : 'not mentioned'}`}
                  />
                )
              })}
            </div>
          ))}
          <div className="grid gap-1.5 pt-1" style={cols}>
            <span />
            {days.map((d) => (
              <span key={d.date} className="text-center text-[10px] leading-tight text-muted-foreground">
                {formatDay(d.date, { weekday: 'narrow' })}
                <br />
                {Number(d.date.slice(8))}
              </span>
            ))}
          </div>
        </div>
        <figcaption className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            Mood
            {[1, 3, 5].map((m) => (
              <span key={m} className="h-2.5 w-4 rounded-sm" style={{ background: moodColor(m) }} />
            ))}
            rough → great
          </span>
          <span className="flex items-center gap-1.5">
            Energy
            {[1, 2, 3, 4, 5].map((e) => (
              <span key={e} className="h-2.5 w-4 rounded-sm" style={{ background: energyColor(e) }} />
            ))}
            low → high
          </span>
        </figcaption>
      </figure>

      <div data-testid="energy-by-part">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Energy by time of day</p>
        <ul className="mt-4 space-y-4">
          {averages.map((a) => (
            <li key={a.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground">{a.label}</span>
                <span className="tabular-nums text-muted-foreground">{a.avg != null ? `${a.avg} / 5` : '—'}</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-secondary">
                {a.avg != null && (
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(a.avg / 5) * 100}%`, background: energyColor(a.avg) }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
        {known.length > 1 && (
          <p className="mt-5 text-sm leading-relaxed text-foreground">
            {lowest ? `${lowest.label}s are your low point.` : 'Your energy is fairly even across the day.'}
          </p>
        )}
      </div>
    </div>
  )
}
