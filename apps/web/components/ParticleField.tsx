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
const PARTICLES = [
  { x: 6, size: 5, delay: 0, duration: 34, drift: 18 },
  { x: 14, size: 3, delay: 6, duration: 44, drift: -12 },
  { x: 23, size: 6, delay: 12, duration: 38, drift: 24 },
  { x: 31, size: 4, delay: 2, duration: 50, drift: -20 },
  { x: 39, size: 3, delay: 18, duration: 41, drift: 14 },
  { x: 47, size: 7, delay: 9, duration: 36, drift: -26 },
  { x: 55, size: 4, delay: 22, duration: 47, drift: 20 },
  { x: 62, size: 5, delay: 4, duration: 39, drift: -16 },
  { x: 70, size: 3, delay: 15, duration: 52, drift: 22 },
  { x: 78, size: 6, delay: 11, duration: 35, drift: -18 },
  { x: 86, size: 4, delay: 25, duration: 45, drift: 16 },
  { x: 94, size: 5, delay: 7, duration: 42, drift: -22 },
]

export default function ParticleField() {
  return (
    <div className="particles" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="particle"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size,
            animationDelay: `-${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
