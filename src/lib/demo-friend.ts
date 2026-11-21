/**
 * The sample friend who comes with the demo data, so one account can see the
 * exchange diary working. Not a real account: an id no auth user can have,
 * written only by the seedDemo action and removed by clearDemo.
 */
export const DEMO_FRIEND = { id: 'demo-mia', name: 'Mia' } as const

export const isDemoUser = (id: string | undefined | null) => !!id && id.startsWith('demo-')
