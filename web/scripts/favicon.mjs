// Writes public/favicon.svg: the mark of src/mark.ts (same numbers) on a small rounded ground.
import { writeFileSync } from 'node:fs'
const N = 5, C = (N - 1) / 2, pad = 0.9, size = N + pad * 2
const dots = Array.from({ length: N * N }, (_, i) => {
  const x = i % N, y = Math.floor(i / N)
  const r = 0.14 + 0.34 * Math.exp(-((x - C) ** 2 + (y - C) ** 2) / 4.5)
  return `<circle cx="${(x + 0.5 + pad).toFixed(2)}" cy="${(y + 0.5 + pad).toFixed(2)}" r="${r.toFixed(3)}"/>`
}).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <style>.g{fill:#151618}.i{fill:#F2F3F5}@media (prefers-color-scheme:dark){.g{fill:#E8E9EC}.i{fill:#141517}}</style>
  <rect class="g" width="${size}" height="${size}" rx="1.4"/>
  <g class="i">${dots}</g>
</svg>
`
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg)
console.log('favicon.svg written')
