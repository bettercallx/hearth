/**
 * Who pays for each integration ('developer' = the app owner, the default for
 * anything unlisted). Hearth's speech and Claude calls are all developer-billed.
 */
export const integrations: Record<string, { billing: 'developer' | 'user'; anonymous?: boolean }> = {}
