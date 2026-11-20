/**
 * Client-side helpers shared by pages: server-action calls, local calendar
 * dates, and the speech integrations.
 */

import { getAuthToken, integration } from 'deepspace'

export async function callAction<T = unknown>(name: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken()
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(params),
  })
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string }
  if (!res.ok || !body.success) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.data as T
}

/** The person's own calendar date — a 1am entry belongs to the night before's
 *  "today" only if they say so; we use the device clock. */
export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDay(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, opts)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function transcribe(audio: Blob): Promise<string> {
  const r = await integration.post<{ text?: string | null }>('speech/speech-to-text', {
    audio: await blobToBase64(audio),
    model: 'gpt-4o-mini-transcribe',
  })
  if (!r.success) throw new Error(r.error)
  return (r.data?.text ?? '').trim()
}

/** Longest reflection we will voice — keeps a runaway string from costing much. */
const MAX_SPOKEN_CHARS = 600

export async function speak(text: string): Promise<string> {
  const r = await integration.post<{ audioUrl: string }>('speech/text-to-speech', {
    input: text.slice(0, MAX_SPOKEN_CHARS),
    model: 'gpt-4o-mini-tts',
    voice: 'sage',
    instructions: 'Speak softly and slowly, like a caring friend listening late at night. Warm, unhurried, never cheerful or salesy.',
  })
  if (!r.success || !r.data?.audioUrl) throw new Error(r.success ? 'No audio returned' : r.error)
  return r.data.audioUrl
}
