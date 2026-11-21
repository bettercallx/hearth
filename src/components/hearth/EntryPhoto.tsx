/**
 * An entry's photo as a polaroid. Bundled sample sketches load directly;
 * real uploads come through /api/photos, which checks the caller may read
 * the entry first.
 */

import { useEffect, useState } from 'react'
import { fetchEntryPhoto } from '@/lib/client'
import type { Entry } from '@/lib/types'
import { cn } from '@/lib/utils'

export function EntryPhoto({
  entryId,
  photo,
  caption,
  tilt = -3,
  className,
}: {
  entryId: string
  photo: Entry['photo']
  caption?: string
  tilt?: number
  className?: string
}) {
  const [src, setSrc] = useState<string | null>(photo?.demo ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!photo?.key) return
    const ctrl = new AbortController()
    let url: string | null = null
    fetchEntryPhoto(entryId, ctrl.signal)
      .then((u) => {
        url = u
        setSrc(u)
      })
      .catch(() => !ctrl.signal.aborted && setFailed(true))
    return () => {
      ctrl.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [entryId, photo?.key])

  if (!photo || (!photo.key && !photo.demo)) return null
  return (
    <figure
      data-testid="entry-photo"
      className={cn('relative m-0 w-52 bg-white p-2 pb-8 shadow-[0_5px_14px_-6px_rgba(30,40,55,0.4)]', className)}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <span aria-hidden className="absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-3deg] bg-[#fff0a0]/85" />
      {src && !failed ? (
        <img
          src={src}
          alt={caption ? `Photo: ${caption}` : 'Photo shared in the diary'}
          onError={() => setFailed(true)}
          className="block aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-[#f4f4ec] text-xs text-muted-foreground">
          {failed ? "This photo can't be shown here" : 'Developing…'}
        </div>
      )}
      {caption && (
        <figcaption className="absolute inset-x-0 bottom-1 text-center font-pen text-[22px] leading-6 text-[#4d5866]">{caption}</figcaption>
      )}
    </figure>
  )
}
