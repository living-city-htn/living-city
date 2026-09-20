/**
 * Points, wearing a spark.
 *
 * "pts" is an abbreviation the eye has to decode, on a screen a judge reads in
 * seconds and from a metre away on stage. The spark is the same mark wherever
 * an amount of points appears - the header balance, a shop price, what you are
 * short by - so a bare number reads as points without carrying a unit.
 *
 * The mark is decorative. Every caller still says the amount in words in its
 * own aria-label, so a screen reader hears "120 points" rather than "120".
 */
export function Spark() {
  return (
    <svg className="spark" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
      <path
        d="M8 0 C8 4.42 4.42 8 0 8 C4.42 8 8 11.58 8 16 C8 11.58 11.58 8 16 8 C11.58 8 8 4.42 8 0 Z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function Points({ value }: { value: number | null }) {
  return (
    <span className="points">
      <Spark />
      <span className="points-value">{value === null ? '—' : value}</span>
    </span>
  )
}
