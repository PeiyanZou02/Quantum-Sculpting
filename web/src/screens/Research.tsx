// Research: the research behind the project, set as a journal article. A masthead, the title block,
// keywords and abstract in the margin and the column, numbered sections with figures and tables,
// endnotes and works cited. The contents in the margin follow the reading position.
// The text is Peiyan's to revise; everything here is plain JSX so it can be edited in place.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import './research.css'

const SECTIONS = [
  { id: 'rs-1', n: 'I', t: 'A sculptor that is asked, not told' },
  { id: 'rs-2', n: 'II', t: 'The individual as a superposition' },
  { id: 'rs-3', n: 'III', t: 'Sixty rounds of measurement' },
  { id: 'rs-4', n: 'IV', t: 'The original surface, pushed' },
  { id: 'rs-5', n: 'V', t: 'Two authors' },
  { id: 'rs-6', n: 'VI', t: 'One history: 5 October 2026' },
  { id: 'rs-7', n: 'VII', t: 'What the quantum part does, and what it does not yet do' },
  { id: 'rs-8', n: 'VIII', t: 'Against a target' },
]
const BACK = [
  { id: 'rs-notes', t: 'Endnotes' },
  { id: 'rs-cited', t: 'Works cited' },
  { id: 'rs-credits', t: 'Credits' },
]
const KEYWORDS = ['quantum sculpting', 'superposition', 'entanglement', 'measurement', 'voxels', 'co-authorship', 'process', 'quantum randomness']

/** A reference to endnote `n`; the note links back. */
function N({ n }: { n: number }) {
  return <sup className="rs__ref"><a id={`rs-r${n}`} href={`#rs-n${n}`} onClick={jump(`rs-n${n}`)}>{n}</a></sup>
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
    <figure className={'rs__fig' + (wide ? ' rs__fig--wide' : '')}>
      <div className="rs__figb">{children}</div>
      <figcaption className="rs__cap"><span className="rs__capn">{kind} {n}</span>{caption}</figcaption>
    </figure>
  )
}

/** An empty frame where an image is still to come. */
function Slot({ label, ratio = '16 / 9' }: { label: string; ratio?: string }) {
  return <div className="rs__slot" style={{ aspectRatio: ratio }}><span>{label}</span></div>
}

// ── figures ────────────────────────────────────────────────────────────

/** Fig. 1: one individual's inclinations as a direction on the Bloch sphere. */
function SphereFig() {
  const c = 110, r = 78
  return (
    <svg viewBox="0 0 560 220" className="rs__svg" role="img" aria-label="A sphere with three axes: attack, defend and explore. One direction points between them; its shadow on the asked axis sets the odds of a yes.">
      <circle cx={c} cy={c} r={r} className="rs__ln" />
      <ellipse cx={c} cy={c} rx={r} ry={r * 0.3} className="rs__ln rs__ln--faint" />
      <line x1={c} y1={c} x2={c} y2={c - r - 12} className="rs__ln" />
      <line x1={c} y1={c} x2={c + r + 14} y2={c} className="rs__ln" />
      <line x1={c} y1={c} x2={c - 52} y2={c + 44} className="rs__ln" />
      <text x={c + 6} y={c - r - 6} className="rs__tx">explore · Z</text>
      <text x={c + r + 4} y={c - 8} className="rs__tx">defend · Y</text>
      <text x={c - 92} y={c + 62} className="rs__tx">attack · X</text>
      <line x1={c} y1={c} x2={c + 40} y2={c - 54} className="rs__ln rs__ln--ink" />
      <circle cx={c + 40} cy={c - 54} r={3.5} className="rs__dot" />
      <line x1={c + 40} y1={c - 54} x2={c} y2={c - 54} className="rs__ln rs__ln--dash" />
      <circle cx={c} cy={c - 54} r={2.5} className="rs__dot" />
      <text x={c - 8} y={c - 50} textAnchor="end" className="rs__tx rs__tx--ink">b</text>
      <g transform="translate(320 34)">
        <text className="rs__tx rs__tx--ink" y={0}>asked: explore</text>
        <text className="rs__tx" y={22}>b = length of the direction</text>
        <text className="rs__tx" y={38}>along the asked axis</text>
        <text className="rs__tx" y={66}>b = 1   always yes</text>
        <text className="rs__tx" y={82}>b = 0   a coin toss</text>
        <text className="rs__tx" y={98}>b = −1  always no</text>
        <text className="rs__tx" y={126}>entangled: the direction is</text>
        <text className="rs__tx" y={142}>shorter, b moves toward 0</text>
      </g>
    </svg>
  )
}

/** Fig. 2: the loop. Only "measure" is not written by me; the original surface runs underneath. */
function LoopFig() {
  const steps = ['prepare', 'ask', 'measure', 'act', 'update']
  const x0 = 150, w = 62, gap = 10
  return (
    <svg viewBox="0 0 640 196" className="rs__svg" role="img" aria-label="The process: model, divide, then a loop of prepare, ask, measure, act and update repeated sixty times, then join and print. The original surface runs from the model to the join.">
      <defs>
        <marker id="rs-arw" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="rs__fill" />
        </marker>
      </defs>
      <rect x={4} y={44} width={58} height={30} className="rs__box" /><text x={33} y={63} textAnchor="middle" className="rs__tx">model</text>
      <rect x={74} y={44} width={62} height={30} className="rs__box" /><text x={105} y={63} textAnchor="middle" className="rs__tx">divide</text>
      <line x1={62} y1={59} x2={72} y2={59} className="rs__ln" markerEnd="url(#rs-arw)" />
      <line x1={136} y1={59} x2={x0 - 2} y2={59} className="rs__ln" markerEnd="url(#rs-arw)" />
      {steps.map((s, i) => {
        const x = x0 + i * (w + gap), on = s === 'measure'
        return (
          <g key={s}>
            <rect x={x} y={44} width={w} height={30} className={on ? 'rs__box rs__box--on' : 'rs__box'} />
            <text x={x + w / 2} y={63} textAnchor="middle" className={on ? 'rs__tx rs__tx--on' : 'rs__tx'}>{s}</text>
            {i < steps.length - 1 && <line x1={x + w} y1={59} x2={x + w + gap - 1} y2={59} className="rs__ln" markerEnd="url(#rs-arw)" />}
          </g>
        )
      })}
      <path d={`M${x0 + 4 * (w + gap) + w / 2} 44 V22 H${x0 + w / 2} V42`} className="rs__ln" fill="none" markerEnd="url(#rs-arw)" />
      <text x={x0 + 2 * (w + gap) + w / 2} y={16} textAnchor="middle" className="rs__tx">× 60 turns</text>
      <line x1={x0 + 5 * (w + gap) - gap} y1={59} x2={512} y2={59} className="rs__ln" markerEnd="url(#rs-arw)" />
      <rect x={514} y={44} width={56} height={30} className="rs__box" /><text x={542} y={63} textAnchor="middle" className="rs__tx">join</text>
      <line x1={570} y1={59} x2={580} y2={59} className="rs__ln" markerEnd="url(#rs-arw)" />
      <rect x={582} y={44} width={54} height={30} className="rs__box" /><text x={609} y={63} textAnchor="middle" className="rs__tx">print</text>
      <path d="M33 74 V112 H542 V76" className="rs__ln rs__ln--ink" fill="none" markerEnd="url(#rs-arw)" />
      <text x={290} y={128} textAnchor="middle" className="rs__tx rs__tx--ink">the original surface, kept with its detail</text>
      <rect x={x0} y={152} width={12} height={12} className="rs__box rs__box--on" />
      <text x={x0 + 20} y={162} className="rs__tx">decided by measurement</text>
      <rect x={x0 + 200} y={152} width={12} height={12} className="rs__box" />
      <text x={x0 + 220} y={162} className="rs__tx">a rule I wrote</text>
    </svg>
  )
}

/** Fig. 3: the push amount, the dial between the two authors. */
function DialFig() {
  const x0 = 40, x1 = 600, at = (v: number) => x0 + (v / 8) * (x1 - x0)
  return (
    <svg viewBox="0 0 640 110" className="rs__svg" role="img" aria-label="A scale from 0 to 8. At 0 the model is unchanged; at 8 the form is closest to what the qubits make alone. This piece stops at 6.">
      <line x1={x0} y1={50} x2={x1} y2={50} className="rs__ln" />
      {Array.from({ length: 9 }, (_, v) => (
        <g key={v}>
          <line x1={at(v)} y1={44} x2={at(v)} y2={56} className="rs__ln" />
          <text x={at(v)} y={74} textAnchor="middle" className="rs__tx">{v}</text>
        </g>
      ))}
      <line x1={x0} y1={50} x2={at(6)} y2={50} className="rs__ln rs__ln--thick" />
      <circle cx={at(6)} cy={50} r={6} className="rs__dot" />
      <text x={at(6)} y={30} textAnchor="middle" className="rs__tx rs__tx--ink">this piece: 6</text>
      <text x={x0} y={98} className="rs__tx">the model as I gave it</text>
      <text x={x1} y={98} textAnchor="end" className="rs__tx">what the qubits make alone</text>
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
              <p className="rs__by">Peiyan Zou<span className="rs__dim"> · with Ray</span></p>
              <h1 className="rs__t">Handing the carving over to measurement</h1>
              <p className="rs__sub">A sculpture made by a human and twelve qubits</p>
            </header>

            <div className="rs__abs">
              <dl className="rs__kw">
                <dt className="rs__label">Keywords</dt>
                {KEYWORDS.map((k) => <dd key={k}>{k}</dd>)}
              </dl>
              <div>
                <span className="rs__label">Abstract</span>
                <p className="rs__p rs__p--abs">
                  This text describes Quantum Sculpting, a design-research project in which an existing 3D model is carved
                  by quantum measurement instead of by a person. The model is cut into voxels and divided into twelve
                  individuals. Each individual is one qubit, and neighbours are entangled according to how close they are.
                  On every turn each individual is asked one question, the answers are measured together, and each answer
                  becomes an action that adds or removes material. After sixty turns the evolved result pushes the surface
                  of the original model, and the two become one printable form. The text sets out the concept, the rules,
                  the part the quantum model plays, the random numbers taken from IBM quantum chips, and how authorship is
                  divided between the designer and the measurements. It ends with what the quantum part does and does not
                  yet do, and with a comparison to onformative’s AI Sculpting.
                </p>
              </div>
            </div>

            <blockquote className="rs__epi">
              <p>“steering the process, but not the outcome”</p>
              <footer>onformative, on AI Sculpting (2022)</footer>
            </blockquote>

            <Sec {...SECTIONS[0]}>
              <p className="rs__p">
                Carving is usually one person making decisions about one block of material. Each cut is a choice, and the
                finished piece is the sum of those choices. This project starts from a different question: what does a
                sculpture become when nobody makes those choices? Not a person, and not an AI that has learned to carve,
                but one measurement after another.
              </p>
              <p className="rs__p">
                What interests me here is less the quantum computer as a faster tool than the quantum measurement as a
                decision that nobody can make in advance. Before a qubit is measured it has odds, not an answer. The
                answer appears at the moment it is asked. In this project that moment takes the place of the hand.
              </p>
              <p className="rs__p">
                I give only the basis of the design: an existing model, the way it is divided into individuals, and what
                those individuals are able to do. Then I let go. On that basis the measurements carve new iterations and
                textures of their own. At the end the evolved result returns to the original model, and the two become
                one sculpture, made jointly by a human and qubits.
              </p>
              <p className="rs__p">
                The text follows the order of the work. Section II describes the individuals and why each one is a
                superposition. Section III describes the turns and what each answer does to the shape. Section IV
                describes how the result is joined with the original surface. Sections V and VI look at authorship and
                at one finished piece. Section VII is an honest account of what the quantum part contributes, and
                Section VIII places the project next to the work that gave it its frame.
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
                not three separate dials. They are the three axes of one direction on a sphere (Fig. 1), so they cannot
                all be at their maximum: an individual that leans fully toward attack has no lean left for the other two.
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
              <Fig n={1} caption="One individual. Its three inclinations are the axes of one direction on a sphere. When it is asked a question, the length of that direction along the asked axis (b) sets the odds of a yes.">
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
                sure of its own mind: its direction becomes shorter, b moves toward 0, and its answers come closer to a
                coin toss. Seen as a pair, the two answers agree more often. A relationship buys acting in step, and the
                price is being less certain alone.
              </p>
              <p className="rs__p">
                An individual bound tightly to one neighbour cannot be bound as tightly to another. For this reason each
                individual cultivates only one relationship at a time.<N n={3} /> This limit is not a rule I wrote. It
                comes with the model.
              </p>
            </Sec>

            <Sec {...SECTIONS[2]}>
              <p className="rs__p">
                A history is a series of turns. On every turn all individuals are prepared, asked, measured and moved
                together, and what they do changes their inclinations and relationships for the next turn (Fig. 2).
                Sixty turns are sixty rounds of measurement. A different number of turns stops the same history at a
                different point.
              </p>
              <Fig n={2} wide caption="The process. Inside the loop, only the measurement is not mine to decide: which question is asked and what the answer is both come from measurement. Every other step is a rule. The original surface passes around the whole loop and is pushed by the result at the end.">
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
                chosen. Which turn to stop at is one of the few decisions that remain mine.
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
                Three settings decide how this happens. The push amount sets how far the surface moves toward the
                evolved result. The threshold sets which level of the result the surface is drawn to: a lower value
                swells the form, a higher value erodes it. The reach sets how far walls and horns may stand from the
                original surface. The final form therefore holds both the shape the human gave and the change the qubits
                gave.
              </p>
              <Fig n={3} wide caption="The push amount, from 0 to 8. At 0 the model is unchanged; the higher it goes, the closer the form comes to what the qubits make on their own. This piece stops at 6.">
                <DialFig />
              </Fig>
              <p className="rs__p">
                A last set of steps makes the form printable: small gaps are closed, the mesh is smoothed, and every
                large piece is kept, including islands that drifted away from the body.
              </p>
            </Sec>

            <Sec {...SECTIONS[4]}>
              <p className="rs__p">
                If the measurements make every decision, who is the author? I would describe the work as co-creation, not
                as a commission. I gave it no target shape, and it does not carve my way.
              </p>
              <p className="rs__p">
                What I give is the basis: the original model, how it is divided into individuals, and the behaviours
                available to them. What the measurements give is every decision: which individual does what to whom, on
                which turn. Added up, those decisions are a new version of the form and a surface texture that I did not
                design and could not have known in advance.
              </p>
              <p className="rs__p">
                The push amount in Fig. 3 is the dial between these two authors. Because there is no target, there is no
                carving it right or wrong. Every new pool of random numbers gives the same model a new iteration. My part
                after the rules is to decide which turn to stop at and which piece to keep.
              </p>
            </Sec>

            <Sec {...SECTIONS[5]}>
              <p className="rs__p">
                The piece described here was made on 5 October 2026 from a scan of a statue, with the settings in Table
                2. These settings, together with the rules in Section III, are everything I gave. The rest was decided
                by measurement.
              </p>
              <Fig n={2} kind="Table" caption="The settings of this piece, and what each one is in the concept.">
                <table className="rs__tbl rs__tbl--set">
                  <thead><tr><th>Step</th><th>Setting</th><th>Value</th><th>In the concept</th></tr></thead>
                  <tbody>
                    <tr><th rowSpan={2}>Giving the form</th><td>Model</td><td>Aion_Louvre, a scan of a statue, 500,112 faces</td><td>The starting point the human gives</td></tr>
                    <tr><td>Voxel grid</td><td>128³, about 40,000 solid cells</td><td>The grain of the material</td></tr>
                    <tr><th rowSpan={4}>Evolving</th><td>Individuals</td><td>12</td><td>12 qubits, 12 superpositions</td></tr>
                    <tr><td>Turns</td><td>60</td><td>60 rounds of measurement</td></tr>
                    <tr><td>Reach</td><td>4% of the grid</td><td>How far walls and horns may stand from the original surface</td></tr>
                    <tr><td>Random numbers</td><td>A real IBM chip, ibm_fez, 5 s of processor time</td><td>The source of every random choice</td></tr>
                    <tr><th rowSpan={6}>Joining</th><td>Surface</td><td>The quantum field pushes the surface toward the evolved result</td><td>Keep the original surface, then push it</td></tr>
                    <tr><td>Push amount</td><td>6 (range 0–8)</td><td>The dial between the two authors</td></tr>
                    <tr><td>Threshold</td><td>0.18</td><td>Which level the surface is drawn to; lower swells, higher erodes</td></tr>
                    <tr><td>Refinement</td><td>×2, surface taken on a 256³ grid</td><td>How fine the original detail is kept</td></tr>
                    <tr><td>Finishing</td><td>Close gaps 1.5, 19 smoothing passes, keep all large pieces</td><td>Making the form printable</td></tr>
                    <tr><td>Print height</td><td>90 mm</td><td>The size of the object</td></tr>
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
              <Fig n={4} caption="The printed piece, 90 mm. Image to be added.">
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
              <Fig n={5} caption="One turn in the Lab: individuals coloured by territory, with the question, the odds and the measured answer for each. Image to be added.">
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
                others, follows from this model. I did not have to write it as a rule.
              </p>
              <h3 className="rs__h3">The randomness</h3>
              <p className="rs__p">
                Everything random in a history (how the model is divided, what is asked each turn, what each
                measurement gives) is taken from random numbers measured on an IBM quantum chip and fetched through
                Moth’s Atlas platform.<N n={5} /> The three runs on 5 October 2026 landed on ibm_marrakesh, ibm_boston and
                ibm_fez; this piece used ibm_fez.
              </p>
              <h3 className="rs__h3">What is not done yet</h3>
              <p className="rs__p">
                The quantum state of the individuals is currently simulated on my own machine, as a state vector with one
                qubit per individual and sixteen at most. What comes from the real chip is the dice. The same circuit
                could be sent to a real chip as it is, but that step has not been taken.
              </p>
              <p className="rs__p">
                I have also measured how much trace the quantum correlations leave in the result. Under an earlier set of
                rules, allies acted in step 60% of the time, against 54% when each tossed its own coin. The correlations
                are real but small; the final shape comes mostly from the rules. That comparison has not yet been repeated
                under the current rules.<N n={6} />
              </p>
            </Sec>

            <Sec {...SECTIONS[7]}>
              <p className="rs__p">
                The frame for this project came from AI Sculpting by onformative (2022): set up an environment, tools and
                rules, let go, and show the process itself. The two projects share that frame and differ almost
                everywhere else (Table 3).
              </p>
              <Fig n={3} kind="Table" caption="AI Sculpting and Quantum Sculpting compared.">
                <table className="rs__tbl">
                  <thead><tr><th /><th>AI Sculpting</th><th>Quantum Sculpting</th></tr></thead>
                  <tbody>
                    <tr><th>Starting point</th><td>A cube</td><td>An existing model</td></tr>
                    <tr><th>Who carves</th><td>One reinforcement-learning agent</td><td>A dozen individuals, no single carver</td></tr>
                    <tr><th>Driven by</th><td>Reward and penalty, toward efficiency</td><td>Measurement; no reward</td></tr>
                    <tr><th>Target shape</th><td>Given in advance</td><td>None</td></tr>
                    <tr><th>What it can do</th><td>Where to go, whether to remove the voxels around it, which tool to use</td><td>Attack, fortify, grow, and the opposite of each</td></tr>
                    <tr><th>Does it learn</th><td>It improves through trial and error</td><td>No; every turn is measured afresh</td></tr>
                    <tr><th>The human’s role</th><td>Sets the tools, rules and rewards, then selects from the results</td><td>Gives the model, the individuals and the behaviours, then decides which turn to stop at</td></tr>
                  </tbody>
                </table>
              </Fig>
              <p className="rs__p">Three things are borrowed directly.</p>
              <ol className="rs__list">
                <li><b>Letting go.</b> onformative describe their position as “steering the process, but not the outcome”. The same holds here: I write the rules, not the result.</li>
                <li><b>Letting the process leave traces.</b> Each of their tools leaves its own trace on the surface. Here each behaviour leaves its own mark, and the surface of the sculpture is the record of its history.</li>
                <li><b>Seeing through the machine’s eyes.</b> They show the agent’s confidence, its rewards and its path. Here the odds before each measurement, the question asked and the answer measured are shown.</li>
              </ol>
              <p className="rs__p">
                The difference is the target. The agent in AI Sculpting has a shape given in advance and approaches it
                through reward and penalty. Here there is no target shape. What comes out is not an approximation of a
                goal but a new iteration on top of a design, one that neither of its two authors could have made alone.
              </p>
            </Sec>

            <p className="rs__close">
              This text is a working draft of the research behind Quantum Sculptor, written beside the Lab that makes
              the geometry, composes it and sends it out. The code is at PeiyanZou02/Quantum-Sculpting.
            </p>

            <section className="rs__back" id="rs-notes" aria-labelledby="rs-notes-h">
              <h2 className="rs__h rs__h--back" id="rs-notes-h">Endnotes</h2>
              <ol className="rs__notes">
                <li id="rs-n1">The name and the idea of treating regions of a map as nations with one qubit each follow Wootton (2020). Here the map is a body, and the regions are found by clustering the solid voxels by position. <a href="#rs-r1" onClick={jump('rs-r1')} aria-label="Back to the text">↩</a></li>
                <li id="rs-n2">To ask a question, the asked axis is turned onto the measured axis before measuring. b is the component of the qubit’s actual direction along that axis, which is shorter than the direction it was given whenever it is entangled with others. <a href="#rs-r2" onClick={jump('rs-r2')} aria-label="Back to the text">↩</a></li>
                <li id="rs-n3">This was tested. When every relationship was allowed to tighten at the same time, the agreement between any one pair was washed out by the others, and the individuals acted like independent coin tosses. Only a few exclusive relationships let allies actually act together. <a href="#rs-r3" onClick={jump('rs-r3')} aria-label="Back to the text">↩</a></li>
                <li id="rs-n4">A defending neighbour holds against one attacker and gives way to two attacking in the same turn. A neighbour with too little left is annexed whole. Only an individual that has grown past its starting size can split. <a href="#rs-r4" onClick={jump('rs-r4')} aria-label="Back to the text">↩</a></li>
                <li id="rs-n5">The random numbers come from Moth Atlas’s comet-qrng-v1 engine. This piece used 5 seconds of processor time on ibm_fez. <a href="#rs-r5" onClick={jump('rs-r5')} aria-label="Back to the text">↩</a></li>
                <li id="rs-n6">The rules have changed since that measurement, most notably in how relationships are tended. The figures are kept here as an indication, not as a result for this piece. <a href="#rs-r6" onClick={jump('rs-r6')} aria-label="Back to the text">↩</a></li>
              </ol>
            </section>

            <section className="rs__back" id="rs-cited" aria-labelledby="rs-cited-h">
              <h2 className="rs__h rs__h--back" id="rs-cited-h">Works cited</h2>
              <ul className="rs__cited">
                <li>IBM Quantum. 2026. Devices ibm_fez, ibm_marrakesh and ibm_boston.</li>
                <li>Moth. 2026. Atlas, comet-qrng-v1 engine.</li>
                <li>onformative. 2022. AI Sculpting. Artwork.</li>
                <li>Wootton, James R. 2020. “A Quantum Procedure for Map Generation.” In 2020 IEEE Conference on Games (CoG). IEEE.</li>
                <li>Zou, Peiyan. 2026. Quantum-Sculpting. Source code. GitHub, PeiyanZou02/Quantum-Sculpting.</li>
              </ul>
            </section>

            <section className="rs__back" id="rs-credits" aria-labelledby="rs-credits-h">
              <h2 className="rs__h rs__h--back" id="rs-credits-h">Credits</h2>
              <dl className="rs__credits">
                <dt>Concept and research</dt><dd>Peiyan Zou</dd>
                <dt>Collaborator</dt><dd>Ray</dd>
                <dt>Roles</dt><dd className="rs__dim">To be added</dd>
                <dt>Form</dt><dd>A local web app: a Python (Flask) service and a 3D preview in the browser (three.js)</dd>
                <dt>Quantum</dt><dd>Random numbers from IBM quantum chips through Moth Atlas; the individuals’ circuit simulated locally as a state vector</dd>
                <dt>Geometry</dt><dd>Voxelisation, clustering by position, signed distance fields, surface extraction, STL export</dd>
              </dl>
            </section>
          </article>
        </div>
      </div>
    </div>
  )
}
