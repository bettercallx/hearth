/**
 * Journal collections.
 *
 * Privacy is the product here: every collection is owner-only for every role,
 * including admin. The app owner can run the app without being able to read
 * anyone's diary — server actions and cron (which run RBAC-off) are the only
 * paths that touch other users' rows, and they always scope by the caller.
 */

import type { CollectionSchema } from 'deepspace/schema'

const OWNER_ONLY = {
  viewer: { read: false, create: false, update: false, delete: false },
  member: { read: 'own', create: true, update: 'own', delete: 'own' },
  admin: { read: 'own', create: true, update: 'own', delete: 'own' },
} as const

/** Written by server code only — members can read and delete their own rows. */
const SERVER_WRITTEN = {
  viewer: { read: false, create: false, update: false, delete: false },
  member: { read: 'own', create: false, update: false, delete: 'own' },
  admin: { read: 'own', create: false, update: false, delete: 'own' },
} as const

export const entriesSchema: CollectionSchema = {
  name: 'entries',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'text', storage: 'text', interpretation: 'plain', required: true },
    { name: 'entryDate', storage: 'text', interpretation: 'plain', required: true },
    { name: 'source', storage: 'text', interpretation: { kind: 'select', options: ['text', 'voice'] } },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['pending', 'analyzed', 'failed'] },
    },
    { name: 'mood', storage: 'number', interpretation: 'plain' },
    { name: 'moodTags', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'summary', storage: 'text', interpretation: 'plain' },
    { name: 'reflection', storage: 'text', interpretation: 'plain' },
    { name: 'signals', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'riskFlag', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'isDemo', storage: 'number', interpretation: { kind: 'boolean' } },
  ],
  ownerField: 'userId',
  permissions: OWNER_ONLY,
}

// Not userBound: cron writes these as the app owner on behalf of each user, and
// userBound would stamp the owner's id over the subject's. Clients cannot create.
export const insightsSchema: CollectionSchema = {
  name: 'insights',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'rangeStart', storage: 'text', interpretation: 'plain' },
    { name: 'rangeEnd', storage: 'text', interpretation: 'plain' },
    { name: 'days', storage: 'number', interpretation: 'plain' },
    { name: 'trigger', storage: 'text', interpretation: { kind: 'select', options: ['manual', 'weekly'] } },
    { name: 'narrative', storage: 'text', interpretation: 'plain' },
    { name: 'identity', storage: 'text', interpretation: 'plain' },
    { name: 'highlights', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'patterns', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'suggestions', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'stats', storage: 'text', interpretation: { kind: 'json' } },
  ],
  ownerField: 'userId',
  permissions: SERVER_WRITTEN,
}

export const habitsSchema: CollectionSchema = {
  name: 'habits',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'identity', storage: 'text', interpretation: 'plain' },
    { name: 'stack', storage: 'text', interpretation: 'plain' },
    { name: 'twoMinute', storage: 'text', interpretation: 'plain' },
    { name: 'signal', storage: 'text', interpretation: 'plain' },
    { name: 'active', storage: 'number', interpretation: { kind: 'boolean' } },
  ],
  ownerField: 'userId',
  permissions: OWNER_ONLY,
}
