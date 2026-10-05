// The Quantum Sculptor mark: Schrödinger's cat as a 16 × 14 dot matrix. The left half is set in solid
// squares (one outcome), the right half in open dots (the other): both at once until it is looked at.
// public/favicon.svg is generated from these rows (scripts/favicon.mjs); keep the two in step.
export const CAT = [
  '..#..........#..',
  '..##........##..',
  '..###......###..',
  '..############..',
  '.##############.',
  '.###..####..###.',
  '.###..####..###.',
  '.##############.',
  '.######..######.',
  '.##############.',
  '..############..',
  '...##########...',
]
export const CAT_W = 16
export const CAT_H = CAT.length
/** Cells of the mark: [x, y, solid] — solid on the left half, dotted on the right. */
export const CAT_CELLS: [number, number, boolean][] = CAT.flatMap((row, y) =>
  [...row].flatMap((c, x) => (c === '#' ? [[x, y, x < CAT_W / 2] as [number, number, boolean]] : [])))
