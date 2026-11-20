import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'recording' | 'unsupported' | 'denied'

/** Hard stop so a forgotten mic can't produce an enormous upload. */
const MAX_SECONDS = 180

/**
 * Microphone capture with a live loudness level (0–1) for the listening orb.
 * `stop()` resolves with the recorded audio.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>(() =>
    typeof window !== 'undefined' && 'MediaRecorder' in window && navigator.mediaDevices ? 'idle' : 'unsupported',
  )
  const [level, setLevel] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const cleanup = useRef<() => void>(() => {})
  const resolveStop = useRef<((b: Blob) => void) | null>(null)

  const release = useCallback(() => {
    cleanup.current()
    cleanup.current = () => {}
    setLevel(0)
  }, [])

  useEffect(() => release, [release])

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        const r = recorder.current
        if (!r || r.state === 'inactive') return resolve(new Blob())
        resolveStop.current = resolve
        r.stop()
      }),
    [],
  )

  const start = useCallback(async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setState('denied')
      return
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m))
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunks.current = []
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      const blob = new Blob(chunks.current, { type: r.mimeType })
      release()
      setState('idle')
      resolveStop.current?.(blob)
      resolveStop.current = null
    }

    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let raf = 0
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += ((v - 128) / 128) ** 2
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
      raf = requestAnimationFrame(tick)
    }
    tick()
    const started = Date.now()
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000)
      setSeconds(s)
      if (s >= MAX_SECONDS && r.state === 'recording') r.stop()
    }, 250)

    cleanup.current = () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
    recorder.current = r
    setSeconds(0)
    r.start()
    setState('recording')
  }, [release])

  return { state, level, seconds, start, stop }
}
