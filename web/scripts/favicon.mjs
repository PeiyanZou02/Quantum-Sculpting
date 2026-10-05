// Writes public/favicon.svg from the mark in src/mark.ts (run: node scripts/favicon.mjs).
import { readFileSync, writeFileSync } from 'node:fs'
const src = readFileSync(new URL('../src/mark.ts', import.meta.url), 'utf8')
const rows = [...src.matchAll(/^\s+'([.#]+)',$/gm)].map((m) => m[1])
const W = rows[0].length, H = rows.length, pad = 1, size = W + pad * 2
const oy = (size - H) / 2
const cells = rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === '#' ? [[x, y]] : [])))
const sq = cells.filter(([x]) => x < W / 2).map(([x, y]) => `<rect x="${x + pad + 0.05}" y="${y + oy + 0.05}" width=".9" height=".9"/>`).join('')
const dot = cells.filter(([x]) => x >= W / 2).map(([x, y]) => `<circle cx="${x + pad + 0.5}" cy="${y + oy + 0.5}" r=".44"/>`).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <style>.g{fill:#E3E4E7}.i{fill:#151618}@media (prefers-color-scheme:dark){.g{fill:#141517}.i{fill:#E8E9EC}}</style>
  <rect class="g" width="${size}" height="${size}" rx="3"/>
  <g class="i">${sq}${dot}</g>
</svg>
`
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg)
console.log(`favicon.svg: ${cells.length} cells`)
