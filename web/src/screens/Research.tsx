// Research: the research behind the project, set as a journal article. A masthead, the title block, the
// abstract with its keywords, numbered sections with figures and tables, endnotes, the sources the work
// is built on, and credits. The contents in the margin follow the reading position.
// Everything here is plain JSX, figures included, so the text can be revised in place.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import './research.css'

const SECTIONS = [
  { id: 'rs-1', n: 'I', t: 'A sculptor that is asked, not told' },
  { id: 'rs-2', n: 'II', t: 'The individual as a superposition' },
  { id: 'rs-3', n: 'III', t: 'Sixty rounds of measurement' },
  { id: 'rs-4', n: 'IV', t: 'The original surface, pushed' },
  { id: 'rs-5', n: 'V', t: 'The system and the measurement' },
  { id: 'rs-6', n: 'VI', t: 'One history: 5 October 2026' },
  { id: 'rs-7', n: 'VII', t: 'What the quantum part does, and what it does not yet do' },
  { id: 'rs-8', n: 'VIII', t: 'Entering a latent space' },
  { id: 'rs-9', n: 'IX', t: 'The interface as a way of seeing' },
]
const BACK = [
  { id: 'rs-notes', t: 'Endnotes' },
  { id: 'rs-sources', t: 'Sources' },
  { id: 'rs-credits', t: 'Credits' },
]
const KEYWORDS = ['quantum sculpting', 'superposition', 'entanglement', 'measurement', 'voxels', 'latent space', 'counterfactual form', 'quantum randomness', 'authorship', 'interface']

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
      <h2 className="rs__h" id={`${id}-h`}><span className="rs__hn">{n}.</span>{t}</h2>
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

/** Fig. 2: one individual's inclinations as a direction on the Bloch sphere. */
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

/** Fig. 3: the loop. Only "measure" is not a written rule; the original surface runs underneath. */
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

/** Fig. 4: the push amount, the dial between the given form and the measured change. */
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

/** Fig. 8: discreteness lost and regained, for Evolve's individuals and for the blur's cells. */
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

/** Fig. 9: the compose system. The object in its frame, the library around it, one run under all. */
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

/** Fig. 10: one clock. The animation's loop with the default settings, the plane, two pieces. */
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
              <p className="rs__sub">Twelve qubits, sixty measurements and the latent space of a run</p>
            </header>

            <div className="rs__abs">
              <dl className="rs__kw">
                <dt className="rs__label">Keywords</dt>
                {KEYWORDS.map((k) => <dd key={k}>{k}</dd>)}
              </dl>
              <div>
                <span className="rs__label">Abstract</span>
                <p className="rs__p rs__p--abs">
                  This paper describes Quantum Sculpting, a design-research project in which an existing 3D model is
                  carved by quantum measurement instead of by a hand. The model is cut into voxels and divided into
                  twelve individuals. Each individual is one qubit, and neighbours are entangled according to how close
                  they are. On every turn each individual is asked one question, the answers are measured together, and
                  each answer becomes an action that adds or removes material. After sixty turns the evolved result
                  pushes the surface of the original model, and the two become one printable form. The paper sets out
                  the concept, the rules, the part the quantum model plays, the random numbers measured on IBM quantum
                  chips, and how authorship is divided between a system of rules and the measurements. It then reads
                  each run, after Antonio Somaini, as a latent space: a compressed, vectorised field of possibilities
                  that measurement turns into one form, different for every run. The sculpture shows what could have
                  happened to a form rather than what did, and the interface is offered as an instrument for reading
                  that space without taking its conjecture for the truth.
                </p>
              </div>
            </div>

            <Sec {...SECTIONS[0]}>
              <p className="rs__p">
                Carving is usually one person making decisions about one block of material. Each cut is a choice, and the
                finished piece is the sum of those choices. This project starts from a different question: what does a
                sculpture become when nobody makes those choices? Not a person, and not an AI that has learned to carve,
                but one measurement after another.
              </p>
              <p className="rs__p">
                What matters here is less the quantum computer as a faster tool than the quantum measurement as a
                decision that nobody can make in advance. Before a qubit is measured it has odds, not an answer. The
                answer appears at the moment it is asked. In this project that moment takes the place of the hand.
              </p>
              <p className="rs__p">
                Only the basis of the design is given: an existing model, the way it is divided into individuals, and
                what those individuals are able to do. Then the hand lets go. On that basis the measurements carve new
                iterations and textures of their own. At the end the evolved result returns to the original model, and
                the two become one sculpture, made jointly by a system of rules and by measurement.
              </p>
              <p className="rs__p">
                All of this happens in a program, Quantum Sculptor, which takes a model through five steps (Fig. 1). A
                model, one of the built-in shapes or a mesh of one’s own, is voxelised into a grid. The grid passes
                through one of four quantum engines. Three of them blur it: Gauss with a plain approximation, Emulate and
                Atlas with a quantum circuit, the Quantum Blur Core, emulated locally or run on Moth’s Atlas platform. The
                fourth, Evolve, is the one this text is mostly about. A printable surface is then cut from the result, and a last step composes
                the object with readouts and animation, for showing and for export.
              </p>
              <Fig n={1} wide caption="Quantum Sculptor, end to end. A model is voxelised, passed through one of four quantum engines, cut into a printable surface and composed for showing. Evolve (filled) is the engine this text is mostly about.">
                <ProgramFig />
              </Fig>
              <p className="rs__p">
                The text follows the order of the work. Section II describes the individuals and why each one is a
                superposition. Section III describes the turns and what each answer does to the shape. Section IV
                describes how the result is joined with the original surface. Sections V and VI look at authorship and
                at one finished piece, and Section VII gives an honest account of what the quantum part contributes.
                Section VIII reads each run as a latent space, and Section IX looks at the interface as an instrument
                for reading it.
              </p>
            </Sec>

            <Sec {...SECTIONS[1]}>
              <h3 className="rs__h3">Dividing the material</h3>
              <p className="rs__p">
                The starting point is a 3D model. It is cut into a grid of voxels (in the piece described below, a
                128³ grid with about 40,000 solid cells) and the solid cells are grouped by position into twelve regions.
                Each region is an individual. In the interface they are called “nations”, and their voxels are their
                territory.<N n={1} />
              </p>
              <p className="rs__p">
                There is no single carver. The material itself is divided into many individuals, each of them acts, and
                the sculpture is the shape left by what happens between them.
              </p>

              <h3 className="rs__h3">One question, two answers</h3>
              <p className="rs__p">
                Each individual is one qubit. It has three inclinations: to attack, to defend and to explore. These are
                not three separate dials. They are the three axes of one direction on a sphere (Fig. 2), so they cannot
                all be at their maximum: an individual that leans fully towards attack has no lean left for the other two.
              </p>
              <p className="rs__p">
                On each turn the individual is asked only one of the three questions. Quantum mechanics allows only one
                to be asked at a time. Before the answer is measured, the only thing known is the chance of a yes, which
                depends on how far the individual’s direction points along the axis that was asked:<N n={2} />
              </p>
              <div className="rs__eq">p(yes) = (1 + b) / 2</div>
              <p className="rs__p">
                If b is 1 the answer is certainly yes; if b is 0 it is a coin toss; if b is −1 it is certainly no. The
                answer itself is not known to anyone until it is measured.
              </p>
              <Fig n={2} caption="One individual. Its three inclinations are the axes of one direction on a sphere. When it is asked a question, the length of that direction along the asked axis (b) sets the odds of a yes.">
                <SphereFig />
              </Fig>

              <h3 className="rs__h3">Relationships as entanglement</h3>
              <p className="rs__p">
                Neighbouring individuals are entangled. The closer their relationship, the stronger the entangling step
                between their two qubits:
              </p>
              <div className="rs__eq">θ = s · π / 2</div>
              <p className="rs__p">
                where s, from 0 to 1, is the strength of the relationship and θ is the angle of the gate that links them.
                This has two effects that pull in opposite directions. Seen alone, a heavily entangled individual is less
                sure of its own mind: its direction becomes shorter, b moves towards 0, and its answers come closer to a
                coin toss. Seen as a pair, the two answers agree more often. A relationship buys acting in step, and the
                price is being less certain alone.
              </p>
              <p className="rs__p">
                An individual bound tightly to one neighbour cannot be bound as tightly to another. For this reason each
                individual cultivates only one relationship at a time.<N n={3} /> This limit is not a written rule. It
                comes with the model.
              </p>
            </Sec>

            <Sec {...SECTIONS[2]}>
              <p className="rs__p">
                A history is a series of turns. On every turn all individuals are prepared, asked, measured and moved
                together, and what they do changes their inclinations and relationships for the next turn (Fig. 3).
                Sixty turns are sixty rounds of measurement. A different number of turns stops the same history at a
                different point.
              </p>
              <Fig n={3} wide caption="The process. Inside the loop, only the measurement is not written in advance: which question is asked and what the answer is both come from measurement. Every other step is a rule. The original surface passes around the whole loop and is pushed by the result at the end.">
                <LoopFig />
              </Fig>

              <h3 className="rs__h3">Six behaviours, six marks</h3>
              <p className="rs__p">
                What an individual is asked, and whether it answers yes or no, decides what it does on that turn. Each of
                the six behaviours leaves its own mark on the shape (Table 1).
              </p>
              <Fig n={1} kind="Table" caption="The six behaviours. Each question has one action for yes and one for no.">
                <table className="rs__tbl">
                  <thead><tr><th>Asked</th><th>Answers yes</th><th>Answers no</th></tr></thead>
                  <tbody>
                    <tr>
                      <th>Attack</th>
                      <td><b>Attack.</b> Takes the layer of its least friendly neighbour that touches it. When two individuals attack each other, both front lines vanish and a crack opens.<N n={4} /></td>
                      <td><b>Flee.</b> Breaks contact with that neighbour and moves one voxel outward, until it becomes an island adrift outside.</td>
                    </tr>
                    <tr>
                      <th>Defend</th>
                      <td><b>Fortify.</b> Builds up a layer on its outer surface near the borders.</td>
                      <td><b>Split.</b> The far half becomes independent, a new individual.</td>
                    </tr>
                    <tr>
                      <th>Explore</th>
                      <td><b>Grow.</b> Fills the gaps inside its own body, then grows outward.</td>
                      <td><b>Wither.</b> Its outermost voxels fall away. When none are left, it has died out.</td>
                    </tr>
                  </tbody>
                </table>
              </Fig>

              <h3 className="rs__h3">How inclinations change</h3>
              <p className="rs__p">
                After acting, each individual’s inclinations and relationships move. Losing territory makes it want to
                attack; gaining territory makes it want to defend; a question it was just asked becomes less pressing
                for a while. A fight weakens a tie. Each individual tends only its closest relationship with a neighbour
                it has not fought, and a relationship that nobody tends slowly fades.
              </p>
              <p className="rs__p">
                Out of these few rules come alliances, fallings-out, joint breakthroughs, annexations, independence,
                flight and extinction. None of these events is written anywhere as an event. They are names for patterns
                that appear when the rules meet the measurements. A history starts with 12 individuals and runs for 60
                turns by default; at most 16 can be alive at once, at most 24 can appear in total, and a history can run
                for up to 300 turns.
              </p>

              <h3 className="rs__h3">It does not end by itself</h3>
              <p className="rs__p">
                There is no state in which the history settles. Left to run under an earlier set of rules, about a
                hundred voxels were still changing hands every turn after 400 turns. So the end is not found; it is
                chosen. Which turn to stop at is one of the few decisions left outside the measurement.
              </p>
            </Sec>

            <Sec {...SECTIONS[3]}>
              <p className="rs__p">
                The evolved shape does not become the sculpture directly. Voxels are coarse, and the history knows
                nothing about the detail of the surface it started from. So the surface of the original model is kept,
                taken again on a finer grid (256³), and the evolved result pushes it: outward where material was
                gained, inward where it was carved away.
              </p>
              <p className="rs__p">
                Three settings decide how this happens. The push amount sets how far the surface moves towards the
                evolved result. The threshold sets which level of the result the surface is drawn to: a lower value
                swells the form, a higher value erodes it. The reach sets how far walls and horns may stand from the
                original surface. The final form therefore holds both the shape that was given and the change that was
                measured.
              </p>
              <Fig n={4} wide caption="The push amount, from 0 to 8. At 0 the model is unchanged; the higher it goes, the closer the form comes to what the qubits make on their own. This piece stops at 6.">
                <DialFig />
              </Fig>
              <p className="rs__p">
                A last set of steps makes the form printable: small gaps are closed, the mesh is smoothed, and every
                large piece is kept, including islands that drifted away from the body.
              </p>
            </Sec>

            <Sec {...SECTIONS[4]}>
              <p className="rs__p">
                If the measurements make every decision, who is the author? Not a person in the usual sense. The work is
                closer to co-creation than to a commission: it is given no target shape, and it does not carve towards
                anyone’s taste. Authorship is divided between a system and the measurements that pass through it.
              </p>
              <p className="rs__p">
                The system is the basis: the original model, how it is divided into individuals, the behaviours
                available to them and the rules that turn an answer into an action. The measurements supply every
                decision: which individual does what to whom, on which turn. Added up, those decisions are a new version
                of the form and a surface texture that nobody designed and nobody could have known in advance.
              </p>
              <p className="rs__p">
                The push amount in Fig. 4 is the dial between the given form and the measured change. Because there is
                no target, there is no carving it right or wrong. Every new pool of random numbers gives the same model a
                new iteration. What is left outside the measurement, once the rules are written, is the choice of which
                turn to stop at and which piece to keep.
              </p>
            </Sec>

            <Sec {...SECTIONS[5]}>
              <p className="rs__p">
                The piece described here was made on 5 October 2026 from a scan of a statue, with the settings in Table
                2. These settings, together with the rules in Section III, are everything that was given. The rest was
                decided by measurement.
              </p>
              <Fig n={2} kind="Table" caption="The settings of this piece, and what each one is in the concept.">
                <table className="rs__tbl rs__tbl--set">
                  <thead><tr><th>Step</th><th>Setting</th><th>Value</th><th>In the concept</th></tr></thead>
                  <tbody>
                    <tr><th rowSpan={2}>Giving the form</th><td>Model</td><td className="rs__v">Aion_Louvre, 500,112 faces</td><td>A scan of a statue: the starting point that is given</td></tr>
                    <tr><td>Voxel grid</td><td className="rs__v">128³, about 40,000 solid cells</td><td>The grain of the material</td></tr>
                    <tr><th rowSpan={4}>Evolving</th><td>Individuals</td><td className="rs__v">12</td><td>12 qubits, 12 superpositions</td></tr>
                    <tr><td>Turns</td><td className="rs__v">60</td><td>60 rounds of measurement</td></tr>
                    <tr><td>Reach</td><td className="rs__v">4% of the grid</td><td>How far walls and horns may stand from the original surface</td></tr>
                    <tr><td>Random numbers</td><td className="rs__v">ibm_fez, 5 s</td><td>A real IBM chip and its processor time: the source of every random choice</td></tr>
                    <tr><th rowSpan={6}>Joining</th><td>Surface</td><td className="rs__v">quantum field</td><td>Keep the original surface, then let the quantum field push it towards the evolved result</td></tr>
                    <tr><td>Push amount</td><td className="rs__v">6 (range 0–8)</td><td>The dial between the given form and the measured change</td></tr>
                    <tr><td>Threshold</td><td className="rs__v">0.18</td><td>Which level the surface is drawn to; lower swells, higher erodes</td></tr>
                    <tr><td>Refinement</td><td className="rs__v">×2, 256³</td><td>How fine the original detail is kept: the surface is taken again on a finer grid</td></tr>
                    <tr><td>Finishing</td><td className="rs__v">close 1.5, smooth ×19</td><td>Making the form printable: small gaps closed, the mesh smoothed, all large pieces kept</td></tr>
                    <tr><td>Print height</td><td className="rs__v">90 mm</td><td>The size of the object</td></tr>
                  </tbody>
                </table>
              </Fig>

              <h3 className="rs__h3">What happened</h3>
              <p className="rs__p">
                Over sixty turns the twelve individuals became sixteen through four splits, and all of them survived to
                the end. There were four mutual wars, and one individual fled the continent. There was no annexation and
                no extinction. The solid voxels went from 39,816 to 53,196: 22,784 were grown and 9,404 were carved away.
              </p>
              <p className="rs__p">
                In the finished form the original statue is still recognisable, but the body breaks into sections, walls
                rise along the borders, horns grow from the surface, islands drift away and some pieces merge into larger
                ones. The printed piece is 90 mm tall.
              </p>
              <Fig n={5} caption="The printed piece, 90 mm. Image to be added.">
                <Slot label="Image · the printed piece" ratio="4 / 3" />
              </Fig>

              <h3 className="rs__h3">A record of how it came to be</h3>
              <p className="rs__p">
                Each history leaves two things besides the object. The first is the process: voxels coloured by
                individual that can be played back turn by turn, with a panel that shows, for each individual on each
                turn, the question it was asked, its odds of a yes before the measurement, the answer that was measured
                and what it did. Next to this are a graph of the relationships and a chronicle of the whole history.
              </p>
              <p className="rs__p">
                The second is provenance. Next to the exported STL is a record of every parameter, of which device and
                which chip the random numbers came from, and of how many bytes arrived and how many were used.
              </p>
              <Fig n={6} caption="One turn in the Lab: individuals coloured by territory, with the question, the odds and the measured answer for each. Image to be added.">
                <Slot label="Image · a turn in the Lab" />
              </Fig>
            </Sec>

            <Sec {...SECTIONS[6]}>
              <p className="rs__p">
                It would be easy to claim too much for the quantum part, so it is worth stating plainly what it does.
                It provides two things: a model in which a relationship can be more definite than the individuals in it,
                and randomness from a real chip.
              </p>
              <h3 className="rs__h3">The model</h3>
              <p className="rs__p">
                Each individual is one qubit, its inclination is the qubit’s direction, and a relationship is the
                entanglement between neighbouring qubits. The behaviour described in Section II, where a tight bond makes
                each individual less certain alone but more in step with its partner, and where one bond limits the
                others, follows from this model. It did not have to be written as a rule.
              </p>
              <h3 className="rs__h3">The randomness</h3>
              <p className="rs__p">
                Everything random in a history (how the model is divided, what is asked each turn, what each
                measurement gives) is taken from random numbers measured on an IBM quantum chip and fetched through
                Moth’s Atlas platform.<N n={5} /> The three runs on 5 October 2026 landed on <C>ibm_marrakesh</C>,{' '}
                <C>ibm_boston</C> and <C>ibm_fez</C>; this piece used <C>ibm_fez</C>.
              </p>
              <h3 className="rs__h3">What is not done yet</h3>
              <p className="rs__p">
                The quantum state of the individuals is currently simulated on the local machine, as a state vector with
                one qubit per individual and sixteen at most. What comes from the real chip is the dice. The same circuit
                could be sent to a real chip as it is, but that step has not been taken.
              </p>
              <p className="rs__p">
                The trace that the quantum correlations leave in the result has also been measured. Under an earlier set
                of rules, allies acted in step 60% of the time, against 54% when each tossed its own coin. The
                correlations are real but small; the final shape comes mostly from the rules. That comparison has not yet
                been repeated under the current rules.<N n={6} />
              </p>
            </Sec>

            <Sec {...SECTIONS[7]}>
              <p className="rs__p">
                Antonio Somaini argues that “a current theory of images, visual culture, and contemporary artistic
                practices needs a theory of latent spaces.” In a machine-learning model, the latent space is what the
                model makes of the data it was trained on. Each example is compressed into far fewer numbers than it
                began with and placed as a point, a vector, in a space of many dimensions, where things that are alike
                lie close together. To generate is to move through that space and decode the point one arrives at.
                “Compression and vectorization are equally important,” Somaini writes, and neither is there to sort the
                world into labels and classes. Their purpose, in his words, is “to generate latent spaces that act as
                matrices of potentialities.”
              </p>
              <p className="rs__p">
                Quantum Sculptor is not a neural network, and it has been trained on nothing. But a run has the same
                parts in miniature, and reading it this way says something about what the sculpture is.
              </p>

              <h3 className="rs__h3">A run as a latent space</h3>
              <p className="rs__p">
                Voxelising is a compression. The statue in Section VI arrives as 500,112 faces and leaves as about 40,000
                solid cells on a 128³ grid, each recording only how much of it the model fills. Writing the grid onto
                qubits is a vectorisation. In the Quantum Blur Core each axis of the grid is written onto qubits, seven
                of them for an axis of 128 cells, so that the values become amplitudes;<N n={7} /> in Evolve each region
                of the body becomes a single qubit, whose three inclinations are one direction on a sphere. Between
                preparation and measurement there is no form yet, only odds spread over every form the rules allow. That
                spread is the run’s latent space, and it is a matrix of potentialities almost literally: a state vector,
                turned by matrices, holding nothing but potential until it is measured.
              </p>
              <p className="rs__p">
                A run is entered rather than built. Its randomness is measured on a real chip and fetched through Moth’s
                Atlas, and its name seeds it, so the same name leads back into the same space and a new name opens
                another.<N n={8} /> Before it generates anything, a run also retrieves. The arrangement resembles
                retrieval-augmented generation, in which a language model does not answer from its training alone but
                first fetches documents from outside and writes with them in view. A run fetches two things from outside
                before it produces a form: the model it is given and a pool of numbers measured on a chip. What it can
                generate is bounded by both.
              </p>

              <h3 className="rs__h3">What could have happened</h3>
              <p className="rs__p">
                Where analysis asks what happened, Somaini writes, generative models materialise “what could have
                happened, given the conditions that the models have captured and encoded during training.” A sculpture
                from Quantum Sculptor is a form of this kind. The scan of the statue records something that exists. The
                sixty turns do not. They are a history that never happened to the statue but could have, given its shape,
                the way it was divided and the six behaviours open to its parts. The print is less a document of that
                history than one of its possible outcomes made solid: a counterfactual form.
              </p>
              <p className="rs__p">
                The pushed surface makes the line between record and counterfactual hard to find. Its fine detail is
                recovered from the scan; its walls, horns, cracks and islands come from nothing but odds and rules.
                Nothing in the finished piece marks where reconstruction stops and generation begins. Like an image whose
                missing parts have been predicted rather than recovered, it holds both in one surface.
              </p>
              <p className="rs__p">
                Kate Crawford, quoted by Somaini, writes: “All the content in latent space comes from training data, so
                that data becomes the Weltanschauung of the model: It sets the parameters of the possible.” A run has no
                training data, but it has an equivalent. The given model, the grid, the twelve individuals, the six
                behaviours and the number of turns are its whole view of the world, and nothing in the result falls
                outside them. Measurement chooses within the possible; it never widens it. This is also where the part
                of the work that is not measurement sits: not in carving, but in setting the parameters of the possible
                and in choosing where to stop.
              </p>

              <h3 className="rs__h3">No single space</h3>
              <p className="rs__p">
                There is not one latent space shared by every model, Somaini observes, but many, each compressing
                different data and doing a different job inside its model; as his text puts it, “there is no unified
                latent space of culture.” Each run of Quantum Sculptor is likewise a space of its own. The model may be
                the same, but the name differs, the pool of numbers differs, and on 5 October 2026 the chip differed too:
                the three runs that day landed on <C>ibm_marrakesh</C>, <C>ibm_boston</C> and <C>ibm_fez</C> (Fig. 7).
                Each run gives the same model a different history and a different form, because what a space can
                generate depends on what went into it.
              </p>
              <p className="rs__p">
                No run is the true form of the model, and none is a draft of another. Nor would an average of them be
                more correct: the space of possible histories has no centre to settle on, any more than a history itself
                settles. Each run is one selective world, as particular as an individual. That is why the interface keeps
                runs side by side: every processing run in a session is filed under its name, so that it can be compared
                with the others and returned to.
              </p>
              <Fig n={7} wide caption="Many latent spaces. The same model, entered three times: each run has its own name and its own numbers, measured on a different chip, and gives a different form. Drawn schematically; the run names are illustrative, the chips are those the runs of 5 October 2026 landed on.">
                <RunsFig />
              </Fig>

              <h3 className="rs__h3">Losing discreteness</h3>
              <p className="rs__p">
                An individual, in the ordinary sense, is what cannot be divided: discrete, countable, in one place. Each
                of the twelve individuals in a history starts like that, as a region of the body with voxels of its own.
                As a qubit it is something else. Before it is measured it holds odds, not an answer, like the cat in
                Schrödinger’s thought experiment, alive and dead at once until the box is opened. Entangled with a
                neighbour, it becomes less definite still: its direction shortens, its answers drift towards a coin toss,
                and what becomes definite is the pair rather than either of its members. In the state vector there is no
                entry that belongs to one individual alone. Twelve qubits are held as 4,096 amplitudes, and each
                amplitude is a joint possibility for all twelve. The individual has been absorbed into a shared
                statistical geometry.
              </p>
              <p className="rs__p">
                Measurement gives the discreteness back. Each individual answers yes or no and acts, and its territory
                changes by whole voxels. But it does not come back as it was: its inclinations have moved, its
                relationships have been tended or broken, and its border lies somewhere new (Fig. 8). The same passage
                happens at the scale of the cell. A cell starts inside or outside the model, becomes a fraction when the
                model is voxelised, is mixed with its neighbours by the blur, and becomes inside or outside again only
                when the mesh is cut at a level, and not necessarily on the side where it began.
              </p>
              <Fig n={8} wide caption="Losing and regaining discreteness. An individual, or a cell, is first definite, then held as odds, then absorbed into a state it shares with its neighbours. Measurement, or the cut at a level, makes it discrete again, but not as it was.">
                <AbsorbFig />
              </Fig>
              <p className="rs__p">
                In this sense the sculpture is collective. It is not the sum of twelve decisions taken apart from one
                another. It is what remains when twelve individuals have been, for a moment on every turn, one thing, and
                have then been separated again by being asked.
              </p>
            </Sec>

            <Sec {...SECTIONS[8]}>
              <p className="rs__p">
                A latent space cannot be looked at directly. It can only be sampled, projected and read, and every
                reading leaves something out. The interface of Quantum Sculptor is built as an instrument for that
                reading, and its five steps (Fig. 1) can be taken as the operations of Section VIII:
              </p>
              <ol className="rs__list">
                <li><b>Compression.</b> Voxelise reduces a mesh to a grid of 16³ to 256³ cells, each keeping only how much of it the model fills.</li>
                <li><b>Vectorisation.</b> The Quantum Blur Core writes each axis of the grid as the amplitudes of a few qubits; Evolve writes a whole region of the body as one qubit’s direction.</li>
                <li><b>Measurement.</b> The space is sampled. Where shots are taken the result comes back as counts with a sampling error, and in Evolve every question comes back as a yes or a no.</li>
                <li><b>The cut.</b> Mesh draws a surface at one level of the result, the point at which a continuous field becomes a discrete object.</li>
                <li><b>Reading.</b> Compose places instruments around the object, so that what each step kept and lost can be seen.</li>
              </ol>
              <p className="rs__p">
                The interface tries to say what each step loses. The register shows which qubit mixes which cells; the
                glyph for shots and error shows the sampling error falling as the number of shots grows; the level sweep
                shows one field cut at five thresholds, so that the cut reads as a choice rather than a fact.
              </p>

              <h3 className="rs__h3">Pieces around the object</h3>
              <p className="rs__p">
                The last step, Compose, places pieces around the object from a library in seven categories (Fig. 9):
                marks, parameters, navigation, Evolve, quantum glyphs, data and runtime, and controls. They are not
                decoration. Every piece reads the same run: the turn, the step on screen, the slice under the cutting
                plane. A readout of the push amount, the chronicle of a history, the register of a probed cell and the
                frame around the view are four views of one state, and so they agree. A composition is closer to a plate
                in a scientific atlas than to a poster: several instruments, each turned on the same specimen from a
                different side.
              </p>
              <Fig n={9} wide caption="The compose system. Pieces from seven categories sit around the object, and every one of them reads the same run, so the frame, a readout and a chronicle always show the same moment.">
                <ComposeFig />
              </Fig>

              <h3 className="rs__h3">One clock</h3>
              <p className="rs__p">
                Time is treated the same way. The animation runs on one clock, and the clock walks through the run
                (Fig. 10): the model, its voxels, the result rising out of the voxels on a plane, the sixty turns of
                Evolve at four a second, and the mesh. A cutting plane sweeps up and down across the whole loop. Because
                every piece reads the clock, scrubbing it shows the same moment everywhere at once. Each piece also has a
                motion switch. Animated, it moves with the clock; holding still, it keeps what it shows while everything
                else plays. The switch is small, but it is the choice between showing a run as a process and showing a
                single measured moment of it.
              </p>
              <Fig n={10} wide caption="One clock. A pass through the run with the default settings: 4 seconds each for Model, Voxels and Mesh, and sixty turns of Evolve at four a second. Each step grows up through the cutting plane out of the one before it (hatched); in between, the plane sweeps up and down. Each piece is either animated or holding still.">
                <ClockFig />
              </Fig>

              <h3 className="rs__h3">Conjecture, not record</h3>
              <p className="rs__p">
                The more convincing such an instrument is, the more it needs a caution. There is a familiar worry about
                image-making systems: that by showing the world as a network infers it, they teach people to take a
                guess for a fact, and to treat what is only a projection from probabilities, made by a process nobody
                can inspect, as the way things are. A form that has been measured on a quantum chip invites the same
                overreading, perhaps more, because the word “quantum” lends it authority. It is tempting to call it
                quantum imagination, or an electronic hallucination of the statue. Both phrases claim too much. The form
                is one conjecture under stated conditions.
              </p>
              <p className="rs__p">
                The interface, and the record that travels with every export, are meant to keep those conditions in
                view: the odds before every measurement, the engine that made the result, the chip the numbers came from
                and how many of them were used, and the word “preview” wherever a value is assumed rather than computed.
                The account in Section VII belongs here too: the quantum state of the individuals is still simulated, and
                the correlations leave only a small trace in the shape. An honest reading includes both.
              </p>
              <p className="rs__p">
                Read in this way, Quantum Sculptor does not show what a statue is. It shows one of the things it could
                have become, under conditions that can be named, in a space that is entered, read and then left. Another
                name opens another space. None of them is the statue, and none of them is wrong.
              </p>
            </Sec>

            <p className="rs__close">
              This text is a working draft of the research behind Quantum Sculptor, written beside the Lab that makes
              the geometry, composes it and sends it out. The platforms and the code it is built on are listed under
              Sources.
            </p>

            <section className="rs__back" id="rs-notes" aria-labelledby="rs-notes-h">
              <h2 className="rs__h rs__h--back" id="rs-notes-h">Endnotes</h2>
              <ol className="rs__notes">
                <li id="rs-n1">The name, and the idea of treating regions of a map as nations with one qubit each, follow James Wootton’s quantum procedure for map generation. Here the map is a body, and the regions are found by clustering the solid voxels by position. <Back n={1} /></li>
                <li id="rs-n2">To ask a question, the asked axis is turned onto the measured axis before measuring. b is the component of the qubit’s actual direction along that axis, which is shorter than the direction it was given whenever it is entangled with others. <Back n={2} /></li>
                <li id="rs-n3">This was tested. When every relationship was allowed to tighten at the same time, the agreement between any one pair was washed out by the others, and the individuals acted like independent coin tosses. Only a few exclusive relationships let allies actually act together. <Back n={3} /></li>
                <li id="rs-n4">A defending neighbour holds against one attacker and gives way to two attacking in the same turn. A neighbour with too little left is annexed whole. Only an individual that has grown past its starting size can split. <Back n={4} /></li>
                <li id="rs-n5">The random numbers come from <C>comet-qrng-v1</C>, Moth’s random-number engine on Atlas (see Sources). This piece used 5 seconds of processor time on <C>ibm_fez</C>. <Back n={5} /></li>
                <li id="rs-n6">The rules have changed since that measurement, most notably in how relationships are tended. The figures are kept here as an indication, not as a result for this piece. <Back n={6} /></li>
                <li id="rs-n7">Seven qubits hold an axis of 128 cells as 128 amplitudes, and eight hold 256: each added qubit doubles the length. The lowest qubit swaps neighbouring cells, each one above it mixes blocks twice as long, and the highest mirrors the whole axis. On Atlas a large grid is split into tiles of at most 65,536 values, each sent as its own job. <Back n={7} /></li>
                <li id="rs-n8">In Evolve the run name seeds the measurements: the same name gives the same history, and a shorter run is exactly the beginning of a longer one. <Back n={8} /></li>
              </ol>
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
                <dt>Concept and research</dt><dd>Moth</dd>
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
