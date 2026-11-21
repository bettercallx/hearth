import { describe, expect, it } from 'vitest'
import { anthropicText, matchesRiskLanguage, parseJsonObject } from './journal-ai'

describe('anthropicText', () => {
  it('returns the text block', () => {
    expect(anthropicText({ content: [{ type: 'text', text: '{"a":1}' }], stop_reason: 'end_turn' })).toBe('{"a":1}')
  })

  it('refuses a reply cut off at max_tokens instead of passing on half a JSON object', () => {
    expect(() => anthropicText({ content: [{ type: 'text', text: '{"mood": 2, "sig' }], stop_reason: 'max_tokens' })).toThrow(
      /truncated/,
    )
  })
})

describe('parseJsonObject', () => {
  it('takes the object out of prose or code fences', () => {
    expect(parseJsonObject('Here you go:\n```json\n{"mood": 3}\n```')).toEqual({ mood: 3 })
  })
})

describe('matchesRiskLanguage', () => {
  it('catches clear risk language in English and Chinese, not ordinary bad days', () => {
    expect(matchesRiskLanguage('I keep thinking I want to die')).toBe(true)
    expect(matchesRiskLanguage('有时候真的不想活了')).toBe(true)
    expect(matchesRiskLanguage('this deadline is killing me, I am dying of boredom')).toBe(false)
  })
})
