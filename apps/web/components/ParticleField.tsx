'use client'

/**
 * Slow drift behind the city: pollen, or seeds on the wind. It is the app's
 * only ambient motion and it lives in the chrome, not in the scene.
 *
 * Deliberately NOT the plan's `effects` (fireflies, sparkles, music notes).
 * Those are 3D's, capped at three by docs/04 section 3, and they mean something
 * — a block carrying them is a block the AI decided was festive. This is just
 * air, and it must never be mistaken for a plan.
 *
 * Positions are a fixed table rather than Math.random(), so the server and the
 * client render the same thing and nothing flickers on hydration. Transform and
 * opacity only, so it composites on the GPU and costs a phone nothing;
 * prefers-reduced-motion stops it with everything else.
 */
/**
 * Depth comes from size and opacity together: the small faint ones read as far
 * away, the larger brighter ones as close. Same trick as haze on a hillside.
 */
const PARTICLES = [
  { x: 5, size: 7, delay: 0, duration: 30, drift: 22, peak: 0.95 },
  { x: 12, size: 3, delay: 6, duration: 52, drift: -12, peak: 0.4 },
  { x: 19, size: 5, delay: 12, duration: 38, drift: 18, peak: 0.7 },
  { x: 26, size: 9, delay: 2, duration: 27, drift: -26, peak: 1 },
  { x: 33, size: 3, delay: 19, duration: 55, drift: 14, peak: 0.35 },
  { x: 41, size: 6, delay: 9, duration: 35, drift: -20, peak: 0.8 },
  { x: 48, size: 4, delay: 24, duration: 46, drift: 16, peak: 0.5 },
  { x: 56, size: 8, delay: 4, duration: 29, drift: -24, peak: 0.95 },
  { x: 63, size: 3, delay: 16, duration: 58, drift: 20, peak: 0.35 },
  { x: 71, size: 6, delay: 11, duration: 34, drift: -16, peak: 0.75 },
  { x: 78, size: 4, delay: 27, duration: 49, drift: 24, peak: 0.5 },
  { x: 85, size: 9, delay: 7, duration: 26, drift: -22, peak: 1 },
  { x: 92, size: 3, delay: 21, duration: 54, drift: 12, peak: 0.4 },
  { x: 97, size: 5, delay: 14, duration: 41, drift: -18, peak: 0.65 },
]

export default function ParticleField() {
  return (
    <div className="particles" aria-hidden="true">
      {PARTICLES.filter((_, i) => i % 2 === 0).map((p, i) => (
        <span
          key={i}
          className="particle"
          style={{
            left: `${p.x}%`,
            width: Math.min(p.size, 3),
            height: Math.min(p.size, 3),
            animationDelay: `-${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--drift' as string]: `${p.drift}px`,
            ['--peak' as string]: String(p.peak),
          }}
        />
      ))}
    </div>
  )
}
