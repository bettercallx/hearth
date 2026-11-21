/**
 * Pages in (app)/ get auth, the records connection and the header. The folder
 * name is a route group, so it doesn't appear in the URL: (app)/home.tsx is /home.
 */

import { Suspense, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { DeepSpaceAuthProvider, useAuthStatus } from 'deepspace'
import { RecordProvider, RecordScope, AgentTools } from 'deepspace'
import Navigation from '../../components/Navigation'
import { useToast } from '@/components/ui'
import { APP_NAME, SCOPE_ID } from '../../constants'
import { schemas } from '../../schemas'

export default function AppLayout() {
  return (
    <DeepSpaceAuthProvider>
      <title>{APP_NAME}</title>
      <AuthBoot>
        <div className="flex h-screen flex-col bg-background overflow-hidden">
          <Navigation />
          <main className="flex-1 overflow-y-auto min-h-0">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </AuthBoot>
    </DeepSpaceAuthProvider>
  )
}

/** Waits for the session check, then mounts the data layer. Rejected writes surface as toasts. */
function AuthBoot({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuthStatus()
  const { error, warning } = useToast()

  if (!isLoaded) {
    return <div aria-busy="true" className="fixed inset-0 bg-background" />
  }

  return (
    <RecordProvider
      allowAnonymous
      onWriteError={(e) =>
        e.kind === 'permission' ? warning(e.title, e.detail) : error(e.title, e.detail)
      }
    >
      <RecordScope roomId={SCOPE_ID} schemas={schemas}>
        <AgentTools />
        {children}
      </RecordScope>
    </RecordProvider>
  )
}
