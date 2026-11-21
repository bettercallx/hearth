/**
 * Private photos on journal entries.
 *
 * Files live in the uploader's own `self` folder, which only they can read.
 * A friend sees a photo through this route instead: it serves the bytes only
 * when the caller may read the entry (its owner, or in its `sharedWith`), so
 * a photo is exactly as private as the entry it belongs to.
 */

import type { Hono } from 'hono'
import { AppFileError, appFiles } from 'deepspace/worker'
import type { AppContext } from '../../worker.js'
import { createActionTools } from './action-routes.js'
import { resolveAuth } from './http-routes.js'

interface EntryPhoto {
  userId: string
  sharedWith?: string[]
  photo?: { key?: string } | null
}

export function registerPhotoRoutes(app: Hono<AppContext>): void {
  app.get('/api/photos/:entryId', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)

    const tools = createActionTools(c.env, auth.userId, '')
    const got = await tools.get<EntryPhoto & Record<string, unknown>>('entries', c.req.param('entryId'))
    const entry = got.success ? got.data.record.data : null
    const allowed = entry && (entry.userId === auth.userId || (entry.sharedWith ?? []).includes(auth.userId))
    const key = entry?.photo?.key
    // Same answer for "no such entry" and "not yours": don't confirm what exists.
    if (!allowed || !key) return c.json({ error: 'Not found' }, 404)
    // The key must sit in the owner's own folder; anything else is not this entry's photo.
    if (!key.includes(`/users/${entry.userId}/`)) return c.json({ error: 'Not found' }, 404)

    try {
      const file = await appFiles(c.env, { scope: 'self', userId: entry.userId }).download(key)
      return new Response(file.body, {
        headers: {
          'Content-Type': file.headers.get('Content-Type') ?? 'application/octet-stream',
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (err) {
      if (err instanceof AppFileError) return c.json({ error: 'Not found' }, 404)
      throw err
    }
  })
}
