import { describe, expect, it } from 'vitest'
import { confirmationPresentation, feedbackMessage, postFeedback } from './post-feedback'

describe('post confirmation', () => {
  const result = { post: { id: 'p', community_id: 'kw:a', status: 'analyzed' as const, hidden: false } }
  it('does not invent rewards or claim a city update when a post is saved', () => {
    const receipt = postFeedback(result, 'University District')
    expect(receipt.points).toBeNull()
    expect(receipt.state).toBe('planning')
    expect(feedbackMessage(receipt)).toContain('Waiting for the next city update')
  })
  it('shows only server-confirmed points and distinguishes pending analysis', () => {
    const receipt = postFeedback({ ...result, points_earned: 20, post: { ...result.post, status: 'pending' } }, 'Uptown')
    expect(receipt.points).toBe(20)
    expect(receipt.state).toBe('analyzing')
  })
  it('carries only a successful OMNI voice result into the judge-facing receipt', () => {
    const receipt = postFeedback({
      ...result,
      voice: { state: 'none', heard: true, cues: ['live music', 'crowd chatter'] },
    }, 'Uptown')

    expect(receipt.voice).toEqual({ cues: ['live music', 'crowd chatter'] })
  })
  it('does not claim that a degraded voice note was understood', () => {
    const receipt = postFeedback({
      ...result,
      voice: { state: 'unintelligible', heard: false, cues: [] },
    }, 'Uptown')

    expect(receipt.voice).toBeNull()
  })
  it('does not promise a public update for a hidden post', () => {
    const receipt = postFeedback({
      ...result,
      post: { ...result.post, hidden: true },
      voice: { state: 'none', heard: true, cues: ['crowd chatter'] },
    }, 'Uptown')
    expect(receipt.state).toBe('hidden')
    expect(receipt.voice).toBeNull()
    expect(feedbackMessage(receipt)).toBe('Post received. It is not shown publicly.')
  })
  it('distinguishes a delayed update from a failed post', () => {
    expect(feedbackMessage({ ...postFeedback(result, 'Uptown'), state: 'unavailable' })).toContain('Your post is saved')
  })

  it('gives the receipt a clear city-update stage', () => {
    expect(confirmationPresentation(postFeedback(result, 'Beechwood'))).toEqual({
      eyebrow: 'City update',
      title: 'Preparing Beechwood’s next look',
    })
    expect(confirmationPresentation({ ...postFeedback(result, 'Beechwood'), state: 'updated' })).toEqual({
      eyebrow: 'City updated',
      title: 'Beechwood has a new city plan',
    })
  })
})
