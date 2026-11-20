/**
 * A single fine line under the prompt. Still when you're not speaking; while
 * recording it draws your recent loudness as soft bars, newest on the right.
 */

import { WAVE_SAMPLES } from '@/lib/useRecorder'
import { cn } from '@/lib/utils'

/** Below this the bar is silence and the hairline shows through. */
const SILENCE = 0.03

export function VoiceWave({ levels, active, className }: { levels: number[]; active: boolean; className?: string }) {
  const padded = [...Array(Math.max(0, WAVE_SAMPLES - levels.length)).fill(0), ...levels]
  return (
    <div aria-hidden data-voice-wave className={cn('relative flex h-12 w-full items-center gap-[3px]', className)}>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/15" />
      {active &&
        padded.map((v, i) => (
          <span
            key={i}
            className="relative flex-1 rounded-full bg-primary/70 transition-[height] duration-100"
            style={{ height: v < SILENCE ? 0 : `${Math.max(3, v * 48)}px` }}
          />
        ))}
    </div>
  )
}
