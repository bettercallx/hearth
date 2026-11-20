/**
 * The heart of the companion screen: a soft ember that breathes while idle,
 * swells with your voice while listening, and flickers while thinking.
 */

import { cn } from '@/lib/utils'

export type OrbMode = 'idle' | 'listening' | 'thinking'

export function ListeningOrb({
  mode,
  level = 0,
  size = 220,
  className,
}: {
  mode: OrbMode
  level?: number
  size?: number
  className?: string
}) {
  const swell = mode === 'listening' ? 1 + level * 0.35 : 1
  return (
    <div
      aria-hidden
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size }}
      data-orb-mode={mode}
    >
      <div
        className={cn(
          'absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(233,138,77,0.28)_0%,rgba(233,138,77,0)_70%)]',
          mode === 'idle' && 'animate-[hearth-breathe_6s_ease-in-out_infinite]',
          mode === 'thinking' && 'animate-[hearth-flicker_1.6s_ease-in-out_infinite]',
        )}
        style={mode === 'listening' ? { transform: `scale(${1.05 + level * 0.5})`, transition: 'transform 90ms linear' } : undefined}
      />
      <div
        className={cn(
          'rounded-full bg-[radial-gradient(circle_at_40%_35%,#ffd2a8_0%,#f09a5c_35%,#c2552a_75%,#7a2e17_100%)] shadow-[0_0_60px_10px_rgba(233,138,77,0.35)]',
          mode === 'idle' && 'animate-[hearth-breathe_6s_ease-in-out_infinite]',
          mode === 'thinking' && 'animate-[hearth-flicker_1.6s_ease-in-out_infinite]',
        )}
        style={{
          width: size * 0.42,
          height: size * 0.42,
          transform: `scale(${swell})`,
          transition: mode === 'listening' ? 'transform 90ms linear' : undefined,
        }}
      />
    </div>
  )
}
