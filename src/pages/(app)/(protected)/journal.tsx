/**
 * The journal now lives under Looking back (calendar + the selected day's
 * entries). Old links like /journal#entry-2026-11-14 land on that day.
 */

import { Navigate, useLocation } from 'react-router-dom'

export default function JournalRedirect() {
  const { hash } = useLocation()
  const day = /^#entry-(\d{4}-\d{2}-\d{2})$/.exec(hash)?.[1]
  return <Navigate to={day ? `/insights?day=${day}` : '/insights'} replace />
}
