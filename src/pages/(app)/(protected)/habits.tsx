/** Habits now live in Looking back; keep old links working. */

import { Navigate } from 'react-router-dom'

export default function HabitsRedirect() {
  return <Navigate to="/insights#habits" replace />
}
