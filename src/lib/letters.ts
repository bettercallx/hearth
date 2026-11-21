/**
 * "A letter is waiting" — remembered per browser, since it's only a nudge to
 * open Looking back. Losing it (private mode, cleared storage) just shows the
 * notice once more.
 */

const KEY = 'hearth.lastLetterSeen'

export function lastLetterSeen(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function markLetterSeen(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Storage blocked: the notice will simply show again next time.
  }
}
