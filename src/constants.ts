export const APP_NAME = 'Hearth'

/** Injected by deepspaceBuild() from DEEPSPACE_APP_ID in wrangler.toml; never hard-code it. */
declare const __DEEPSPACE_APP_ID__: string

/** Scope of the app's RecordRoom. */
export const SCOPE_ID = `app:${__DEEPSPACE_APP_ID__}`

/**
 * The sample friend who comes with the demo data. Not a real account: an id no
 * auth user can have, written only by seedDemo and removed by clearDemo.
 */
export const DEMO_FRIEND = { id: 'demo-mia', name: 'Mia' } as const

export const isDemoUser = (id: string | undefined | null) => !!id && id.startsWith('demo-')
