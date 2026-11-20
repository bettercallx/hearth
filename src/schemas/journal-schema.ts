/**
 * Journal collections.
 *
 * Privacy is the product here: nothing is readable by anyone but its owner —
 * including admins — unless the owner shares it. Sharing is server-enforced
 * through collaborator lists (`sharedWith`, `members`, `participants`), never a
 * client-side filter. Server actions and cron (which run RBAC-off) always
 * scope by the caller.
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
    /** The person corrected the mood; analysis must not overwrite it. */
    { name: 'moodEdited', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'moodTags', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'summary', storage: 'text', interpretation: 'plain' },
    { name: 'reflection', storage: 'text', interpretation: 'plain' },
    { name: 'signals', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'riskFlag', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'isDemo', storage: 'number', interpretation: { kind: 'boolean' } },
    /** Friends this entry is shared with (exchange diary). Empty = private. */
    { name: 'sharedWith', storage: 'text', interpretation: { kind: 'json' } },
  ],
  ownerField: 'userId',
  collaboratorsField: 'sharedWith',
  permissions: {
    ...OWNER_ONLY,
    member: { read: 'collaborator', create: true, update: 'own', delete: 'own' },
    admin: { read: 'collaborator', create: true, update: 'own', delete: 'own' },
  },
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

// ── Exchange diary ─────────────────────────────────────────────────────────

/** An open invite link. Accepting it goes through the `acceptInvite` action. */
export const invitesSchema: CollectionSchema = {
  name: 'invites',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'code', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['open', 'used'] } },
  ],
  ownerField: 'userId',
  uniqueOn: ['code'],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'own', create: true, update: false, delete: 'own' },
    admin: { read: 'own', create: true, update: false, delete: 'own' },
  },
}

/** Two people paired for an exchange diary. Created and removed only by actions. */
export const friendshipsSchema: CollectionSchema = {
  name: 'friendships',
  columns: [{ name: 'members', storage: 'text', interpretation: { kind: 'json' }, required: true }],
  collaboratorsField: 'members',
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'collaborator', create: false, update: false, delete: false },
    admin: { read: 'collaborator', create: false, update: false, delete: false },
  },
}

/** A friend's reply or reaction on a shared entry; visible to its author and the entry's owner. */
export const repliesSchema: CollectionSchema = {
  name: 'replies',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'entryId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'text', storage: 'text', interpretation: 'plain' },
    { name: 'emoji', storage: 'text', interpretation: 'plain' },
    { name: 'participants', storage: 'text', interpretation: { kind: 'json' }, required: true, immutable: true },
  ],
  ownerField: 'userId',
  collaboratorsField: 'participants',
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'collaborator', create: true, update: false, delete: 'own' },
    admin: { read: 'collaborator', create: true, update: false, delete: 'own' },
  },
}
