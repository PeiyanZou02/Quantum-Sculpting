// Atlas API key. Kept in the user folder by the service, never in the project.
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { QPill } from '../qs/QPill'
import { Dot } from './parts'

export function KeyDialog() {
  const st = useStore()
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [test, setTest] = useState<null | { ok: boolean; ms: number; msg?: string }>(null)
  // return focus to whatever opened the dialog (the Atlas button)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus?.()
  }, [])
  const close = () => useStore.setState({ keyOpen: false, error: null })
  const runTest = async () => {
    const t0 = performance.now()
    if (key) await st.saveKey(key)
    const ok = await st.testKey()
    setTest({ ok, ms: Math.round(performance.now() - t0), msg: ok ? undefined : useStore.getState().error ?? undefined })
  }
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="key-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="qs-label">Atlas</span>
          <span id="key-title" className="qs-title">API key</span>
          <span className="qs-body" style={{ color: 'var(--qs-ink2)' }}>
            Paste the key from your Moth account. It is kept in your user folder, never in the project, and never shown again.
          </span>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="qs-field-label">Key</span>
          <span className="qs-input" style={{ borderBottomWidth: 2 }}>
            <input autoFocus type={show ? 'text' : 'password'} value={key} autoComplete="off" spellCheck={false}
              placeholder={st.key?.set ? `saved key ends ${st.key.hint || '····'}` : 'moth_…'}
              onChange={(e) => { setKey(e.target.value.trim()); setTest(null) }}
              onKeyDown={(e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && key) st.saveKey(key).then(close) }} />
            <QPill kind="ghost" size="s" label={show ? 'Hide' : 'Show'} onClick={() => setShow(!show)} />
          </span>
          {test && (
            <span className="qs-mono" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Dot live={test.ok} /> {test.ok ? `Key valid · ${test.ms} ms` : `Rejected · ${test.msg ?? ''}`}
            </span>
          )}
        </label>
        <div className="row">
          <QPill kind={key ? 'commit' : 'disabled'} label="Save key" loading={st.busy.key} onClick={() => st.saveKey(key).then(close)} />
          <QPill kind="ghost" label="Test connection" loading={st.busy.keytest} onClick={runTest} />
          <span style={{ flex: 1 }} />
          {st.key?.set && <QPill kind="ghost" size="s" label="Remove saved key" onClick={() => { if (window.confirm('Remove the saved Atlas key from this computer?')) st.clearKey() }} />}
          <QPill kind="ghost" label="Close" onClick={close} />
        </div>
        <span className="qs-mono" style={{ lineHeight: 1.5, color: 'var(--qs-ink3)' }}>
          Stored in ~/.quantum-sculpting · sent as Authorization: Bearer to {st.key?.base?.replace(/^https?:\/\//, '') ?? 'api.mothquantum.com'}
        </span>
      </div>
    </div>
  )
}
