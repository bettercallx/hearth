/**
 * Mood and whole-day energy across the range. Plain SVG: two short series on
 * a fixed 1–5 scale don't need a charting library. Missing days break the
 * line instead of being interpolated — a gap in journaling is not a data point.
 */

import { formatDay } from '@/lib/client'

interface Point {
  date: string
  mood: number | null
  energy: number | null
}

const W = 640
const H = 200
const PAD = { l: 28, r: 12, t: 12, b: 26 }

export function MoodChart({ points }: { points: Point[] }) {
  if (points.length === 0) return null
  const x = (i: number) => PAD.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + ((5 - v) / 4) * (H - PAD.t - PAD.b)

  const path = (key: 'mood' | 'energy') => {
    let d = ''
    let pen = false
    points.forEach((p, i) => {
      const v = p[key]
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }

  const labelEvery = Math.ceil(points.length / 7)

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Mood and energy by day">
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {v}
            </text>
          </g>
        ))}
        <path d={path('energy')} fill="none" stroke="var(--hearth-energy-line)" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path('mood')} fill="none" stroke="var(--hearth-mood-line)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.date}>
            {p.mood != null && (
              <circle cx={x(i)} cy={y(p.mood)} r={3.5} fill="var(--hearth-mood-line)">
                <title>{`${formatDay(p.date)}: mood ${p.mood}/5${p.energy != null ? `, energy ${p.energy}/5` : ''}`}</title>
              </circle>
            )}
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {formatDay(p.date, { month: 'numeric', day: 'numeric' })}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[var(--hearth-mood-line)]" /> Mood
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded border-t-2 border-dashed border-[var(--hearth-energy-line)]" /> Energy
        </span>
      </figcaption>
    </figure>
  )
}
