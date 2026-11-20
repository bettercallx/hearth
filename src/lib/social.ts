/**
 * Exchange-diary helpers. Once entries can be shared, `useQuery('entries')`
 * also returns friends' shared entries — so every view of *your* journal must
 * filter to your own rows. `useMyEntries` is that one place.
 */

import { useMemo } from 'react'
import { useAuth, useQuery, useUserLookup } from 'deepspace'
import type { Entry } from './types'

type QueryOptions = { where?: Partial<Entry>; orderBy?: string; orderDir?: 'asc' | 'desc'; limit?: number }

export function useMyEntries(options: QueryOptions = {}) {
  const { userId } = useAuth()
  // The server filters by `where`, so a friend's rows never reach this query.
  return useQuery<Entry>('entries', { ...options, where: { ...options.where, userId: userId ?? '__none__' } })
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
    return [...ids].map((id) => ({ id, name: getName(id) ?? 'Your friend' }))
  }, [records, userId, getName])
  return { friends, status, me: userId }
}

export const REACTIONS = ['🤗', '❤️', '🌱', '☕', '💪'] as const

export function joinNames(friends: Friend[]) {
  const names = friends.map((f) => f.name.split(' ')[0])
  return names.length <= 2 ? names.join(' & ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}
