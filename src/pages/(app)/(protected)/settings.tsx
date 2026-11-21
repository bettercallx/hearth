/**
 * Account, privacy, and sample-data controls. Gated by (protected)/_layout.tsx.
 */

import { useState } from 'react'
import { signOut, useCronMonitor, useUser } from 'deepspace'
import { Lock } from 'lucide-react'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { callAction, localToday } from '@/lib/client'
import { SCOPE_ID } from '@/constants'
import { useMyEntries } from '@/lib/social'

export default function SettingsPage() {
  const { user } = useUser()
  const { records } = useMyEntries({ limit: 500 })
  const demoCount = records.filter((r) => r.data.isDemo).length
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { success, error } = useToast()

  const run = async (name: 'seedDemo' | 'clearDemo') => {
    setBusy(true)
    try {
      await callAction(name, { today: localToday() })
      success(name === 'seedDemo' ? 'Sample data loaded' : 'Sample data removed')
    } catch (e) {
      error('Something went wrong', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <h1 className="font-display text-3xl font-light text-foreground">Settings</h1>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-medium text-foreground">Your account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="text-foreground">{user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-foreground">{user?.email ?? '—'}</dd>
          </div>
        </dl>
        <Button variant="secondary" className="mt-6" onClick={() => signOut()}>
          Sign out
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-base font-medium text-foreground">
          <Lock className="h-4 w-4 text-primary" aria-hidden /> Privacy
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your entries, look-backs and habits are readable only by you. That rule is enforced on the server, for every
          role, including the app's admins. To write reflections, an entry's text is sent to Claude, and voice notes are
          sent for transcription. Audio is not stored.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-medium text-foreground">Sample data</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {demoCount > 0
            ? `${demoCount} sample entries are mixed into your journal, plus an exchange diary with Mia, a sample friend.`
            : 'Two weeks of a fictional freelance designer\'s journal and an exchange diary with a sample friend, so you can see patterns, nudges, letters and the diary before you have two weeks of your own.'}
        </p>
        {demoCount > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirming(true)} disabled={busy} data-testid="clear-demo">
              Remove sample data
            </Button>
            <Button variant="ghost" onClick={() => void run('seedDemo')} loading={busy} data-testid="reload-demo">
              Reload (dates move to today)
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="mt-4" onClick={() => void run('seedDemo')} loading={busy}>
            Load two weeks of sample data
          </Button>
        )}
      </section>

      {user?.role === 'admin' && <WeeklyJobPanel />}

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void run('clearDemo')}
        title="Remove the sample data?"
        description="The sample journal, Mia and her pages are removed. Your own entries stay."
        confirmText="Remove"
        loading={busy}
      />
    </div>
  )
}

/** Admin-only: the weekly look-back job's schedule, history, and a manual run. */
function WeeklyJobPanel() {
  const { tasks, history, connected, canWrite, trigger } = useCronMonitor(SCOPE_ID)
  const [result, setResult] = useState<string | null>(null)
  const task = tasks.find((t) => t.name === 'weekly-insights')

  const runNow = async () => {
    setResult('running…')
    const receipt = await trigger('weekly-insights')
    setResult(receipt.ok ? 'ok' : (receipt.error ?? receipt.reason))
  }

  return (
    <section data-testid="weekly-job" className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-medium text-foreground">Weekly look-backs (admin)</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Sundays at 7pm New York time, every person with three or more days written that week gets a look-back. It spends
        the app owner's credits. A re-run on the same day skips anyone already done.
      </p>
      {!connected ? (
        <p className="mt-3 text-sm text-muted-foreground">Connecting…</p>
      ) : (
        <>
          {task && <p className="mt-3 text-sm text-foreground">Next run: {task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : '—'}</p>}
          <Button variant="secondary" className="mt-4" disabled={!canWrite || result === 'running…'} onClick={() => void runNow()}>
            Run now
          </Button>
          {result && <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">Result: {result}</p>}
          {history.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
              {history.slice(0, 5).map((h, i) => (
                <li key={i}>
                  {new Date(h.startedAt).toLocaleString()} · {h.success ? 'ok' : `failed: ${h.error ?? ''}`} · {h.durationMs}ms
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
