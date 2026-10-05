// API key: a scrim over the screen, with a dotted leader from the top-bar status pill.
import { useState } from 'react'
import { useStore } from '../store'
import { QPill } from '../qs/QPill'
import { Corners, Dot } from './parts'

export function KeyDialog() {
  const st = useStore()
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [test, setTest] = useState<null | { ok: boolean; ms: number; msg?: string }>(null)
  const close = () => useStore.setState({ keyOpen: false, error: null })

  const runTest = async () => {
    const t0 = performance.now()
    if (key) await st.saveKey(key)
    const ok = await st.testKey()
    setTest({ ok, ms: Math.round(performance.now() - t0), msg: ok ? undefined : useStore.getState().error ?? undefined })
  }

  const masked = key ? (show ? key : `${key.slice(0, 5)}${'•'.repeat(Math.max(0, key.length - 9))}${key.slice(-4)}`) : ''
  return (
    <>
      <div onClick={close} style={{ position: 'absolute', left: 0, right: 0, top: 88, bottom: 0, background: 'var(--qs-scrim)' }} />
      <svg width="560" height="260" viewBox="0 0 560 260" style={{ position: 'absolute', left: 1220, top: 56, overflow: 'visible', pointerEvents: 'none' }}>
        <polyline points="550,4 550,40 20,40 20,244" fill="none" stroke="var(--qs-ink)" strokeDasharray="1 3" />
        <circle cx="550" cy="4" r="2.5" fill="var(--qs-ink)" />
      </svg>
      <div style={{ position: 'absolute', left: 680, top: 300, width: 560, height: 480 }}>
        <Corners w={560} h={480} size={20} />
        <div style={{ position: 'absolute', left: 40, top: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="qs-label">ATLAS</span>
            <span className="qs-title">API key</span>
            <span style={{ font: '400 14px/1.4 var(--qs-sans)', color: 'var(--qs-ink2)' }}>
              Paste the key from your Moth account. It is kept in your user folder, never in the project, so it is not committed or synced.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>Key</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 7, borderBottom: '2px solid var(--qs-ink)' }}>
              <input
                autoFocus
                value={show ? key : masked}
                placeholder={st.key?.set ? `saved key ends ${st.key.hint || '····'}` : 'paste your key'}
                onChange={(e) => { if (show || !key) setKey(e.target.value.trim()); setTest(null) }}
                onPaste={(e) => { e.preventDefault(); setKey(e.clipboardData.getData('text').trim()); setTest(null) }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close()
                  if (e.key === 'Enter' && key) st.saveKey(key).then(close)
                  if (e.key === 'Backspace' && !show) { e.preventDefault(); setKey('') }
                }}
                style={{ all: 'unset', flex: 1, font: '400 14px/1 var(--qs-mono)', letterSpacing: '.02em' }}
              />
              <QPill kind="ghost" size="s" label={show ? 'Hide' : 'Show'} onClick={() => setShow(!show)} />
            </div>
            {test && (
              <span className="qs-mono" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dot live={test.ok} /> {test.ok ? `Key valid · ${test.ms} ms` : `Key rejected · ${test.msg ?? ''}`}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <QPill kind={key ? 'commit' : 'disabled'} label="Save key" loading={st.busy.key} onClick={() => st.saveKey(key).then(close)} />
            <QPill kind="faint" label="Test connection" loading={st.busy.keytest} onClick={runTest} />
            <QPill kind="ghost" label="Cancel" onClick={close} />
            {st.key?.set && <QPill kind="ghost" label="Remove key" onClick={() => st.clearKey()} />}
          </div>
          <span className="qs-mono" style={{ lineHeight: 1.5, color: 'var(--qs-ink3)' }}>
            Stored in ~/.quantum-sculpting (%USERPROFILE%\.quantum-sculpting on Windows)<br />
            Sent as Authorization: Bearer to {st.key?.base?.replace(/^https?:\/\//, '') ?? 'api.mothquantum.com/api/v1'}
          </span>
        </div>
      </div>
    </>
  )
}
