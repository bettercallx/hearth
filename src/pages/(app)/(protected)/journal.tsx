import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { EntryCard, moodColor, moodWord } from '@/components/hearth/bits'
import { addDays } from '@/lib/patterns'
import { formatDay, localToday } from '@/lib/client'
import { useMyEntries } from '@/lib/social'

export default function JournalPage() {
  const navigate = useNavigate()
  const { records, status } = useMyEntries({ orderBy: 'createdAt', orderDir: 'desc', limit: 500 })

  const groups = useMemo(() => {
    const byDate = new Map<string, typeof records>()
    for (const r of records) byDate.set(r.data.entryDate, [...(byDate.get(r.data.entryDate) ?? []), r])
    return [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [records])

  // Last 14 days as a strip of mood swatches — gaps stay visibly empty.
  const strip = useMemo(() => {
    const today = localToday()
    return Array.from({ length: 14 }, (_, i) => {
      const date = addDays(today, i - 13)
      const day = records.filter((r) => r.data.entryDate === date && typeof r.data.mood === 'number')
      const mood = day.length ? day.reduce((a, r) => a + (r.data.mood as number), 0) / day.length : null
      return { date, mood, has: groups.some(([d]) => d === date) }
    })
  }, [records, groups])

  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-10">
      <h1 className="font-display text-3xl font-light text-foreground">Your journal</h1>
      <p className="mt-2 text-sm text-muted-foreground">Everything you have shared, newest first. Only you can see this.</p>

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Last two weeks</p>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {strip.map((d) =>
            d.has ? (
              <a
                key={d.date}
                href={`#entry-${d.date}`}
                title={`${formatDay(d.date)} — ${moodWord(d.mood)}`}
                className="aspect-square rounded-md transition-transform hover:scale-110"
                style={{ background: moodColor(d.mood) }}
              />
            ) : (
              <span key={d.date} title={`${formatDay(d.date)} — no entry`} className="aspect-square rounded-md border border-dashed border-border" />
            ),
          )}
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {status === 'loading' ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="Nothing here yet"
            description="Your first entry can be a single sentence."
            action={{ label: 'Talk to Hearth', onClick: () => navigate('/home') }}
          />
        ) : (
          groups.map(([date, list]) => (
            <section key={date} className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">{formatDay(date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
              {list.map((r) => (
                <EntryCard key={r.recordId} id={r.recordId} createdAt={r.createdAt} entry={r.data} showDate={false} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
