/**
 * Navigation Config
 *
 * Hearth has no tab bar: the home is the desk (Hearth in the middle, Looking
 * back and the exchange diary as windows beside it). These are the full-page
 * views a window opens; they show as a breadcrumb next to the wordmark and in
 * the account menu.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
  devOnly?: boolean
}

export const nav: NavItem[] = [
  { path: '/insights', label: 'Looking back' },
  { path: '/exchange', label: 'Exchange diary' },
  { path: '/settings', label: 'Settings' },
  // The /api-status debug page still exists — add
  // `{ path: '/api-status', label: 'API Status', devOnly: true }` to surface it.
]
