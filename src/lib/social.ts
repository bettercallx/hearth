/**
 * Exchange-diary helpers. Once entries can be shared, `useQuery('entries')`
 * also returns friends' shared entries — so every view of *your* journal must
 * filter to your own rows. `useMyEntries` is that one place.
 */

import { useMemo } from 'react'
import { useAuth, useQuery, useUserLookup } from 'deepspace'
import type { Entry } from './types'
import { DEMO_FRIEND, isDemoUser } from './demo-friend'

type QueryOptions = { where?: Partial<Entry>; orderBy?: string; orderDir?: 'asc' | 'desc'; limit?: number }

/**
 * Your own journal: your rows only (filtered on the server), minus pages you
 * wrote in the exchange diary, which belong to the notebook, not to your
 * record of yourself.
 */
export function useMyEntries(options: QueryOptions = {}) {
  const { userId } = useAuth()
  const result = useQuery<Entry>('entries', { ...options, where: { ...options.where, userId: userId ?? '__none__' } })
  const records = useMemo(() => result.records.filter((r) => r.data.source !== 'exchange'), [result.records])
  return { ...result, records }
}

export interface Friend {
  id: string
  name: string
}

export function useFriends() {
  const { userId } = useAuth()
  const { records, status } = useQuery<{ members: string[] }>('friendships')
  const { getName } = useUserLookup()
  const friends = useMemo<Friend[]>(() => {
    const ids = new Set(records.flatMap((r) => r.data.members).filter((id) => id !== userId))
    return [...ids].map((id) => ({ id, name: displayName(id, getName) }))
  }, [records, userId, getName])
  return { friends, status, me: userId }
}

export const REACTIONS = ['🤗', '❤️', '🌱', '☕', '💪'] as const

export function joinNames(friends: Friend[]) {
  const names = friends.map((f) => f.name.split(' ')[0])
  return names.length <= 2 ? names.join(' & ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

/** A person's name for the diary; the sample friend has no account, so she has no directory row. */
export function displayName(id: string | undefined, getName: (id: string) => string | null) {
  if (!id) return 'Your friend'
  return getName(id) ?? (isDemoUser(id) ? DEMO_FRIEND.name : 'Your friend')
}
