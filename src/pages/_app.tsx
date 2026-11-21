/** Root shell for every route. No DeepSpace providers here, so the landing page stays static (see (app)/_layout.tsx). */

import { Suspense } from 'react'
import { Outlet, useRouteError } from 'react-router-dom'
import { ErrorScreen } from '../components/ErrorScreen'
import { ToastProvider } from '@/components/ui'

export default function App() {
  return (
    <ToastProvider>
      <div data-testid="app-root" className="min-h-screen bg-background text-foreground">
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>}>
          <Outlet />
        </Suspense>
      </div>
    </ToastProvider>
  )
}

/** Render-time crashes in any page land here. */
export function Catch() {
  const error = useRouteError()
  return <ErrorScreen error={error} />
}

/** Shown while the first page's code loads. */
export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading...
    </div>
  )
}
