import type { PostResult } from '../components/PostComposer'

export type PostFeedback = {
  communityId: string
  communityName: string
  points: number | null
  state: 'hidden' | 'analyzing' | 'planning' | 'updated' | 'unavailable'
  /** Server-confirmed OMNI result. Never show a success claim on degradation. */
  voice: { cues: string[] } | null
}

export type ConfirmationPresentation = {
  eyebrow: string
  title: string
}

export function postFeedback(result: PostResult, communityName: string): PostFeedback {
  const voice = !result.post.hidden && result.voice?.state === 'none' && result.voice.heard
    ? {
      // Cues are model output. Keep this receipt compact and ensure malformed
      // API data cannot turn into a claim in the judge-facing UI.
      cues: Array.isArray(result.voice.cues)
        ? result.voice.cues.filter((cue): cue is string => typeof cue === 'string' && cue.trim().length > 0).slice(0, 3)
        : [],
    }
    : null

  return {
    communityId: result.post.community_id,
    communityName,
    points: typeof result.points_earned === 'number' ? result.points_earned : null,
    state: result.post.hidden ? 'hidden' : result.post.status === 'pending' ? 'analyzing' : 'planning',
    voice,
  }
}

export function feedbackMessage(feedback: PostFeedback): string {
  const saved = `Post saved to ${feedback.communityName}.`
  switch (feedback.state) {
    case 'hidden': return 'Post received. It is not shown publicly.'
    case 'analyzing': return `${saved} Your post is still being analyzed.`
    case 'planning': return `${saved} Waiting for the next city update.`
    case 'updated': return `${saved} This community has a new city plan.`
    case 'unavailable': return `${saved} A city update has not arrived yet. Your post is saved.`
  }
}

/** Short, scannable copy for the receipt shown above the city. */
export function confirmationPresentation(feedback: PostFeedback): ConfirmationPresentation {
  switch (feedback.state) {
    case 'hidden': return { eyebrow: 'Post received', title: 'This post is not public' }
    case 'analyzing': return { eyebrow: 'Post analysis', title: 'Analyzing your post' }
    case 'planning': return { eyebrow: 'City update', title: `Preparing ${feedback.communityName}’s next look` }
    case 'updated': return { eyebrow: 'City updated', title: `${feedback.communityName} has a new city plan` }
    case 'unavailable': return { eyebrow: 'Post saved', title: `${feedback.communityName} is waiting for its next city update` }
  }
}
