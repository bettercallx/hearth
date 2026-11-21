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
async function toWav(audio: Blob): Promise<Blob> {
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

/** Longest edge for an uploaded photo: enough for a polaroid, small enough to send quickly. */
const PHOTO_MAX_EDGE = 1600

/** The photo can't be decoded here, so it must not be uploaded: no one could see it. */
class UnsupportedPhotoError extends Error {
  constructor() {
    super("This photo's format can't be shown. Try a JPG or PNG.")
  }
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

/** iPhone photos are often HEIC even when named .JPG — check the bytes, not the name. */
async function isHeif(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const text = String.fromCharCode(...head)
  return text.slice(4, 8) === 'ftyp' && HEIF_BRANDS.has(text.slice(8, 12))
}

/**
 * Turn whatever the person picked into a JPEG every browser can show:
 * HEIC is converted first (the converter loads only when needed), then the
 * image is downscaled. Anything we still can't decode is refused rather than
 * uploaded as a photo nobody could see.
 */
export async function preparePhoto(file: File): Promise<File> {
  let source: Blob = file
  if (await isHeif(file)) {
    try {
      const { default: heic2any } = await import('heic2any')
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
      source = Array.isArray(out) ? out[0] : out
    } catch {
      throw new UnsupportedPhotoError()
    }
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source)
  } catch {
    throw new UnsupportedPhotoError()
  }
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new UnsupportedPhotoError()
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
}

/** A private photo, fetched with the caller's token (an <img> can't send one). */
export async function fetchEntryPhoto(entryId: string, signal?: AbortSignal): Promise<string> {
  const token = await getAuthToken()
  const res = await fetch(`/api/photos/${entryId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    // Skip the HTTP cache too, including copies saved before the route sent no-store.
    cache: 'no-store',
    signal,
  })
  if (!res.ok) throw new Error(`Photo unavailable (${res.status})`)
  return URL.createObjectURL(await res.blob())
}
