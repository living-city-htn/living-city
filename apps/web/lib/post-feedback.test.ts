import { describe, expect, it } from 'vitest'
import { feedbackMessage, postFeedback } from './post-feedback'

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
  it('does not promise a public update for a hidden post', () => {
    const receipt = postFeedback({ ...result, post: { ...result.post, hidden: true } }, 'Uptown')
    expect(receipt.state).toBe('hidden')
    expect(feedbackMessage(receipt)).toBe('Post received. It is not shown publicly.')
  })
  it('distinguishes a delayed update from a failed post', () => {
    expect(feedbackMessage({ ...postFeedback(result, 'Uptown'), state: 'unavailable' })).toContain('Your post is saved')
  })
})
