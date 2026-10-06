// Research: the research behind the project, set as a journal article. A masthead, the title block, the
// abstract with its keywords, a prologue, numbered sections with figures and tables, a coda and an appendix,
// endnotes, works cited, the sources the work is built on, and credits. The contents in the margin follow the reading position.
// Everything here is plain JSX, figures included, so the text can be revised in place.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import './research.css'

const SECTIONS = [
  { id: 'rs-0', n: '', t: 'Prologue: one turn' },
  { id: 'rs-1', n: 'I', t: 'Which part of chance: measurement in place of the hand' },
  { id: 'rs-2', n: 'II', t: 'Two losses and a third: from statue to qubits' },
  { id: 'rs-3', n: 'III', t: 'The nations we carve by' },
  { id: 'rs-4', n: 'IV', t: 'One history: 5 October 2026' },
  { id: 'rs-5', n: 'V', t: 'Objection: a coin would do' },
  { id: 'rs-6', n: 'VI', t: 'Entered, not surveyed' },
  { id: 'rs-7', n: 'VII', t: 'The operative imaginary' },
  { id: 'rs-8', n: '', t: 'Coda: the runs we did not print' },
  { id: 'rs-a', n: 'A', t: 'The Lab' },
]
const BACK = [
  { id: 'rs-notes', t: 'Endnotes' },
  { id: 'rs-cited', t: 'Works cited' },
  { id: 'rs-sources', t: 'Sources' },
  { id: 'rs-credits', t: 'Credits' },
]
const KEYWORDS = ['quantum sculpting', 'measurement', 'authorship', 'conditions', 'latent space', 'counterfactual form', 'conceptual metaphor', 'provenance', 'quantum randomness', 'interface']

/** A reference to endnote `n`; the note links back. */
function N({ n }: { n: number }) {
  return <sup className="rs__ref"><a id={`rs-r${n}`} href={`#rs-n${n}`} onClick={jump(`rs-n${n}`)}>{n}</a></sup>
}

/** The link at the end of an endnote, back to where it is referenced. */
function Back({ n }: { n: number }) {
  return <a href={`#rs-r${n}`} onClick={jump(`rs-r${n}`)} aria-label="Back to the text">↩</a>
}

/** An identifier in the running text (a device, an engine, a repository), set in the mono. */
function C({ children }: { children: ReactNode }) {
  return <code className="rs__c">{children}</code>
}

/** A field still to be filled in from the run's log: shows what goes there. */
function F({ children }: { children: ReactNode }) {
  return <span className="rs__f" title="To fill in from the 5 October Evolve log">{children}</span>
}

/** Something still to be added to a reference (a page, a title, a date). */
function Todo({ children }: { children: ReactNode }) {
  return <span className="rs__todo" title="To add">{children}</span>
}

/** A page number still to be added to a citation. */
function Pg() {
  return <Todo>p. —</Todo>
}

/** Scroll inside the page's own scroller rather than letting the hash move the app. */
function jump(id: string) {
  return (e: MouseEvent) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function Sec({ id, n, t, children }: { id: string; n: string; t: string; children: ReactNode }) {
  return (
    <section className="rs__sec" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="rs__h" id={`${id}-h`}>{n && <span className="rs__hn">{n}.</span>}{t}</h2>
      {children}
    </section>
  )
}

function Fig({ n, kind = 'Fig.', caption, children, wide }: { n: number; kind?: string; caption: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={'rs__fig' + (wide ? ' rs__fig--wide' : '') + (kind === 'Table' ? ' rs__fig--tbl' : '')}>
      <div className="rs__figb">{children}</div>
      <figcaption className="rs__cap"><span className="rs__capn">{kind} {n}</span><span>{caption}</span></figcaption>
    </figure>
  )
}

/** An empty frame where an image is still to come. */
function Slot({ label, ratio = '16 / 9' }: { label: string; ratio?: string }) {
  return <div className="rs__slot" style={{ aspectRatio: ratio }}><span>{label}</span></div>
}

// ── figures ────────────────────────────────────────────────────────────
// One visual language: thin lines, square boxes, ink levels only. Words that explain are set in the
// sans; names from the app, values, ids and devices in the mono (rs__tx--m).

/** The arrowhead a figure's lines end in. Each figure defines its own, under its own id. */
function Arw({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L8 4 L0 8 z" className="rs__fill" />
      </marker>
    </defs>
  )
}

/** Fig. 1: the program, end to end. Five steps; the quantum step runs one of four engines. */
function ProgramFig() {
  const W = 112, xs = [0, 132, 264, 396, 528]
  const steps = ['Model', 'Voxelise', 'Quantum', 'Mesh', 'Compose']
  const notes: ReactNode[][] = [
    ['a built-in shape:', 'cup, sphere, cube,', 'pyramid, cylinder,', 'cone, torus; or', 'your own mesh'],
    [<>a grid, <tspan className="rs__tx--m">16³–256³</tspan></>, 'each cell holds', 'how much of it', 'the model fills'],
    [],
    ['a surface cut', 'at a level,', 'checked and', <>exported as <tspan className="rs__tx--m">STL</tspan></>],
    ['HUD pieces around', 'the object, one', 'animation clock;', 'export image,', 'video or GLB'],
  ]
  const engines: { t: string; d: ReactNode[] }[] = [
    { t: 'Gauss', d: ['a local approximation:', 'a plain blur'] },
    { t: 'Emulate', d: ['the Quantum Blur Core,', 'emulated locally'] },
    { t: 'Atlas', d: ['the Blur Core on Moth’s', 'platform: real hardware', 'or a simulator'] },
    { t: 'Evolve', d: ['nations, one qubit each,', 'turn by turn; numbers', <>from <tspan className="rs__tx--m">comet-qrng-v1</tspan></>] },
  ]
  const ex = [0, 164, 328, 492], BW = 80, bus = 134
  const cover = [0.15, 0.6, 0.6, 0.15, 0.6, 1, 1, 0.6, 0.6, 1, 1, 0.6, 0.15, 0.6, 0.6, 0.15]
  const a = 'url(#rs-arw-prog)'
  return (
    <svg viewBox="0 0 640 228" className="rs__svg" role="img" aria-label="The program in five steps, left to right. Model: a built-in shape (cup, sphere, cube, pyramid, cylinder, cone, torus) or your own mesh. Voxelise: a grid of 16 to 256 cells a side, each cell holding how much of it the model fills. Quantum. Mesh: a surface cut at a level, checked and exported as STL. Compose: pieces around the object on one animation clock, exported as image, video or GLB. The quantum step branches into four engines: Gauss, a local approximation; Emulate, the Quantum Blur Core emulated locally; Atlas, the Blur Core on Moth's platform, on real hardware or a simulator; and Evolve, highlighted, nations with one qubit each, turn by turn, with random numbers from comet-qrng-v1.">
      <Arw id="rs-arw-prog" />
      {steps.map((s, i) => (
        <g key={s}>
          <rect x={xs[i]} y={8} width={W} height={40} className="rs__box" />
          <text x={xs[i] + 44} y={32} className="rs__tx rs__tx--m rs__tx--ink">{s}</text>
          {i < steps.length - 1 && <line x1={xs[i] + W} y1={28} x2={xs[i + 1] - 1} y2={28} className="rs__ln" markerEnd={a} />}
          {notes[i].map((l, k) => <text key={k} x={xs[i]} y={66 + k * 14} className="rs__tx">{l}</text>)}
        </g>
      ))}
      {/* pictograms: the model, cells holding coverage, a qubit, contours of a field, the object in its frame */}
      <path transform={`translate(${xs[0] + 6} 13) scale(1.25)`} d="M5 6h11v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z M16 9h1.5a2.5 2.5 0 0 1 0 5H16" className="rs__ln rs__ln--k" vectorEffect="non-scaling-stroke" />
      {cover.map((v, k) => <rect key={k} x={xs[1] + 8 + (k % 4) * 6} y={16 + Math.floor(k / 4) * 6} width={5} height={5} className="rs__cell" fillOpacity={v} />)}
      <circle cx={xs[2] + 20} cy={28} r={11} className="rs__ln" />
      <ellipse cx={xs[2] + 20} cy={28} rx={11} ry={3.5} className="rs__ln rs__ln--faint" />
      <line x1={xs[2] + 20} y1={28} x2={xs[2] + 27} y2={19} className="rs__ln rs__ln--k" />
      <circle cx={xs[2] + 27} cy={19} r={2} className="rs__dot" />
      <circle cx={xs[3] + 20} cy={28} r={5} className="rs__ln rs__ln--faint" />
      <circle cx={xs[3] + 20} cy={28} r={9} className="rs__ln rs__ln--ink" />
      <circle cx={xs[3] + 20} cy={28} r={13} className="rs__ln rs__ln--faint" />
      <rect x={xs[4] + 15} y={23} width={10} height={10} className="rs__fill" />
      {[[7, 15, 1, 1], [33, 15, -1, 1], [7, 41, 1, -1], [33, 41, -1, -1]].map(([x, y, dx, dy]) => (
        <path key={`${x}.${y}`} d={`M${xs[4] + x} ${y + dy * 5} V${y} H${xs[4] + x + dx * 5}`} className="rs__ln rs__ln--k" />
      ))}
      {/* the quantum step branches into its engines */}
      <line x1={xs[2] + W / 2} y1={48} x2={xs[2] + W / 2} y2={bus} className="rs__ln" />
      <line x1={ex[0] + BW / 2} y1={bus} x2={ex[3] + BW / 2} y2={bus} className="rs__ln" />
      {engines.map((e, i) => {
        const x = ex[i], on = e.t === 'Evolve'
        return (
          <g key={e.t}>
            <line x1={x + BW / 2} y1={bus} x2={x + BW / 2} y2={147} className="rs__ln" markerEnd={a} />
            <rect x={x} y={148} width={BW} height={24} className={on ? 'rs__box rs__box--on' : 'rs__box'} />
            <text x={x + BW / 2} y={164} textAnchor="middle" className={'rs__tx rs__tx--m ' + (on ? 'rs__tx--on' : 'rs__tx--ink')}>{e.t}</text>
            {e.d.map((l, k) => <text key={k} x={x} y={190 + k * 14} className="rs__tx">{l}</text>)}
          </g>
        )
      })}
    </svg>
  )
}

/** Fig. 3: one nation's inclinations as a direction on the Bloch sphere. */
function SphereFig() {
  const c = 110, r = 78
  return (
    <svg viewBox="0 0 560 220" className="rs__svg" role="img" aria-label="A sphere with three axes: attack, defend and explore. One direction points between them; its shadow on the asked axis, b, sets the odds of a yes. b = 1 is always yes, b = 0 a coin toss, b = −1 always no. When the individual is entangled the direction is shorter and b moves towards 0.">
      <circle cx={c} cy={c} r={r} className="rs__ln" />
      <ellipse cx={c} cy={c} rx={r} ry={r * 0.3} className="rs__ln rs__ln--faint" />
      <line x1={c} y1={c} x2={c} y2={c - r - 12} className="rs__ln" />
      <line x1={c} y1={c} x2={c + r + 14} y2={c} className="rs__ln" />
      <line x1={c} y1={c} x2={c - 52} y2={c + 44} className="rs__ln" />
      <text x={c + 6} y={c - r - 6} className="rs__tx">explore · <tspan className="rs__tx--m">Z</tspan></text>
      <text x={c + r + 4} y={c - 8} className="rs__tx">defend · <tspan className="rs__tx--m">Y</tspan></text>
      <text x={c - 92} y={c + 62} className="rs__tx">attack · <tspan className="rs__tx--m">X</tspan></text>
      <line x1={c} y1={c} x2={c + 40} y2={c - 54} className="rs__ln rs__ln--ink" />
      <circle cx={c + 40} cy={c - 54} r={3.5} className="rs__dot" />
      <line x1={c + 40} y1={c - 54} x2={c} y2={c - 54} className="rs__ln rs__ln--dash" />
      <circle cx={c} cy={c - 54} r={2.5} className="rs__dot" />
      <text x={c - 8} y={c - 50} textAnchor="end" className="rs__tx rs__tx--m rs__tx--ink">b</text>
      <g transform="translate(320 34)">
        <text className="rs__tx rs__tx--ink" y={0}>asked: explore</text>
        <text className="rs__tx" y={22}>b is the length of the direction</text>
        <text className="rs__tx" y={38}>along the asked axis</text>
        <text className="rs__tx rs__tx--m" y={66}>b = 1</text><text className="rs__tx" x={56} y={66}>always yes</text>
        <text className="rs__tx rs__tx--m" y={82}>b = 0</text><text className="rs__tx" x={56} y={82}>a coin toss</text>
        <text className="rs__tx rs__tx--m" y={98}>b = −1</text><text className="rs__tx" x={56} y={98}>always no</text>
        <text className="rs__tx" y={126}>entangled: the direction is</text>
        <text className="rs__tx" y={142}>shorter, and b moves towards 0</text>
      </g>
    </svg>
  )
}

/** Fig. 4: the loop. Only "measure" is not a written rule; the original surface runs underneath. */
function LoopFig() {
  const steps = ['prepare', 'ask', 'measure', 'act', 'update']
  const x0 = 150, w = 62, gap = 10, a = 'url(#rs-arw-loop)'
  return (
    <svg viewBox="0 0 640 196" className="rs__svg" role="img" aria-label="The process: model, divide, then a loop of prepare, ask, measure, act and update repeated sixty times, then join and print. Only measure is decided by measurement; every other step is a written rule. The original surface runs from the model to the join.">
      <Arw id="rs-arw-loop" />
      <rect x={4} y={44} width={58} height={30} className="rs__box" /><text x={33} y={63} textAnchor="middle" className="rs__tx">model</text>
      <rect x={74} y={44} width={62} height={30} className="rs__box" /><text x={105} y={63} textAnchor="middle" className="rs__tx">divide</text>
      <line x1={62} y1={59} x2={72} y2={59} className="rs__ln" markerEnd={a} />
      <line x1={136} y1={59} x2={x0 - 2} y2={59} className="rs__ln" markerEnd={a} />
      {steps.map((s, i) => {
        const x = x0 + i * (w + gap), on = s === 'measure'
        return (
          <g key={s}>
            <rect x={x} y={44} width={w} height={30} className={on ? 'rs__box rs__box--on' : 'rs__box'} />
            <text x={x + w / 2} y={63} textAnchor="middle" className={on ? 'rs__tx rs__tx--on' : 'rs__tx'}>{s}</text>
            {i < steps.length - 1 && <line x1={x + w} y1={59} x2={x + w + gap - 1} y2={59} className="rs__ln" markerEnd={a} />}
          </g>
        )
      })}
      <path d={`M${x0 + 4 * (w + gap) + w / 2} 44 V22 H${x0 + w / 2} V42`} className="rs__ln" fill="none" markerEnd={a} />
      <text x={x0 + 2 * (w + gap) + w / 2} y={16} textAnchor="middle" className="rs__tx rs__tx--m">× 60 turns</text>
      <line x1={x0 + 5 * (w + gap) - gap} y1={59} x2={512} y2={59} className="rs__ln" markerEnd={a} />
      <rect x={514} y={44} width={56} height={30} className="rs__box" /><text x={542} y={63} textAnchor="middle" className="rs__tx">join</text>
      <line x1={570} y1={59} x2={580} y2={59} className="rs__ln" markerEnd={a} />
      <rect x={582} y={44} width={54} height={30} className="rs__box" /><text x={609} y={63} textAnchor="middle" className="rs__tx">print</text>
      <path d="M33 74 V112 H542 V76" className="rs__ln rs__ln--ink" fill="none" markerEnd={a} />
      <text x={290} y={128} textAnchor="middle" className="rs__tx rs__tx--ink">the original surface, kept with its detail</text>
      <rect x={x0} y={152} width={12} height={12} className="rs__box rs__box--on" />
      <text x={x0 + 20} y={162} className="rs__tx">decided by measurement</text>
      <rect x={x0 + 200} y={152} width={12} height={12} className="rs__box" />
      <text x={x0 + 220} y={162} className="rs__tx">a written rule</text>
    </svg>
  )
}

/** Fig. 5: the push amount, the dial between the given form and the measured change. */
function DialFig() {
  const x0 = 40, x1 = 600, at = (v: number) => x0 + (v / 8) * (x1 - x0)
  return (
    <svg viewBox="0 0 640 110" className="rs__svg" role="img" aria-label="A scale from 0 to 8. At 0 the model is unchanged; at 8 the form is closest to what the qubits make alone. This piece stops at 6.">
      <line x1={x0} y1={50} x2={x1} y2={50} className="rs__ln" />
      {Array.from({ length: 9 }, (_, v) => (
        <g key={v}>
          <line x1={at(v)} y1={44} x2={at(v)} y2={56} className="rs__ln" />
          <text x={at(v)} y={74} textAnchor="middle" className="rs__tx rs__tx--m">{v}</text>
        </g>
      ))}
      <line x1={x0} y1={50} x2={at(6)} y2={50} className="rs__ln rs__ln--thick" />
      <circle cx={at(6)} cy={50} r={6} className="rs__dot" />
      <text x={at(6)} y={30} textAnchor="middle" className="rs__tx rs__tx--ink">this piece: <tspan className="rs__tx--m">6</tspan></text>
      <text x={x0} y={98} className="rs__tx">the model as given</text>
      <text x={x1} y={98} textAnchor="end" className="rs__tx">what the qubits make alone</text>
    </svg>
  )
}

/** A small seeded generator, so each schematic run draws the same form on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** A schematic form on a 10 × 10 grid: a disc, or (with a seed) a disc whose edge, body and
 *  surroundings one run's numbers have changed: cells gained and lost at the edge, cracks, islands. */
function formOf(seed: number | null, n = 10, r = 4.2): boolean[] {
  const rnd = seeded(seed ?? 1), c = (n - 1) / 2, out: boolean[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i - c, j - c), inside = d <= r, u = rnd()
      if (seed == null) out.push(inside)
      else if (Math.abs(d - r) < 1.3) out.push(u < (inside ? 0.62 : 0.36))
      else out.push(inside ? u > 0.07 : u < 0.035)
    }
  }
  return out
}
const GIVEN = formOf(null)
const RUNS = [
  { name: 'run1', chip: 'ibm_marrakesh', cells: formOf(7) },
  { name: 'run2', chip: 'ibm_boston', cells: formOf(19) },
  { name: 'run3', chip: 'ibm_fez', cells: formOf(41) },
]

/** Fig. 7: many latent spaces. One model, several runs, a different form from each. */
function RunsFig() {
  const rows = [62, 142, 222], a = 'url(#rs-arw-runs)'
  const cells = (on: boolean[], x: number, y: number, s: number, cls: string) =>
    on.map((v, k) => v && <rect key={k} x={x + (k % 10) * s} y={y + Math.floor(k / 10) * s} width={s - 1} height={s - 1} className={cls} />)
  return (
    <svg viewBox="0 0 640 274" className="rs__svg" role="img" aria-label="One model on the left, drawn as a disc of cells, feeds three runs: run1, run2 and run3, whose random numbers were measured on ibm_marrakesh, ibm_boston and ibm_fez. Each run gives the same model a different form, with its own edges, cracks and islands against the dashed outline of the original. A faint line leads on to every other name, each another space.">
      <Arw id="rs-arw-runs" />
      <text x={10} y={12} className="rs__tx rs__tx--dim">one model</text>
      <text x={200} y={12} className="rs__tx rs__tx--dim">a run, and the chip it was measured on</text>
      <text x={470} y={12} className="rs__tx rs__tx--dim">a form for each</text>
      {cells(GIVEN, 10, 102, 8, 'rs__fill rs__fill--dim')}
      {RUNS.map((r, i) => {
        const y = rows[i]
        return (
          <g key={r.name}>
            <path d={`M96 142 C 150 142, 146 ${y}, 198 ${y}`} className="rs__ln" markerEnd={a} />
            <rect x={200} y={y - 12} width={64} height={24} className="rs__box" />
            <text x={232} y={y + 4} textAnchor="middle" className="rs__tx rs__tx--m rs__tx--ink">{r.name}</text>
            <text x={276} y={y + 4} className="rs__tx rs__tx--m">{r.chip}</text>
            <line x1={386} y1={y} x2={464} y2={y} className="rs__ln" markerEnd={a} />
            {cells(r.cells, 470, y - 35, 7, 'rs__fill')}
            <circle cx={504.5} cy={y - 0.5} r={33} className="rs__ln rs__ln--faint" />
          </g>
        )
      })}
      <path d="M96 142 C 150 142, 146 262, 198 262" className="rs__ln rs__ln--faint" />
      <text x={204} y={266} className="rs__tx rs__tx--dim">and another space for every other name</text>
    </svg>
  )
}

/** Fig. 2: discreteness lost and regained, for Evolve's individuals and for the blur's cells. */
function AbsorbFig() {
  const px = [100, 240, 380, 520], PW = 110, cy = 60, a = 'url(#rs-arw-abs)'
  const heads = ['discrete', 'superposed', 'entangled', 'measured']
  const top = ['each its own state', 'odds, not answers', 'one shared state', 'discrete, changed']
  const bottom = ['inside or outside', 'partly filled', 'mixed by the blur', 'cut at a level']
  const strips = [
    [0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0.2, 0.9, 1, 1, 1, 0.85, 0.15, 0, 0],
    [0.05, 0.22, 0.5, 0.75, 0.85, 0.8, 0.62, 0.35, 0.12, 0.03],
    [0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  ]
  const spread = [18, 55, 92], close = [37, 55, 73]
  const after: [number, number, string][] = [[14, 52, 'yes'], [54, 66, 'no'], [94, 56, 'yes']]
  return (
    <svg viewBox="0 0 640 178" className="rs__svg" role="img" aria-label="Two rows, four stages each: discrete, superposed, entangled, measured. Top row, Evolve's individuals: three separate points, each in its own box; then each spread into a dashed circle of odds; then the circles overlapping inside one shared outline; then three separate points again, moved, answering yes, no and yes. Bottom row, a strip of ten cells: inside or outside; partly filled once the model is voxelised; mixed with their neighbours by the blur; then cut at a level into inside and outside again, one cell wider on each side than at the start.">
      <Arw id="rs-arw-abs" />
      <text x={0} y={cy - 2} className="rs__tx rs__tx--ink">individuals</text>
      <text x={0} y={cy + 12} className="rs__tx rs__tx--m rs__tx--dim">Evolve</text>
      <text x={0} y={140} className="rs__tx rs__tx--ink">cells</text>
      <text x={0} y={154} className="rs__tx rs__tx--dim">in the blur</text>
      {px.map((x, i) => (
        <g key={heads[i]}>
          <text x={x} y={14} className="rs__tx rs__tx--ink">{heads[i]}</text>
          <text x={x} y={112} className="rs__tx rs__tx--dim">{top[i]}</text>
          <text x={x} y={172} className="rs__tx rs__tx--dim">{bottom[i]}</text>
          {i < px.length - 1 && <line x1={x + PW + 4} y1={cy} x2={px[i + 1] - 6} y2={cy} className="rs__ln" markerEnd={a} />}
          {i < px.length - 1 && <line x1={x + PW + 4} y1={141} x2={px[i + 1] - 6} y2={141} className="rs__ln" markerEnd={a} />}
          {strips[i].map((v, k) => <rect key={k} x={x + k * 11} y={136} width={10} height={10} className="rs__cell" fillOpacity={v} />)}
        </g>
      ))}
      {spread.map((d) => (
        <g key={`d${d}`}>
          <rect x={px[0] + d - 9} y={cy - 9} width={18} height={18} className="rs__box" />
          <circle cx={px[0] + d} cy={cy} r={3.5} className="rs__dot" />
          <circle cx={px[1] + d} cy={cy} r={14} className="rs__ln rs__ln--dash" />
          <circle cx={px[1] + d} cy={cy} r={2} className="rs__fill rs__fill--dim" />
        </g>
      ))}
      <ellipse cx={px[2] + 55} cy={cy} rx={52} ry={26} className="rs__ln rs__ln--ink" />
      {close.map((d) => (
        <g key={`e${d}`}>
          <circle cx={px[2] + d} cy={cy} r={16} className="rs__ln rs__ln--dash" />
          <circle cx={px[2] + d} cy={cy} r={2} className="rs__fill rs__fill--dim" />
        </g>
      ))}
      {after.map(([d, y, t]) => (
        <g key={`m${d}`}>
          <rect x={px[3] + d - 9} y={y - 9} width={18} height={18} className="rs__box" />
          <circle cx={px[3] + d} cy={y} r={3.5} className="rs__dot" />
          <text x={px[3] + d} y={y + 22} textAnchor="middle" className="rs__tx rs__tx--m">{t}</text>
        </g>
      ))}
    </svg>
  )
}

/** The library's categories as Compose shows them, with their families in the app's own words. */
const LIBRARY: { t: string; side: 0 | 1; y: number; items: string[] }[] = [
  { t: 'Marks', side: 0, y: 20, items: ['frame, orbit rings, camera,', 'orbit abstracted, bounds,', 'focus, selection, callouts,', 'scan and slice'] },
  { t: 'Parameters', side: 0, y: 104, items: ['any setting as a readout'] },
  { t: 'Navigation', side: 0, y: 146, items: ['steps, run timeline, bars,', 'indexes, captures'] },
  { t: 'Controls', side: 0, y: 202, items: ['dials, number controls,', 'view camera'] },
  { t: 'Evolve', side: 1, y: 20, items: ['nations, territory, chronicle,', 'relations, record, log,', 'one nation'] },
  { t: 'Quantum glyphs', side: 1, y: 90, items: ['backend path, register,', 'rotation, shots and error,', 'processing, blur, pulse', 'schedule, Atlas usage'] },
  { t: 'Data and runtime', side: 1, y: 174, items: ['readouts, data cards, figures,', 'density, runtime, tiles,', 'signed distance, voxel values,', 'level sweep, slice card, stages'] },
]

/** Fig. 8: the compose system. The object in its frame, the library around it, one run under all. */
function ComposeFig() {
  const LB = 222, RB = 418, runY = 212
  const corners = [[256, 22, 1, 1], [384, 22, -1, 1], [256, 142, 1, -1], [384, 142, -1, -1]]
  return (
    <svg viewBox="0 0 640 258" className="rs__svg" role="img" aria-label="At the centre, the object (a form of cells with a cutting plane across it) in its frame, above a box labelled one shared run: the turn and the step, the cutting plane, the clock. Around it the library's seven categories, each joined to the shared run. Left: Marks (frame, orbit rings, camera, orbit abstracted, bounds, focus, selection, callouts, scan and slice); Parameters (any setting as a readout); Navigation (steps, run timeline, bars, indexes, captures); Controls (dials, number controls, view camera). Right: Evolve (nations, territory, chronicle, relations, record, log, one nation); Quantum glyphs (backend path, register, rotation, shots and error, processing, blur, pulse schedule, Atlas usage); Data and runtime (readouts, data cards, figures, density, runtime, tiles, signed distance, voxel values, level sweep, slice card, stages).">
      <text x={320} y={12} textAnchor="middle" className="rs__tx rs__tx--dim">the object</text>
      {corners.map(([x, y, dx, dy]) => <path key={`${x}.${y}`} d={`M${x} ${y + dy * 10} V${y} H${x + dx * 10}`} className="rs__ln rs__ln--k" />)}
      {RUNS[2].cells.map((v, k) => v && <rect key={k} x={270 + (k % 10) * 10} y={32 + Math.floor(k / 10) * 10} width={9} height={9} className="rs__fill" />)}
      <line x1={262} y1={96.5} x2={378} y2={96.5} className="rs__ln rs__ln--dash" />
      <line x1={320} y1={146} x2={320} y2={172} className="rs__ln rs__ln--k" />
      <rect x={250} y={172} width={140} height={80} className="rs__box rs__box--ink" />
      <text x={320} y={192} textAnchor="middle" className="rs__tx rs__tx--h">one shared run</text>
      <text x={320} y={210} textAnchor="middle" className="rs__tx">the turn and the step</text>
      <text x={320} y={224} textAnchor="middle" className="rs__tx">the cutting plane</text>
      <text x={320} y={238} textAnchor="middle" className="rs__tx">the clock</text>
      <path d={`M${LB} 16 V${runY} H250`} className="rs__ln rs__ln--k" />
      <path d={`M${RB} 16 V${runY} H390`} className="rs__ln rs__ln--k" />
      {LIBRARY.map((c) => {
        const x = c.side ? 444 : 0, bus = c.side ? RB : LB
        return (
          <g key={c.t}>
            <text x={x} y={c.y} className="rs__tx rs__tx--h">{c.t}</text>
            {c.items.map((l, k) => <text key={l} x={x} y={c.y + 16 + k * 14} className="rs__tx">{l}</text>)}
            <line x1={c.side ? RB : 204} y1={c.y - 4} x2={c.side ? 436 : LB} y2={c.y - 4} className="rs__ln rs__ln--k" />
            <circle cx={bus} cy={c.y - 4} r={2} className="rs__dot" />
          </g>
        )
      })}
    </svg>
  )
}

/** Where the cutting plane is at t seconds, 0 (bottom) to 1 (top): eight seconds each way. */
const sweep = (t: number) => {
  const b = (t / 8) % 2
  return b > 1 ? 2 - b : b
}

/** Fig. 9: one clock. The animation's loop with the default settings, the plane, two pieces. */
function ClockFig() {
  // Model, Voxels and Mesh hold 4 s; Evolve plays 60 turns at 4 a second after it has risen; each step
  // grows up through the plane out of the one before it for its first 2.4 s (Model out of the Mesh,
  // as the loop goes round)
  const W = 2.4, T = 29.4
  const x0 = 44, x1 = 632, X = (t: number) => x0 + (t / T) * (x1 - x0)
  const segs = [{ t: 'Model', a: 0, b: 4 }, { t: 'Voxels', a: 4, b: 8 }, { t: 'Evolve', a: 8, b: 25.4 }, { t: 'Mesh', a: 25.4, b: 29.4 }]
  const top = 140, bot = 196, Y = (p: number) => bot - p * (bot - top)
  const plane = (t: number) => {
    const s = segs.find((x) => t >= x.a && t < x.a + W)
    return s ? (t - s.a) / W : sweep(t)
  }
  const pts: string[] = []
  for (let t = 0; t <= T + 1e-9; t += 0.1) pts.push(`${X(t).toFixed(1)},${Y(plane(Math.min(t, T - 1e-6))).toFixed(1)}`)
  const turn = (t: number) => Math.max(0, Math.min(60, Math.floor((t - 8 - W) * 4)))
  const lane = (t: number) => 236 - (turn(t) / 60) * 16
  let stairs = `M${X(0)} ${lane(0)}`
  for (let t = 1; t <= T; t++) stairs += ` H${X(t).toFixed(1)} V${lane(t).toFixed(1)}`
  const now = 15, a = 'url(#rs-arw-clock)'
  return (
    <svg viewBox="0 0 640 294" className="rs__svg" role="img" aria-label="A timeline of one pass of the animation with the default settings, about 29 seconds: Model 4 seconds, Voxels 4, Evolve 17.4 (it rises for 2.4 seconds, then plays sixty turns at four a second), Mesh 4, and then it loops. The first 2.4 seconds of every step are shaded: the step grows up through the cutting plane out of the one before it. Below, the cutting plane rises once from bottom to top at the start of every step, and sweeps up and down in between. Below that, two pieces: one animated, stepping up with the turns, and one holding still, a flat line. A dashed line marks one moment, which every piece reads.">
      <Arw id="rs-arw-clock" />
      <defs>
        <pattern id="rs-rise" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" className="rs__ln rs__ln--hatch" />
        </pattern>
      </defs>
      <path d={`M${x1 - 2} 40 V26 H${x0 + 2} V38`} className="rs__ln" fill="none" markerEnd={a} />
      <text x={X(21)} y={20} textAnchor="middle" className="rs__tx rs__tx--dim">the pass loops</text>
      {segs.map((s) => (
        <g key={s.t}>
          <rect x={X(s.a) + 1} y={40} width={X(s.b) - X(s.a) - 2} height={24} className="rs__box" />
          <rect x={X(s.a) + 1} y={40} width={X(s.a + W) - X(s.a) - 1} height={24} fill="url(#rs-rise)" className="rs__rise" />
          <text x={(X(s.a) + X(s.b)) / 2} y={56} textAnchor="middle" className="rs__tx rs__tx--m rs__tx--ink rs__tx--halo">{s.t}</text>
          {s.t !== 'Evolve' && <text x={(X(s.a) + X(s.b)) / 2} y={84} textAnchor="middle" className="rs__tx rs__tx--m rs__tx--dim">{s.b - s.a} s</text>}
        </g>
      ))}
      {Array.from({ length: 61 }, (_, k) => <line key={k} x1={X(8 + W + k / 4)} y1={64} x2={X(8 + W + k / 4)} y2={k % 10 ? 68 : 72} className="rs__ln" />)}
      <text x={X(17.9)} y={84} textAnchor="middle" className="rs__tx rs__tx--dim">60 turns at 4 a second</text>
      <line x1={x0} y1={98} x2={x1} y2={98} className="rs__ln" />
      {[0, 4, 8, 25.4, T].map((t) => (
        <g key={t}>
          <line x1={X(t)} y1={98} x2={X(t)} y2={102} className="rs__ln" />
          <text x={t === T ? X(t) + 4 : X(t)} y={114} textAnchor={t === T ? 'end' : 'middle'} className="rs__tx rs__tx--m rs__tx--dim">{t === T ? `${T} s` : t}</text>
        </g>
      ))}
      <text x={x0} y={132} className="rs__tx rs__tx--ink">the cutting plane</text>
      <line x1={x0} y1={top} x2={x1} y2={top} className="rs__ln rs__ln--faint" />
      <line x1={x0} y1={bot} x2={x1} y2={bot} className="rs__ln rs__ln--faint" />
      <text x={38} y={top + 4} textAnchor="end" className="rs__tx rs__tx--dim">top</text>
      <text x={38} y={bot + 4} textAnchor="end" className="rs__tx rs__tx--dim">bottom</text>
      <polyline points={pts.join(' ')} className="rs__ln rs__ln--ink" />
      <text x={X(8 + W) + 6} y={top - 4} className="rs__tx rs__tx--dim">each step rises through it</text>
      <text x={x0} y={214} className="rs__tx rs__tx--dim">a piece, animated: it moves with the clock</text>
      <path d="M24 223 V233 L32 228 Z" className="rs__fill" />
      <path d={stairs} className="rs__ln rs__ln--ink" />
      <text x={x0} y={254} className="rs__tx rs__tx--dim">a piece holding still: it keeps what it shows</text>
      <rect x={24.5} y={260.5} width={8} height={8} className="rs__ln rs__ln--k" />
      <line x1={x0} y1={264.5} x2={x1} y2={264.5} className="rs__ln rs__ln--ink" />
      <line x1={X(now)} y1={34} x2={X(now)} y2={272} className="rs__ln rs__ln--dash" />
      <circle cx={X(now)} cy={Y(plane(now))} r={3} className="rs__dot" />
      <circle cx={X(now)} cy={lane(now)} r={3} className="rs__dot" />
      <circle cx={X(now)} cy={264.5} r={3} className="rs__dot" />
      <text x={X(now)} y={288} textAnchor="middle" className="rs__tx rs__tx--ink">every piece reads this moment</text>
    </svg>
  )
}

// ── the page ───────────────────────────────────────────────────────────

/** Research: the research behind Quantum Sculptor, set as an article. */
export function ResearchPage() {
  const scroller = useRef<HTMLDivElement>(null)
  const [here, setHere] = useState(SECTIONS[0].id)

  // the contents follow the section nearest the top of the reading area
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const ids = [...SECTIONS, ...BACK].map((s) => s.id)
    const pick = () => {
      const top = root.getBoundingClientRect().top + 120
      let cur = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= top) cur = id
      }
      setHere(cur)
    }
    pick()
    root.addEventListener('scroll', pick, { passive: true })
    return () => root.removeEventListener('scroll', pick)
  }, [])

  return (
    <div className="notes rs" ref={scroller}>
      <div className="rs__page">
        <header className="rs__mast">
          <span>Quantum Sculptor · Research</span>
          <span>Working paper 01 · 5 October 2026 · draft</span>
        </header>

        <div className="rs__grid">
          <aside className="rs__margin">
            <nav className="rs__toc" aria-label="Contents">
              <span className="rs__label">Contents</span>
              <ol>
                {SECTIONS.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`} onClick={jump(s.id)} className={here === s.id ? 'is-on' : ''}><span>{s.n}</span>{s.t}</a></li>
                ))}
                {BACK.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`} onClick={jump(s.id)} className={here === s.id ? 'is-on' : ''}><span /> {s.t}</a></li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="rs__col">
            <header className="rs__head">
              <h1 className="rs__t">Handing the carving over to measurement</h1>
              <p className="rs__sub">How sixty measurements move authorship from the cut to the conditions</p>
            </header>

            <div className="rs__abs">
              <dl className="rs__kw">
                <dt className="rs__label">Keywords</dt>
                {KEYWORDS.map((k) => <dd key={k}>{k}</dd>)}
              </dl>
              <div>
                <span className="rs__label">Abstract</span>
                <p className="rs__p rs__p--abs">
                  Quantum Sculpting carves an existing 3D model by measurement. We divide the model into twelve nations,
                  one qubit each, and on each of sixty turns every nation is asked one question whose answer adds or
                  removes material. We argue that measurement does not take the author out of this process. It moves
                  authorship from the cut to the conditions: the model, the way it is divided, the metaphor of nations at
                  war, the rules, and the turn at which we stop. Two consequences follow. Each run is a latent space that
                  we can enter, by naming it, but never survey; and each print is a counterfactual record of the statue,
                  a history that never happened to it. We trace the losses the statue goes through on its way to the
                  print and add a third, measurement, to the two that Antonio Somaini describes. We then take on the
                  strongest objection, that a pseudo-random generator would make forms nobody could tell apart, and
                  answer it with the provenance every form carries. We end with a caution about the interface we built
                  to read these spaces, which promises more overview than a run can give.
                </p>
              </div>
            </div>

            <Sec {...SECTIONS[0]}>
              <p className="rs__p">
                On turn <F>turn</F> of the run we made on 5 October 2026, nation <F>nation</F> was asked whether it
                would <F>attack, defend or explore</F>. Before the measurement, its odds of answering yes
                were <F>odds</F>. The answer was <F>yes or no</F>, and so it <F>action</F>, at the statue’s{' '}
                <F>where on the body</F>, going from <F>size before</F> voxels to <F>size after</F>.<N n={1} />
              </p>
              <p className="rs__p">
                Nobody picked that answer. We wrote the question, the six things a nation may do and the rule that turns
                this answer into this movement; the answer itself came out of a quantum state simulated on our machine,
                sampled with a random number measured on the IBM chip <C>ibm_fez</C>. The statue kept the mark. Sixty
                turns of marks like it, from twelve nations at first and sixteen by the end, became the 90 mm print
                described in Section IV, and this paper asks where, in a turn like this one, the author is.
              </p>
            </Sec>

            <Sec {...SECTIONS[1]}>
              <p className="rs__p">
                Quantum Sculpting takes an existing 3D model, cuts it into voxels, divides them into nations and lets
                measurement decide what each nation does on every turn. The easy reading is that this removes the
                author: we let go, and the dice carve. We argue the opposite. Measurement does not remove the author. It
                moves authorship from the cut to the conditions, to what Kate Crawford calls “the parameters of the
                possible” (quoted in Somaini, <Pg />).
              </p>
              <p className="rs__p">
                A second claim follows from the first. If we set the conditions and measurement chooses within them,
                then each run is a space of possible histories that we enter by naming and running it, though we can
                never look over the whole of it. The print is one path through that space made solid, which makes it a
                counterfactual record of the statue: a history that never happened to it, recorded in the statue’s own
                surface.
              </p>
              <p className="rs__p">
                McLuhan describes every extension of the body as a self-amputation: a function is cut away from us and
                handed to a device, and the part that was cut goes numb (McLuhan 1964, ch. 4). Handing the cut to
                measurement is a self-amputation of this kind. The question is which part of the carving went numb and
                which part we still hold, and “chance” is too loose a word to answer it, because the chance in this work
                has three parts: rules that we wrote, random numbers measured on a chip, and a quantum state that is,
                for now, simulated on our own machine.
              </p>
              <p className="rs__p">
                The argument follows the work: measurement takes the hand out of each cut (II), our rules and their
                metaphor put it back (III), the choice of when to stop is what remains of it (IV), the objection that
                any coin would do shows where the work’s authority sits (V), and the interface that promises to show a
                run whole needs a caution of its own (VI and VII).
              </p>
            </Sec>

            <Sec {...SECTIONS[2]}>
              <p className="rs__p">
                “The ‘content’ of any medium is always another medium,” McLuhan writes (1964, ch. 1). Our chain is long.
                A statue is scanned; the scan, 500,112 faces, is voxelised into a 128³ grid with 39,816 solid cells;
                regions of the grid are written onto qubits; the qubits are measured, the measured result pushes the
                scanned surface, and the surface is printed (Fig. 1). Each link takes the one before it as its content,
                and each one keeps less of it than it was given.
              </p>
              <Fig n={1} wide caption="Quantum Sculptor, end to end. A model is voxelised, passed through one of four quantum engines, cut into a printable surface and composed for showing. Evolve (filled) is the engine this paper is about.">
                <ProgramFig />
              </Fig>
              <p className="rs__p">
                Antonio Somaini describes two losses that an object goes through on its way into a generative model: one
                when it is digitised, and another when it is compressed into vectors (<Pg />). Both happen here. The
                first is the scan and the grid: a cell of the grid records only how much of it the model fills, and
                every detail smaller than a cell is gone. The second is the step onto qubits. In Evolve a region of
                about 3,300 voxels becomes a single qubit, whose three inclinations are one direction on a
                sphere.<N n={2} />
              </p>
              <h3 className="rs__h3">The third loss</h3>
              <p className="rs__p">
                Our work adds a third loss, measurement, and it is a strange one, because it is also the only step in
                the chain that gives something back. A nation starts as a region with voxels of its own: discrete,
                countable, in one place. Written onto a qubit, it holds odds instead of an answer. Entangled with a
                neighbour, it becomes less definite still, its direction shortening and its answers drifting towards a
                coin toss, until what is definite is the pair. Twelve qubits are held as 4,096 amplitudes, and every one
                of them is a joint possibility for all twelve nations, so that no entry in the state belongs to one
                nation alone. Somaini says that latent spaces act as “matrices of potentialities” (<Pg />). Between
                preparation and measurement a run is one almost literally: a state vector, turned by matrices, holding
                nothing but potential until it is measured.
              </p>
              <p className="rs__p">
                Measurement keeps one answer out of those odds and throws the rest away. That is the loss. It also
                returns the nation to discreteness, since a yes or a no becomes a change of whole voxels, though the
                nation that comes back has moved inclinations, tended or broken ties and a border somewhere new (Fig. 2).
                The same passage happens to a single cell in the blur, which starts inside or outside the model, becomes
                a fraction when the model is voxelised, is mixed with its neighbours, and is inside or outside again
                only when the mesh is cut at a level, not always on the side where it began.
              </p>
              <Fig n={2} wide caption="Losing and regaining discreteness. A nation, or a cell, is first definite, then held as odds, then absorbed into a state it shares with its neighbours. Measurement, or the cut at a level, makes it discrete again, but not as it was.">
                <AbsorbFig />
              </Fig>
              <p className="rs__p">
                In this sense the sculpture is collective. On every turn the twelve nations are, for a moment, one state,
                and they are separated again only by being asked.
              </p>
            </Sec>

            <Sec {...SECTIONS[3]}>
              <p className="rs__p">
                Lakoff and Johnson open <span className="rs__ti">Metaphors We Live By</span> with ARGUMENT IS WAR. We attack a position, defend a
                claim, win or lose a point, and the metaphor shapes what we actually do when we argue (1980, ch. 1).
                Evolve takes a conceptual metaphor literally. Following James Wootton’s quantum procedure for map
                generation,<N n={3} /> its regions are nations and their voxels are territory, and the verbs open to them
                are attack, defend and explore. Whatever the measurements decide, they can only decide among those verbs.
              </p>
              <h3 className="rs__h3">Three inclinations, one question</h3>
              <p className="rs__p">
                Each nation is one qubit with three inclinations, to attack, to defend and to explore. They are the
                three axes of one direction on a sphere (Fig. 3), so a nation that leans fully towards attack has no lean
                left for the other two. The three questions are incompatible measurements: asking one disturbs the
                answers to the other two, so the program asks each nation one question per turn.<N n={4} /> Before the
                answer is measured, all that is known is the chance of a yes, set by how far the nation’s direction
                points along the asked axis:
              </p>
              <div className="rs__eq">p(yes) = (1 + b) / 2</div>
              <Fig n={3} caption="One nation. Its three inclinations are the axes of one direction on a sphere. When it is asked a question, the length of that direction along the asked axis (b) sets the odds of a yes.">
                <SphereFig />
              </Fig>
              <p className="rs__p">
                Neighbours are entangled, and a closer tie means a stronger gate between their qubits, θ = s · π / 2,
                where s runs from 0 to 1. Seen alone, a tightly bound nation is less sure of itself: its direction
                shortens and its odds slide towards a half. Seen as a pair, the two answers agree more often. A nation
                bound tightly to one neighbour cannot be bound as tightly to another, which is a limit of entanglement
                itself, and that limit is why each nation tends only one tie at a time. The physics motivates the rule;
                our code enforces it.<N n={5} />
              </p>
              <h3 className="rs__h3">Six marks</h3>
              <p className="rs__p">
                On every turn all nations are prepared, asked, measured and moved together (Fig. 4). The question and
                the answer together decide what a nation does, and each of the six actions leaves its own mark on the
                shape (Table 1). Afterwards inclinations and ties shift by rules we wrote: losing territory makes a
                nation want to attack, gaining it makes it want to defend, and a fight weakens a tie.
              </p>
              <Fig n={4} wide caption="One turn, sixty times. Inside the loop only the measurement is not written in advance; every other step is one of our rules. The original surface passes around the whole loop and is pushed by the result at the end.">
                <LoopFig />
              </Fig>
              <Fig n={1} kind="Table" caption="The six behaviours. Each question has one action for yes and one for no.">
                <table className="rs__tbl">
                  <thead><tr><th>Asked</th><th>Answers yes</th><th>Answers no</th></tr></thead>
                  <tbody>
                    <tr>
                      <th>Attack</th>
                      <td><b>Attack.</b> Takes the layer of its least friendly neighbour that touches it. When two nations attack each other, both front lines vanish and a crack opens.<N n={6} /></td>
                      <td><b>Flee.</b> Breaks contact with that neighbour and moves one voxel outward, until it becomes an island adrift outside.</td>
                    </tr>
                    <tr>
                      <th>Defend</th>
                      <td><b>Fortify.</b> Builds up a layer on its outer surface near the borders.</td>
                      <td><b>Split.</b> The far half becomes independent, a new nation.</td>
                    </tr>
                    <tr>
                      <th>Explore</th>
                      <td><b>Grow.</b> Fills the gaps inside its own body, then grows outward.</td>
                      <td><b>Wither.</b> Its outermost voxels fall away. When none are left, it has died out.</td>
                    </tr>
                  </tbody>
                </table>
              </Fig>
              <h3 className="rs__h3">We chose war</h3>
              <p className="rs__p">
                The cracks, walls, horns and islands in our print are marks of the metaphor as much as of measurement.
                Under a metaphor of GROWTH, a nation could only add material or shed it, and the form would swell and
                thin without ever cracking along a front. Under CONVERSATION, neighbours would ask and answer each other
                and trade voxels across a border, which would blur borders where war cuts them. The same chip, the same
                twelve qubits and the same sixty turns would carve a different statue in each case. Choosing war was our
                decision, made before any measurement, and it is the largest single decision in the piece.
              </p>
            </Sec>

            <Sec {...SECTIONS[4]}>
              <p className="rs__p">
                The piece made on 5 October 2026 started from the scan filed as <C>Aion_Louvre</C>, with the settings in
                Table 2. Each setting in it was a decision of ours, and the right-hand column says what each one does in
                the argument.
              </p>
              <Fig n={2} kind="Table" caption="The settings of this piece, and what each one is in the concept.">
                <table className="rs__tbl rs__tbl--set">
                  <thead><tr><th>Step</th><th>Setting</th><th>Value</th><th>In the concept</th></tr></thead>
                  <tbody>
                    <tr><th rowSpan={2}>Giving the form</th><td>Model</td><td className="rs__v">Aion_Louvre, 500,112 faces</td><td>A scan of a statue: the starting point that is given</td></tr>
                    <tr><td>Voxel grid</td><td className="rs__v">128³, 39,816 solid cells</td><td>The grain of the material, and the first loss</td></tr>
                    <tr><th rowSpan={4}>Evolving</th><td>Nations</td><td className="rs__v">12</td><td>12 qubits, 12 superpositions</td></tr>
                    <tr><td>Turns</td><td className="rs__v">60</td><td>60 rounds of measurement, and where we stop</td></tr>
                    <tr><td>Reach</td><td className="rs__v">4% of the grid</td><td>How far walls and horns may stand from the original surface</td></tr>
                    <tr><td>Random numbers</td><td className="rs__v">ibm_fez, 5 s</td><td>A real IBM chip and its processor time: the source of every random choice</td></tr>
                    <tr><th rowSpan={6}>Joining</th><td>Surface</td><td className="rs__v">quantum field</td><td>Keep the original surface, then let the result push it</td></tr>
                    <tr><td>Push amount</td><td className="rs__v">6 (range 0–8)</td><td>The dial between the given form and the measured change</td></tr>
                    <tr><td>Threshold</td><td className="rs__v">0.18</td><td>Which level the surface is drawn to; lower swells, higher erodes</td></tr>
                    <tr><td>Refinement</td><td className="rs__v">×2, 256³</td><td>How much of the scan’s detail survives the first loss</td></tr>
                    <tr><td>Finishing</td><td className="rs__v">close 1.5, smooth ×19</td><td>Making the form printable: small gaps closed, the mesh smoothed, all large pieces kept</td></tr>
                    <tr><td>Print height</td><td className="rs__v">90 mm</td><td>The size of the object</td></tr>
                  </tbody>
                </table>
              </Fig>
              <p className="rs__p">
                Over the sixty turns the twelve nations became sixteen through four splits, and all sixteen survived.
                There were four mutual wars and one flight off the continent, and no annexation or extinction. The solid
                voxels went from 39,816 to 53,196, with 22,784 grown and 9,404 carved away.
              </p>
              <p className="rs__p">
                The evolved grid is too coarse to print on its own and knows nothing of the scan’s surface, so we kept
                that surface, took it again on a 256³ grid and let the evolved result push it, outward where nations
                grew and inward where they were carved. How far it moves is the push amount (Fig. 5). At 0 the scan comes
                back unchanged; at 8 the form is as close as the joining allows to what the nations made on their own.
                We stopped at 6. In the 90 mm print the statue is still recognisable, while its body breaks into
                sections, walls rise along the borders, horns grow from the surface and islands drift away from it
                (Fig. 6).
              </p>
              <Fig n={5} wide caption="The push amount, from 0 to 8. At 0 the scan is unchanged; the higher it goes, the closer the form comes to what the nations made on their own. This piece stops at 6.">
                <DialFig />
              </Fig>
              <Fig n={6} caption="The printed piece, 90 mm. Image to be added.">
                <Slot label="Image · the printed piece" ratio="4 / 3" />
              </Fig>
              <h3 className="rs__h3">Where we stop</h3>
              <p className="rs__p">
                A history has no end state. Under an earlier set of rules we let one run for 400 turns, and about a
                hundred voxels were still changing hands on every turn at the end. Sixty is a number we chose, and of
                all the decisions in Table 2 it is the only one we make after watching what the measurements did. That
                is what remains of the hand: a decision about when to stop.
              </p>
            </Sec>

            <Sec {...SECTIONS[5]}>
              <p className="rs__p">
                A sceptical reader will say that this is a random-number generator with a quantum label. Seed an
                ordinary pseudo-random generator with a number we typed, run the same rules, and the result would be
                sculptures nobody could tell apart from ours. Our own figures partly concede the point. Under an earlier
                set of rules, nations bound as allies acted in step 60% of the time, against 54% when each tossed its own
                coin;<N n={7} /> the quantum correlations leave a trace in the shape, and the rules leave most of it.
                Table 3 sets out which parts of a run are measured, which are simulated and which are written.
              </p>
              <Fig n={3} kind="Table" caption="What a run of 5 October 2026 is made of.">
                <table className="rs__tbl">
                  <thead><tr><th>Part of the run</th><th>Where it comes from</th></tr></thead>
                  <tbody>
                    <tr><th>Random numbers</th><td><b>Measured</b> on <C>ibm_fez</C>, 5 s of processor time, through Moth’s <C>comet-qrng-v1</C> on Atlas<N n={8} /></td></tr>
                    <tr><th>Division into nations</th><td><b>Measured</b>: clustered by position, seeded with those numbers</td></tr>
                    <tr><th>Question per nation</th><td><b>Measured</b>: drawn with those numbers, weighted by each nation’s inclinations</td></tr>
                    <tr><th>Quantum state</th><td><b>Simulated</b> on our machine as a state vector, one qubit per nation, sixteen at most</td></tr>
                    <tr><th>Each answer</th><td><b>Both</b>: odds from the simulated state, sampled with a measured number</td></tr>
                    <tr><th>Actions, updates, ties</th><td><b>Written</b>: our rules, Section III</td></tr>
                    <tr><th>The circuit on a chip</th><td><b>Not yet run</b>: the route exists, as <C>graph-v1</C> on Atlas<N n={9} /></td></tr>
                    <tr><th>Trace of the correlations</th><td>Allies in step 60% against 54%, under earlier rules; not yet repeated</td></tr>
                  </tbody>
                </table>
              </Fig>
              <p className="rs__p">
                On the question of what the form looks like, then, the objection is right. McLuhan’s “the medium is the
                message” (1964, ch. 1) moves the question elsewhere, to what kind of object the form is. Every decision
                in our print traces back to a named chip, a measured stretch of processor time and a count of the bytes
                that arrived and the bytes that were used, all of it written into the record that sits beside the
                exported STL. A pseudo-random version would trace back to a number we typed, and its record would say
                so.
              </p>
              <p className="rs__p">
                In our W02 piece on Holbein we followed authority as it moves “out of the object and into the
                instrument.” Here it moves one step further, into the record the instrument leaves. The authority of
                this sculpture sits in its provenance, which also holds the limits of the claim: a simulated state, a
                small trace and a circuit not yet sent. Answered this way, the objection stops being a weakness to hide
                and becomes part of the argument, because the difference between our print and a seeded one is exactly
                the difference between two records.
              </p>
            </Sec>

            <Sec {...SECTIONS[6]}>
              <p className="rs__p">
                In a machine-learning model, the latent space is what the model makes of its data: each example
                compressed into far fewer numbers and placed as a point among many dimensions, where to generate is to
                move through the space and decode where one arrives. Somaini argues that a theory of images now
                “needs a theory of latent spaces” (<Pg />). A run has the same parts in miniature. Voxelising compresses;
                writing nations onto qubits vectorises; and between preparation and measurement there are only odds,
                spread over every history the rules allow.
              </p>
              <p className="rs__p">
                That spread is too large to look over. Each turn offers twelve nations three questions and two answers
                each, which is 6¹² combinations, about 2.2 billion, before any split adds a thirteenth nation. Sixty
                turns raise that to more than 10⁵⁶⁰ possible histories for a single run. We can enter such a space by
                giving it a name, since the name seeds the run and the same name leads back into the same
                history,<N n={10} /> but we can only follow one path through it at a time.
              </p>
              <p className="rs__p">
                Wolfgang Ernst’s “latent archive” describes this better than any comparison with retrieval. In such an
                archive, he writes, “algorithmic objects always come into being anew” (<Pg />). Our runs are kept as
                names and records, and the form is not stored anywhere; it comes into being again whenever a name is
                run. On 5 October we entered three such spaces, and their numbers were measured on <C>ibm_marrakesh</C>,{' '}
                <C>ibm_boston</C> and <C>ibm_fez</C> (Fig. 7).
              </p>
              <Fig n={7} wide caption="Three latent spaces from one model. Each run has its own name and its own numbers, measured on a different chip, and gives a different form. Drawn schematically; the run names are illustrative, the chips are those the runs of 5 October 2026 landed on.">
                <RunsFig />
              </Fig>
              <h3 className="rs__h3">A counterfactual record</h3>
              <p className="rs__p">
                Where analysis asks what happened, Somaini writes, generative models materialise “what could have
                happened, given the conditions that the models have captured and encoded during training” (<Pg />). Our
                print is a form of this kind. The scan records a statue that exists, and the sixty turns record a
                history that never happened to it but could have, given its shape, its division into twelve and the
                six verbs open to its parts. The pushed surface holds both in one skin: its fine detail is recovered from
                the scan, its walls and cracks come from odds and rules, and nothing on the object marks where one
                stops and the other begins.
              </p>
              <p className="rs__p">
                It would be possible to average the three runs of 5 October into one form. Hito Steyerl calls the
                images of generative models “mean images”: renderings of an average (Steyerl 2023).
                An average of our runs would be mean in that sense. It would not be closer to the statue, or more
                correct than any of the three; it would be a fourth form that no history produced. We keep runs side by
                side for that reason, each filed under its name, to be compared and returned to.
              </p>
            </Sec>

            <Sec {...SECTIONS[7]}>
              <p className="rs__p">
                We built the Lab to read these spaces (see the Appendix). It is a 3D space for exploring possible forms:
                every run in a session is filed under its name, one clock lets us scrub through a history, and every
                readout around the object shows the same moment. Roland Meyer describes the operative imaginary of such
                tools as a promise of “unlimited overview, access, and control” (<Pg />). The Lab makes that promise. It
                shows three runs side by side, smoothly, as if they were a fair sample of the space, when they are three
                paths out of more than 10⁵⁶⁰.
              </p>
              <p className="rs__p">
                Anthony Downey, writing on Trevor Paglen’s <span className="rs__ti">Adversarially Evolved Hallucinations</span>, describes how
                images produced by such systems invite us to take a machine’s conjecture for a record of the world, and
                to accept a projection from probabilities, made by a process we cannot inspect, as the way things are
                (Downey). Our forms invite the same overreading, and the word “quantum” adds an authority of its own. It
                is tempting to call a print the statue’s quantum imagination. The print is one conjecture under stated
                conditions, no more.
              </p>
              <p className="rs__p">
                The interface can work against its own promise only by keeping those conditions in view: the odds before
                every measurement, the engine that made a result, the chip the numbers came from and how many were used,
                and the word “preview” wherever a value is assumed instead of computed. The record that travels with
                every export carries the same list. Read this way, a print shows one of the things the statue could have
                become, under conditions that can be named.
              </p>
            </Sec>

            <Sec {...SECTIONS[8]}>
              <p className="rs__p">
                We made three runs on 5 October 2026 and printed the one measured on <C>ibm_fez</C>. The runs measured
                on <C>ibm_marrakesh</C> and <C>ibm_boston</C> are named, so either could be entered again, cut, pushed
                and printed. Leaving them unprinted was a choice of the same kind as stopping at turn sixty, and it is
                invisible in the object on the table. A single print cannot show the histories it was chosen from. This
                paper is partly an attempt to keep them in view.
              </p>
            </Sec>

            <Sec {...SECTIONS[9]}>
              <p className="rs__p">
                The Lab takes a model through the five steps of Fig. 1, and each step is one of the operations described
                above. Voxelise compresses a mesh into a grid of 16³ to 256³ cells. The quantum step vectorises it:
                the Quantum Blur Core writes each axis as the amplitudes of a few qubits, and Evolve writes a region as
                one qubit’s direction. Measurement samples the space, as counts with a sampling error where shots are
                taken and as a yes or a no in Evolve. Mesh draws a surface at one level, the cut at which a field becomes
                an object, and the level sweep shows one field cut at five thresholds so that the cut reads as a choice.
              </p>
              <p className="rs__p">
                Compose places pieces around the object from a library in seven categories (Fig. 8). Every piece reads
                the same run, so a readout of the push amount, the chronicle of a history, the register of a probed cell
                and the frame of the view always agree. Time works the same way: one clock walks through the model, the
                voxels, the sixty turns at four a second and the mesh, while a cutting plane sweeps across the loop
                (Fig. 9). Each piece has a motion switch, which decides whether it shows a run as a process or holds one
                measured moment still. Fig. 10 shows a single turn as the Lab draws it.
              </p>
              <Fig n={8} wide caption="The compose system. Pieces from seven categories sit around the object, and every one of them reads the same run, so the frame, a readout and a chronicle always show the same moment.">
                <ComposeFig />
              </Fig>
              <Fig n={9} wide caption="One clock. A pass through the run with the default settings: 4 seconds each for Model, Voxels and Mesh, and sixty turns of Evolve at four a second. Each step grows up through the cutting plane out of the one before it (hatched); in between, the plane sweeps up and down. Each piece is either animated or holding still.">
                <ClockFig />
              </Fig>
              <Fig n={10} caption="One turn in the Lab: nations coloured by territory, with the question, the odds and the measured answer for each. Image to be added; ideally the turn told in the Prologue.">
                <Slot label="Image · a turn in the Lab" />
              </Fig>
            </Sec>

            <p className="rs__close">
              Working paper 01 is a draft of the research behind Quantum Sculptor, written beside the Lab that makes the
              geometry, composes it and sends it out. Marks in dashed outline are still to be filled in.
            </p>

            <section className="rs__back" id="rs-notes" aria-labelledby="rs-notes-h">
              <h2 className="rs__h rs__h--back" id="rs-notes-h">Endnotes</h2>
              <ol className="rs__notes">
                <li id="rs-n1">From the turn record of the Evolve log of 5 October 2026, which stores for every nation on every turn the question asked, the odds of a yes before the measurement, the answer, the action and its size in voxels. <Back n={1} /></li>
                <li id="rs-n2">The Quantum Blur Core vectorises differently: seven qubits hold an axis of 128 cells as 128 amplitudes, and each added qubit doubles the length. On Atlas a large grid is split into tiles of at most 65,536 values, each sent as its own job. <Back n={2} /></li>
                <li id="rs-n3">Wootton treats the regions of a map as nations with one qubit each. Here the map is a body, and the regions are found by clustering the solid voxels by position. <Back n={3} /></li>
                <li id="rs-n4">The three inclinations are the X, Y and Z components of one qubit’s direction. Measuring along one axis leaves the other two undetermined, so a nation cannot be asked two questions in the same measurement. To ask, the program turns the asked axis onto the measured one first. b is the component of the qubit’s actual direction along that axis, shorter than the direction it was given whenever it is entangled. <Back n={4} /></li>
                <li id="rs-n5">We tested the alternative. When every tie was allowed to tighten at once, the agreement within any one pair was washed out by the others, and nations acted like independent coin tosses. Only a few exclusive ties let allies act together, so we wrote that limit into the rules. <Back n={5} /></li>
                <li id="rs-n6">A defending neighbour holds against one attacker and gives way to two attacking in the same turn. A neighbour with too little left is annexed whole. Only a nation that has grown past its starting size can split. <Back n={6} /></li>
                <li id="rs-n7">The rules have changed since that measurement, most of all in how ties are tended. The figures are an indication, not a result for this piece. <Back n={7} /></li>
                <li id="rs-n8">The bytes that arrived and the bytes used are counted in the record exported beside the STL. <Back n={8} /></li>
                <li id="rs-n9">The nations’ circuit, a rotation per qubit and a ZZ gate per tie, can be submitted to Atlas as <C>graph-v1</C> as it stands. We have not run it yet. <Back n={9} /></li>
                <li id="rs-n10">In Evolve the run name seeds the measurements: the same name gives the same history, and a shorter run is exactly the beginning of a longer one. <Back n={10} /></li>
              </ol>
            </section>

            <section className="rs__back" id="rs-cited" aria-labelledby="rs-cited-h">
              <h2 className="rs__h rs__h--back" id="rs-cited-h">Works cited</h2>
              <ul className="rs__cited">
                <li>Crawford, Kate. Quoted in Somaini, below.</li>
                <li>Downey, Anthony. “Uncanny Returns: Trevor Paglen and the Hallucinatory Domain of Generative AI.” <span className="rs__ti">The MIT Press Reader</span>. <Todo>date</Todo></li>
                <li>Ernst, Wolfgang. <Todo>title, publication, year, pages</Todo></li>
                <li>Lakoff, George, and Mark Johnson. 1980. <span className="rs__ti">Metaphors We Live By</span>. Chicago: University of Chicago Press.</li>
                <li>McLuhan, Marshall. 1964. <span className="rs__ti">Understanding Media: The Extensions of Man</span>. New York: McGraw-Hill.</li>
                <li>Meyer, Roland. <Todo>title, publication, year, pages</Todo></li>
                <li>Somaini, Antonio. <Todo>title</Todo>. <span className="rs__ti">October</span> <Todo>issue, year, pages</Todo></li>
                <li>Steyerl, Hito. 2023. “Mean Images.” <span className="rs__ti">New Left Review</span> 140/141.</li>
                <li>Wedge. W02, on Holbein. <Todo>title, year</Todo></li>
                <li>Wootton, James R. 2020. “A Quantum Procedure for Map Generation.” In <span className="rs__ti">2020 IEEE Conference on Games (CoG)</span>. IEEE.</li>
              </ul>
            </section>

            <section className="rs__back" id="rs-sources" aria-labelledby="rs-sources-h">
              <h2 className="rs__h rs__h--back" id="rs-sources-h">Sources</h2>
              <ul className="rs__src">
                <li>
                  <span className="rs__srcn">IBM Quantum</span>
                  Quantum processors <C>ibm_fez</C>, <C>ibm_marrakesh</C> and <C>ibm_boston</C>. The random numbers for the
                  three runs of 5 October 2026 were measured on them; the piece in Section VI used <C>ibm_fez</C>.
                </li>
                <li>
                  <span className="rs__srcn">Moth · Atlas</span>
                  Moth’s platform for quantum jobs, on real hardware or a simulator. Quantum Sculptor sends its jobs
                  through Atlas and fetches its random numbers from it.
                </li>
                <li>
                  <span className="rs__srcn">Moth · <C>comet-qrng-v1</C></span>
                  The random-number engine on Atlas: numbers measured on a quantum chip. Every random choice in an Evolve
                  history is taken from it.
                </li>
                <li>
                  <span className="rs__srcn">Moth · <C>entanglement-shader-v1</C></span>
                  The Entanglement Shader. It computed the reflectance and transmission tables, by viewing angle and film
                  phase, that the Entanglement shading reads.
                </li>
                <li>
                  <span className="rs__srcn">Moth · Quantum Blur Core</span>
                  The blur circuit: each axis of the grid written onto qubits and turned by rotations that mix
                  neighbouring cells. Gauss stands in for it with a plain blur, Emulate emulates it on the local machine,
                  and Atlas runs it as <C>blur-core-v1</C>.
                </li>
                <li>
                  <span className="rs__srcn">Source code</span>
                  The repository <C>PeiyanZou02/Quantum-Sculpting</C> on GitHub.
                </li>
              </ul>
            </section>

            <section className="rs__back" id="rs-credits" aria-labelledby="rs-credits-h">
              <h2 className="rs__h rs__h--back" id="rs-credits-h">Credits</h2>
              <dl className="rs__credits">
                <dt>Concept and research</dt><dd>Wedge</dd>
                <dt>Software</dt><dd>A local web app: a Python (Flask) service, and an interface in the browser with a 3D view (three.js)</dd>
                <dt>Quantum</dt><dd>Random numbers measured on IBM quantum chips and fetched through Moth Atlas (comet-qrng-v1); the individuals’ circuit simulated locally as a state vector; the blur run by the Quantum Blur Core, emulated locally or on Atlas; Entanglement shading from entanglement-shader-v1 tables</dd>
                <dt>Geometry</dt><dd>Voxelisation, clustering by position, signed distance fields, surface extraction, STL export</dd>
                <dt>Type</dt><dd>TWK Everett and TWK Everett Mono</dd>
              </dl>
            </section>
          </article>
        </div>
      </div>
    </div>
  )
}
