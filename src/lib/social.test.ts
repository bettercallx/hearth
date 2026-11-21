import { describe, expect, it } from 'vitest'
import { inviteCodeFrom } from './social'

describe('inviteCodeFrom', () => {
  it('takes the code out of a pasted invite link', () => {
    expect(inviteCodeFrom('https://hearth.app.space/exchange?invite=abcd2345efgh')).toBe('abcd2345efgh')
    expect(inviteCodeFrom('  https://hearth.app.space/exchange?invite=abcd2345efgh  ')).toBe('abcd2345efgh')
  })

  it('accepts a bare code', () => {
    expect(inviteCodeFrom('abcd2345efgh')).toBe('abcd2345efgh')
  })

  it('refuses anything else', () => {
    expect(inviteCodeFrom('https://hearth.app.space/exchange')).toBeNull()
    expect(inviteCodeFrom('hello there')).toBeNull()
    expect(inviteCodeFrom('abc')).toBeNull()
  })
})
