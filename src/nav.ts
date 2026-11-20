/**
 * Navigation Config
 *
 * Add one entry per nav item. Routes are handled by generouted
 * (file-based routing in src/pages/), this just controls what
 * appears in the navigation bar.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
  devOnly?: boolean
}

export const nav: NavItem[] = [
  { path: '/home', label: 'Today' },
  { path: '/insights', label: 'Looking back' },
  { path: '/habits', label: 'Habits' },
  { path: '/exchange', label: 'Exchange' },
  // Settings lives in the account menu to keep the bar short.
  // The /api-status debug page still exists — add
  // `{ path: '/api-status', label: 'API Status', devOnly: true }` to surface it.
  // ── Features add nav items below this line ──
]
