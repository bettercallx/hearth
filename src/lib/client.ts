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

const SPEECH_SAMPLE_RATE = 16_000

/**
 * The speech-to-text integration accepts WAV but not the WebM/Opus or MP4
 * that MediaRecorder produces, so re-encode in the browser: decode, mix down
 * to mono, resample to 16 kHz (plenty for speech), write 16-bit PCM.
 */
export async function toWav(audio: Blob): Promise<Blob> {
  const decoded = await new AudioContext().decodeAudioData(await audio.arrayBuffer())
  const frames = Math.ceil(decoded.duration * SPEECH_SAMPLE_RATE)
  const offline = new OfflineAudioContext(1, frames, SPEECH_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const pcm = (await offline.startRendering()).getChannelData(0)

  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2))
  const ascii = (at: number, str: string) => [...str].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, SPEECH_SAMPLE_RATE, true)
  view.setUint32(28, SPEECH_SAMPLE_RATE * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, pcm.length * 2, true)
  pcm.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true))
  return new Blob([view], { type: 'audio/wav' })
}

export async function transcribe(audio: Blob): Promise<string> {
  const r = await integration.post<{ text?: string | null }>('speech/speech-to-text', {
    audio: await blobToBase64(await toWav(audio)),
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
