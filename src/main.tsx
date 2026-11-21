import { createRoot } from 'react-dom/client'
import { routes } from '@generouted/react-router/lazy'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { installStaleChunkRecovery } from './stale-chunk-recovery'
import './styles.css'

const router = createBrowserRouter(routes)
installStaleChunkRecovery(router)
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
