/**
 * Exchange diary: pair with a friend by invite link, read the entries they
 * chose to share, and answer with a line or a small reaction. What reaches
 * this page is decided on the server (collaborator lists), not filtered here.
 */

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth, useMutations, useQuery, useUserLookup } from 'deepspace'
import { Copy, Link2, Send, UserMinus } from 'lucide-react'
import { Button, ConfirmModal, Input, useToast } from '@/components/ui'
import { MoodDot, Replies, Tag, type Reply } from '@/components/hearth/bits'
import { callAction, formatDay } from '@/lib/client'
import { REACTIONS, useFriends, type Friend } from '@/lib/social'
import type { Entry } from '@/lib/types'

type Invite = { userId?: string; code: string; status: 'open' | 'used' }

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
}

export default function ExchangePage() {
  const { userId } = useAuth()
  const { friends, status: friendsStatus } = useFriends()
  const [params, setParams] = useSearchParams()
  const inviteCode = params.get('invite')

  // Everything shared with me that isn't mine.
  const { records } = useQuery<Entry>('entries', { orderBy: 'createdAt', orderDir: 'desc', limit: 200 })
  const shared = useMemo(() => records.filter((r) => r.data.userId && r.data.userId !== userId), [records, userId])

  return (
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-10">
      <h1 className="font-display text-3xl font-light text-foreground">Exchange diary</h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Share your days with a friend. They see only the entries you share, and can answer with a line or a small
        reaction.
      </p>

      {inviteCode && <AcceptInvite code={inviteCode} onDone={() => setParams({}, { replace: true })} />}

      <FriendsPanel friends={friends} loading={friendsStatus === 'loading'} />

      <section className="mt-12">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">From your friends</h2>
        {shared.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {friends.length ? 'Nothing shared with you yet.' : 'Pair with a friend to start exchanging.'}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {shared.map((r) => (
              <SharedEntry key={r.recordId} id={r.recordId} entry={r.data} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AcceptInvite({ code, onDone }: { code: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const { success, error } = useToast()
  const accept = async () => {
    setBusy(true)
    try {
      await callAction('acceptInvite', { code })
      success("You're paired", 'Entries they share will appear here.')
      onDone()
    } catch (e) {
      error('Could not accept the invite', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div data-testid="accept-invite" className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-5">
      <p className="text-sm text-foreground">You've been invited to an exchange diary.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Your entries stay private until you choose to share them. You can unpair any time.
      </p>
      <div className="mt-4 flex gap-2">
        <Button size="sm" className="rounded-full" onClick={() => void accept()} loading={busy}>
          Accept
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full" onClick={onDone}>
          Not now
        </Button>
      </div>
    </div>
  )
}

function FriendsPanel({ friends, loading }: { friends: Friend[]; loading: boolean }) {
  const { records: invites } = useQuery<Invite>('invites', { where: { status: 'open' } })
  const { ready, createConfirmed } = useMutations<Invite>('invites')
  const { success, error } = useToast()
  const [unpairing, setUnpairing] = useState<Friend | null>(null)
  const [busy, setBusy] = useState(false)
  const open = invites[0]
  const link = open ? `${window.location.origin}/exchange?invite=${open.data.code}` : null

  const createInvite = async () => {
    try {
      await createConfirmed({ code: newCode(), status: 'open' })
    } catch (e) {
      error('Could not create an invite', e instanceof Error ? e.message : undefined)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      success('Invite link copied', 'It works once and expires in 7 days.')
    } catch {
      error('Could not copy', 'Select the link and copy it by hand.')
    }
  }

  const unpair = async (f: Friend) => {
    setBusy(true)
    try {
      await callAction('unpair', { friendId: f.id })
      success(`Unpaired from ${f.name.split(' ')[0]}`, 'Neither of you can see the other’s entries anymore.')
    } catch (e) {
      error('Could not unpair', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
      setUnpairing(null)
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5" data-testid="friends-panel">
      {loading ? (
        <div className="h-10 animate-pulse rounded bg-muted" />
      ) : (
        <>
          {friends.length > 0 && (
            <ul className="mb-4 space-y-2">
              {friends.map((f) => (
                <li key={f.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground" data-testid="friend-name">
                    {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUnpairing(f)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <UserMinus className="h-3.5 w-3.5" aria-hidden /> Unpair
                  </button>
                </li>
              ))}
            </ul>
          )}
          {link ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Send this link to a friend. It works once and expires in 7 days.</p>
              <div className="flex gap-2">
                <Input readOnly value={link} data-testid="invite-link" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="secondary" onClick={() => void copy()} aria-label="Copy invite link">
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant={friends.length ? 'ghost' : 'default'}
              size="sm"
              className="rounded-full"
              onClick={() => void createInvite()}
              disabled={!ready}
              data-testid="create-invite"
            >
              <Link2 className="h-4 w-4" aria-hidden /> {friends.length ? 'Invite another friend' : 'Create an invite link'}
            </Button>
          )}
        </>
      )}
      <ConfirmModal
        open={!!unpairing}
        onClose={() => setUnpairing(null)}
        onConfirm={() => unpairing && void unpair(unpairing)}
        title={`Unpair from ${unpairing?.name.split(' ')[0] ?? ''}?`}
        description="Everything either of you shared becomes private again. Your own entries are not deleted."
        confirmText="Unpair"
        variant="destructive"
        loading={busy}
      />
    </section>
  )
}

function SharedEntry({ id, entry }: { id: string; entry: Entry }) {
  const { getName } = useUserLookup()
  const { userId } = useAuth()
  const { create, ready } = useMutations<Reply>('replies')
  const [text, setText] = useState('')
  const author = getName(entry.userId ?? '') ?? 'Your friend'
  const participants = [userId ?? '', entry.userId ?? '']

  const send = (reply: { text?: string; emoji?: string }) => {
    void create({ entryId: id, participants, ...reply })
    setText('')
  }

  return (
    <article data-testid="shared-entry" data-entry-id={id} className="rounded-xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <MoodDot mood={entry.mood} />
        <span className="font-medium text-foreground">{author.split(' ')[0]}</span>
        <span className="text-muted-foreground">· {formatDay(entry.entryDate)}</span>
        <div className="flex flex-wrap gap-1.5">
          {entry.moodTags?.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      </header>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{entry.text}</p>

      <Replies entryId={id} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            disabled={!ready}
            onClick={() => send({ emoji: e })}
            aria-label={`React with ${e}`}
            className="rounded-full border border-border px-2.5 py-1 text-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {e}
          </button>
        ))}
        <form
          className="flex min-w-[12rem] flex-1 gap-2"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (text.trim()) send({ text: text.trim().slice(0, 280) })
          }}
        >
          <Input
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            placeholder={`Write back to ${author.split(' ')[0]}…`}
            maxLength={280}
            data-testid="reply-input"
          />
          <Button type="submit" variant="secondary" disabled={!ready || !text.trim()} aria-label="Send reply">
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      </div>
    </article>
  )
}
