/**
 * Exchange diary: one school notebook per friend, passed back and forth.
 * Pages are the entries each of you shared with the other, in date order,
 * in your own pen colors; photos are taped in as polaroids; replies are
 * written right under the page. What reaches this page is decided on the
 * server (collaborator lists), never filtered here.
 */

import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth, useMutations, useQuery, useR2Files, useUserLookup } from 'deepspace'
import { Camera, Copy, Link2, UserMinus, X } from 'lucide-react'
import { Button, ConfirmModal, Input, useToast } from '@/components/ui'
import type { Reply } from '@/components/hearth/bits'
import { EntryPhoto } from '@/components/hearth/EntryPhoto'
import { callAction, formatDay, localToday, preparePhoto } from '@/lib/client'
import { addDays } from '@/lib/patterns'
import { REACTIONS, displayName, inviteCodeFrom, useFriends, type Friend } from '@/lib/social'
import type { Entry } from '@/lib/types'
import { cn } from '@/lib/utils'

type Invite = { userId?: string; code: string; status: 'open' | 'used' }
type Row = { recordId: string; createdAt: string; data: Entry }

/** Your pen and theirs. */
const PEN_ME = '#c03a6f'
const PEN_FRIEND = '#2f5fb3'

/** Ruled notebook paper: 36px lines under a plain header band. */
const PAPER =
  'bg-[#fdfdf8] [background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_35px,#c9dbef_35px,#c9dbef_36px)] bg-[position:0_70px]'

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
}

export default function ExchangePage() {
  const { userId } = useAuth()
  const { friends, status: friendsStatus } = useFriends()
  const [params, setParams] = useSearchParams()
  const inviteCode = params.get('invite')
  const [picked, setPicked] = useState<string | null>(null)
  const friend = friends.find((f) => f.id === picked) ?? friends[0] ?? null

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-5 sm:pt-10">
      {inviteCode && <AcceptInvite code={inviteCode} onDone={() => setParams({}, { replace: true })} />}

      {friendsStatus === 'loading' ? (
        <div className="h-96 animate-pulse rounded bg-muted" />
      ) : !friend || !userId ? (
        <EmptyNotebook />
      ) : (
        <>
          <Header me={userId} friend={friend} friends={friends} onPick={setPicked} />
          <Notebook key={friend.id} me={userId} friend={friend} />
        </>
      )}
    </div>
  )
}

function Header({ me, friend, friends, onPick }: { me: string; friend: Friend; friends: Friend[]; onPick: (id: string) => void }) {
  const { getName } = useUserLookup()
  const first = (n: string) => n.split(' ')[0]
  const [unpairing, setUnpairing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [inviting, setInviting] = useState(false)
  const { success, error } = useToast()

  const unpair = async () => {
    setBusy(true)
    try {
      await callAction('unpair', { friendId: friend.id })
      success(`Unpaired from ${first(friend.name)}`, 'Neither of you can see the other’s pages anymore.')
    } catch (e) {
      error('Could not unpair', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
      setUnpairing(false)
    }
  }

  return (
    <header className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="-rotate-2 rounded-sm border-2 border-[#26303b] bg-[#fdfdf8] px-4 py-2 shadow-[3px_3px_0_#26303b]">
            <h1 className="font-pen text-[34px] leading-none text-[#26303b]">
              {first(displayName(me, getName))} + {first(friend.name)}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button type="button" onClick={() => setInviting((v) => !v)} className="inline-flex items-center gap-1 hover:text-foreground">
            <Link2 className="h-3.5 w-3.5" aria-hidden /> Invite a friend
          </button>
          <button type="button" onClick={() => setUnpairing(true)} className="inline-flex items-center gap-1 hover:text-destructive">
            <UserMinus className="h-3.5 w-3.5" aria-hidden /> Unpair
          </button>
        </div>
      </div>

      {friends.length > 1 && (
        <nav aria-label="Notebooks" className="flex flex-wrap gap-2">
          {friends.map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid="friend-name"
              aria-pressed={f.id === friend.id}
              onClick={() => onPick(f.id)}
              className={cn(
                'rounded-sm border px-3 py-1 font-pen text-[22px] leading-6 transition-colors',
                f.id === friend.id ? 'border-[#26303b] bg-[#fdfdf8] text-[#26303b]' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {first(f.name)}
            </button>
          ))}
        </nav>
      )}
      {friends.length === 1 && (
        <span data-testid="friend-name" className="sr-only">
          {friend.name}
        </span>
      )}
      {inviting && <InviteNote />}

      <ConfirmModal
        open={unpairing}
        onClose={() => setUnpairing(false)}
        onConfirm={() => void unpair()}
        title={`Unpair from ${first(friend.name)}?`}
        description="Every page either of you shared becomes private again. Your own entries are not deleted."
        confirmText="Unpair"
        variant="destructive"
        loading={busy}
      />
    </header>
  )
}

function Notebook({ me, friend }: { me: string; friend: Friend }) {
  const { records } = useQuery<Entry>('entries', { orderBy: 'createdAt', orderDir: 'asc', limit: 500 })
  const { records: replies } = useQuery<Reply>('replies', { orderBy: 'createdAt', orderDir: 'asc', limit: 2000 })
  const { getName } = useUserLookup()

  // This notebook: what you shared with them, and what they shared with you, newest first.
  const thread = useMemo(
    () =>
      (records as Row[])
        .filter(
          (r) =>
            (r.data.userId === friend.id && (r.data.sharedWith ?? []).includes(me)) ||
            (r.data.userId === me && (r.data.sharedWith ?? []).includes(friend.id)),
        )
        .sort((a, b) => b.data.entryDate.localeCompare(a.data.entryDate) || b.createdAt.localeCompare(a.createdAt)),
    [records, me, friend.id],
  )

  // One sheet of paper per week: the last seven days, then the seven before, and so on.
  const [week, setWeek] = useState(0)
  const end = addDays(localToday(), -7 * week)
  const start = addDays(end, -6)
  const pages = thread.filter((r) => r.data.entryDate >= start && r.data.entryDate <= end)
  const hasEarlier = thread.some((r) => r.data.entryDate < start)
  const byEntry = useMemo(() => {
    const m = new Map<string, typeof replies>()
    for (const r of replies) m.set(r.data.entryId, [...(m.get(r.data.entryId) ?? []), r])
    return m
  }, [replies])

  const pen = (id: string | undefined) => (id === me ? PEN_ME : PEN_FRIEND)
  const name = (id: string | undefined) => displayName(id, getName).split(' ')[0]

  return (
    <div className={cn('relative rounded-[3px] pb-6 pl-[64px] pr-5 pt-[70px] shadow-[0_18px_40px_-22px_rgba(30,40,55,0.45)] sm:pl-[104px] sm:pr-10', PAPER)}>
      <span aria-hidden className="absolute inset-y-0 left-[48px] w-0.5 bg-[#f0a3a3] sm:left-[84px]" />
      <span
        aria-hidden
        className="absolute right-0 top-0 h-0 w-0 border-solid [border-color:transparent_var(--color-background)_#e9e9e0_transparent] [border-width:0_40px_40px_0]"
      />
      <MarginDoodles />

      <nav aria-label="Weeks" data-testid="week-pager" className="absolute inset-x-0 top-0 flex h-[70px] items-center justify-between pl-[64px] pr-12 sm:pl-[104px]">
        <button
          type="button"
          onClick={() => setWeek((w) => w + 1)}
          disabled={!hasEarlier}
          className="font-pen text-[22px] text-[#4d5866] hover:text-[#26303b] disabled:invisible"
        >
          ← earlier week
        </button>
        <span data-testid="week-range" className="text-xs uppercase tracking-[0.16em] text-[#4d5866]">
          {week === 0 ? 'this week · ' : ''}
          {formatDay(start, { month: 'short', day: 'numeric' })} – {formatDay(end, { month: 'short', day: 'numeric' })}
        </span>
        <button
          type="button"
          onClick={() => setWeek((w) => Math.max(0, w - 1))}
          disabled={week === 0}
          className="font-pen text-[22px] text-[#4d5866] hover:text-[#26303b] disabled:invisible"
        >
          later week →
        </button>
      </nav>

      {/* Newest on top, so the blank page to write on is the first thing you see this week. */}
      {week === 0 && <WritePage friend={friend} />}

      {pages.length === 0 ? (
        <p className={cn('font-pen text-[28px] leading-9 text-[#8995a3]', week === 0 && 'mt-9')}>
          {week === 0
            ? thread.length
              ? `nothing passed back and forth this week yet. write ${name(friend.id)} a page…`
              : `a fresh notebook! write the first page above and pass it to ${name(friend.id)}…`
            : 'no pages this week.'}
        </p>
      ) : (
        pages.map((p, i) => {
          const showDate = i === 0 || pages[i - 1].data.entryDate !== p.data.entryDate
          return (
            <article
              key={p.recordId}
              data-testid="shared-entry"
              data-entry-id={p.recordId}
              data-author={p.data.userId === me ? 'me' : 'friend'}
              className={cn(
                'group',
                showDate && (i > 0 || week === 0) && 'mt-9 border-t-2 border-dashed border-[#c9dbef] pt-[34px]',
              )}
            >
              {showDate && (
                <p className="mb-0 h-9 text-xs uppercase leading-9 tracking-[0.16em] text-[#4d5866]">
                  {formatDay(p.data.entryDate, { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
              )}
              <p className="whitespace-pre-wrap font-pen text-[29px] leading-9" style={{ color: pen(p.data.userId) }}>
                <span>{name(p.data.userId)}: </span>
                {p.data.text}
              </p>
              {p.data.photo && (
                <div className="my-4 ml-2">
                  <EntryPhoto entryId={p.recordId} photo={p.data.photo} tilt={i % 2 ? 3 : -4} />
                </div>
              )}
              <PageReplies entryId={p.recordId} entryOwner={p.data.userId ?? ''} me={me} replies={byEntry.get(p.recordId) ?? []} pen={pen} name={name} />
              {p.data.source === 'exchange' && p.data.userId === me && <TearOut id={p.recordId} />}
            </article>
          )
        })
      )}
    </div>
  )
}

function PageReplies({
  entryId,
  entryOwner,
  me,
  replies,
  pen,
  name,
}: {
  entryId: string
  entryOwner: string
  me: string
  replies: { recordId: string; data: Reply }[]
  pen: (id: string | undefined) => string
  name: (id: string | undefined) => string
}) {
  const { create, ready } = useMutations<Reply>('replies')
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const participants = [...new Set([me, entryOwner])]
  const send = (reply: { text?: string; emoji?: string }) => {
    void create({ entryId, participants, ...reply })
    setText('')
  }

  return (
    <div className="mt-1">
      {replies.length > 0 && (
        <ul data-testid="replies" className="space-y-0">
          {replies.map((r) => (
            <li key={r.recordId} className="font-pen text-[27px] leading-9" style={{ color: pen(r.data.userId) }}>
              {name(r.data.userId)}: {r.data.emoji && <span className="not-italic">{r.data.emoji} </span>}
              {r.data.text}
            </li>
          ))}
        </ul>
      )}
      {/* Quiet until you're on the page (hover or keyboard); always shown on touch screens. */}
      <div
        className={cn(
          'flex min-h-9 flex-wrap items-center gap-1.5 transition-opacity',
          !open && 'sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100',
        )}
      >
        {REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            disabled={!ready}
            onClick={() => send({ emoji: e })}
            aria-label={`React with ${e}`}
            className="rounded px-1 text-sm opacity-50 transition-opacity hover:opacity-100 disabled:opacity-30"
          >
            {e}
          </button>
        ))}
        {open ? (
          <form
            className="flex min-w-[12rem] flex-1 items-center gap-2"
            onSubmit={(ev) => {
              ev.preventDefault()
              if (text.trim()) send({ text: text.trim().slice(0, 280) })
            }}
          >
            <input
              autoFocus
              value={text}
              onChange={(ev) => setText(ev.target.value)}
              maxLength={280}
              placeholder="write back…"
              aria-label="Write back"
              data-testid="reply-input"
              className="h-9 flex-1 border-0 border-b-2 border-[#c9dbef] bg-transparent font-pen text-[26px] focus:border-[#2f5fb3] focus:outline-none"
              style={{ color: PEN_ME }}
            />
            <button type="submit" disabled={!ready || !text.trim()} aria-label="Send reply" className="font-pen text-[24px] text-[#4d5866] disabled:opacity-40">
              send
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="ml-1 font-pen text-[24px] text-[#8995a3] hover:text-[#4d5866]">
            write back…
          </button>
        )}
      </div>
    </div>
  )
}

function WritePage({ friend }: { friend: Friend }) {
  const { createConfirmed, ready } = useMutations<Entry>('entries')
  const { upload } = useR2Files()
  const { error, success } = useToast()
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [developing, setDeveloping] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const first = friend.name.split(' ')[0]

  const pick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setDeveloping(true)
    try {
      const ready = await preparePhoto(file)
      if (preview) URL.revokeObjectURL(preview)
      setPhoto(ready)
      setPreview(URL.createObjectURL(ready))
    } catch (e) {
      error('Could not use that photo', e instanceof Error ? e.message : undefined)
    } finally {
      setDeveloping(false)
    }
  }

  const clearPhoto = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPhoto(null)
    setPreview(null)
  }

  const pass = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      let key: string | undefined
      if (photo) {
        const up = await upload(photo, photo.name)
        if (!up.success || !up.key) throw new Error(up.error ?? 'Photo upload failed')
        key = up.key
      }
      // A notebook page, not a journal entry: Looking back and Hearth's analysis leave it out.
      await createConfirmed({
        text: text.trim(),
        entryDate: localToday(),
        source: 'exchange',
        status: 'pending',
        sharedWith: [friend.id],
        photo: key ? { key } : null,
      })
      setText('')
      clearPhoto()
      success(`Passed to ${first}`)
    } catch (e) {
      error('Could not pass the notebook', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label={`Write a page for ${first}`}>
      <p className="h-9 text-xs uppercase leading-9 tracking-[0.16em] text-[#4d5866]">
        {formatDay(localToday(), { weekday: 'long', month: 'short', day: 'numeric' })} · your page
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`write to ${first}…`}
        aria-label={`Write a page for ${first}`}
        data-testid="page-input"
        rows={3}
        className="block w-full resize-y border-0 bg-transparent p-0 font-pen text-[29px] leading-9 placeholder:text-[#8995a3] focus:outline-none"
        style={{ color: PEN_ME }}
      />
      {developing && !preview && (
        <p data-testid="photo-developing" className="my-3 font-pen text-[24px] text-[#4d5866]">
          developing your photo…
        </p>
      )}
      {preview && (
        <div className="relative my-4 ml-2 inline-block">
          <figure className="m-0 w-52 rotate-[-3deg] bg-white p-2 pb-8 shadow-[0_5px_14px_-6px_rgba(30,40,55,0.4)]">
            <img src={preview} alt="Photo to tape in" className="block aspect-[4/3] w-full object-cover" />
          </figure>
          <button
            type="button"
            onClick={clearPhoto}
            aria-label="Remove photo"
            className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#26303b] text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            data-testid="photo-input"
            onChange={(e) => void pick(e.target.files?.[0])}
            aria-label="Tape in a photo"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-pen text-[24px] text-[#4d5866] hover:bg-[#eef2f7]"
          >
            <Camera className="h-4 w-4" aria-hidden /> tape in a photo
          </button>
        </div>
        <button
          type="button"
          data-testid="pass-notebook"
          onClick={() => void pass()}
          disabled={!ready || !text.trim() || busy || developing}
          className="rounded-sm bg-[#26303b] px-4 py-2 text-sm text-[#fdfdf8] shadow-[2px_2px_0_#c03a6f] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {busy ? 'Passing…' : `Pass it to ${first}`}
        </button>
      </div>
    </section>
  )
}

/** Your own notebook pages can be torn out (deleted for both of you). */
function TearOut({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const { error } = useToast()
  return (
    <>
      <button
        type="button"
        data-testid="tear-out"
        disabled={busy}
        onClick={() => setConfirming(true)}
        className="font-pen text-[22px] text-[#8995a3] opacity-70 hover:text-[#c03a6f] sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
      >
        tear out this page
      </button>
      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          setBusy(true)
          callAction('tearOut', { entryId: id })
            .catch((e: unknown) => error('Could not tear it out', e instanceof Error ? e.message : undefined))
            .finally(() => setBusy(false))
        }}
        title="Tear out this page?"
        description="It's removed from the notebook for both of you."
        confirmText="Tear out"
        variant="destructive"
      />
    </>
  )
}

function MarginDoodles() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1.5 top-24 hidden flex-col gap-64 sm:left-4 sm:flex">
      <svg width="44" height="44" viewBox="0 0 60 60">
        <path d="M30 8 l6 14 15 1 -11 10 3 15 -13 -8 -13 8 3 -15 -11 -10 15 -1 z" fill="none" stroke={PEN_FRIEND} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <svg width="40" height="40" viewBox="0 0 54 54">
        <path d="M27 46 C10 34 6 24 10 16 c4-8 13-8 17-1 c4-7 13-7 17 1 c4 8 0 18-17 30 z" fill="none" stroke={PEN_ME} strokeWidth="2" />
      </svg>
      <svg width="44" height="30" viewBox="0 0 58 40">
        <path d="M6 30 q12 -22 24 0 t24 0" fill="none" stroke={PEN_FRIEND} strokeWidth="2" strokeLinecap="round" />
        <circle cx="18" cy="10" r="4" fill="none" stroke={PEN_FRIEND} strokeWidth="2" />
      </svg>
    </div>
  )
}

function EmptyNotebook() {
  const [seeding, setSeeding] = useState(false)
  const { success, error } = useToast()
  const seed = async () => {
    setSeeding(true)
    try {
      await callAction('seedDemo', { today: localToday() })
      success('Sample data loaded', 'Two weeks of journal, and an exchange diary with Mia.')
    } catch (e) {
      error('Could not load the sample', e instanceof Error ? e.message : undefined)
    } finally {
      setSeeding(false)
    }
  }
  return (
    <div className="space-y-6">
      <div className="-rotate-1 rounded-sm border-2 border-[#26303b] bg-[#fdfdf8] px-5 py-4 shadow-[3px_3px_0_#26303b]">
        <h1 className="font-pen text-[38px] leading-none text-[#26303b]">our exchange diary</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A notebook you pass back and forth with one friend. They see only the pages you share, and write back in their
          own pen.
        </p>
      </div>
      <InviteNote />
      <p className="text-sm text-muted-foreground">
        Just looking around?{' '}
        <button type="button" onClick={() => void seed()} disabled={seeding} className="text-foreground underline underline-offset-4" data-testid="exchange-seed-demo">
          {seeding ? 'Loading…' : 'Load the sample diary with Mia'}
        </button>
      </p>
    </div>
  )
}

function InviteNote() {
  const { records: invites } = useQuery<Invite>('invites', { where: { status: 'open' } })
  const { ready, createConfirmed } = useMutations<Invite>('invites')
  const { success, error } = useToast()
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

  return (
    <div className="max-w-md rotate-[-1.5deg] bg-[#fff7c2] px-5 py-4 shadow-[0_4px_10px_-6px_rgba(30,40,55,0.4)]">
      <p className="text-xs uppercase tracking-[0.14em] text-[#6b5a10]">Invite a friend</p>
      {link ? (
        <div className="mt-2 space-y-2">
          <p className="font-pen text-[24px] leading-7 text-[#26303b]">send this to them (works once, 7 days):</p>
          <div className="flex gap-2">
            <Input readOnly value={link} data-testid="invite-link" onFocus={(e) => e.currentTarget.select()} className="bg-white/70" />
            <Button variant="secondary" onClick={() => void copy()} aria-label="Copy invite link">
              <Copy className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 font-pen text-[26px] leading-8 text-[#26303b]">who do you want to pass notes with?</p>
          <Button size="sm" className="mt-3 rounded-sm" onClick={() => void createInvite()} disabled={!ready} data-testid="create-invite">
            <Link2 className="h-4 w-4" aria-hidden /> Create an invite link
          </Button>
        </>
      )}
      <JoinWithInvite />
    </div>
  )
}

/** For an invite that arrived as text: paste it, then accept it like any link. */
function JoinWithInvite() {
  const [, setParams] = useSearchParams()
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)
  return (
    <form
      className="mt-4 border-t border-dashed border-[#d9c96a] pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        const code = inviteCodeFrom(value)
        setBad(!code)
        if (code) {
          setParams({ invite: code }, { replace: true })
          setValue('')
        }
      }}
    >
      <label htmlFor="join-invite" className="text-xs uppercase tracking-[0.14em] text-[#6b5a10]">
        Got an invite? Paste it here
      </label>
      <div className="mt-2 flex gap-2">
        <Input
          id="join-invite"
          data-testid="join-invite-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setBad(false)
          }}
          placeholder="link or code"
          className="bg-white/70"
          aria-invalid={bad || undefined}
        />
        <Button type="submit" variant="secondary" disabled={!value.trim()} data-testid="join-invite-submit">
          Open
        </Button>
      </div>
      {bad && <p className="mt-1.5 text-xs text-destructive">That doesn't look like an invite link or code.</p>}
    </form>
  )
}

function AcceptInvite({ code, onDone }: { code: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const { success, error } = useToast()
  const accept = async () => {
    setBusy(true)
    try {
      await callAction('acceptInvite', { code })
      success("You're paired", 'Pages they share will appear in your notebook.')
      onDone()
    } catch (e) {
      error('Could not accept the invite', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div data-testid="accept-invite" className="mb-8 max-w-md rotate-1 bg-[#fff7c2] px-5 py-4 shadow-[0_4px_10px_-6px_rgba(30,40,55,0.4)]">
      <p className="font-pen text-[28px] leading-8 text-[#26303b]">you've been invited to an exchange diary!</p>
      <p className="mt-1 text-xs text-[#6b5a10]">Your entries stay private until you share them. You can unpair any time.</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="rounded-sm" onClick={() => void accept()} loading={busy}>
          Accept
        </Button>
        <Button size="sm" variant="ghost" className="rounded-sm" onClick={onDone}>
          Not now
        </Button>
      </div>
    </div>
  )
}
