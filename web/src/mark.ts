// The Quantum Sculptor mark: one point, blurred. A 5 × 5 field of dots whose radius falls off from the
// centre as a Gaussian, like a voxel after Quantum Blur Core has spread it to its neighbours.
// public/favicon.svg is drawn from the same numbers by scripts/favicon.mjs; keep the two in step.
export const MARK_N = 5
const C = (MARK_N - 1) / 2
/** [x, y, r] per dot, in cells of 1 (dot centres at x + 0.5). */
export const MARK_DOTS: [number, number, number][] = Array.from({ length: MARK_N * MARK_N }, (_, i) => {
  const x = i % MARK_N, y = Math.floor(i / MARK_N)
  const v = Math.exp(-((x - C) ** 2 + (y - C) ** 2) / 4.5)
  return [x, y, +(0.14 + 0.34 * v).toFixed(3)]
})
