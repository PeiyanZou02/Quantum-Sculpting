// Atlas API key. Kept in the user folder by the service, never in the project. A modal in the
// Carbon manner: a header with a close button, the field, and a footer of two buttons edge to edge.
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Dot } from './parts'
import { IN_BROWSER } from '../engine'
import { GET_KEY } from './Welcome'

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
  const save = () => { if (key) st.saveKey(key).then(close) }
  const runTest = async () => {
    const t0 = performance.now()
    if (key) await st.saveKey(key)
    const ok = await st.testKey()
    setTest({ ok, ms: Math.round(performance.now() - t0), msg: ok ? undefined : useStore.getState().error ?? undefined })
  }
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="kd" role="dialog" aria-modal="true" aria-labelledby="key-title">
        <header className="kd__head">
          <span className="kd__label">Atlas</span>
          <span id="key-title" className="kd__title">API key</span>
          <button className="kd__close" onClick={close} aria-label="Close" data-tip="Close" data-tip-key="Esc">×</button>
        </header>
        <div className="kd__body">
          <p className="kd__p">{IN_BROWSER
            ? 'Paste the key from your Moth account. It stays in this browser tab, goes only to Atlas, and is gone when you close the tab.'
            : 'Paste the key from your Moth account. It is kept in your user folder, never in the project, and never shown again.'}</p>
          {!st.key?.set && <a className="kd__link" href={GET_KEY} target="_blank" rel="noreferrer">No key yet? Get one from Moth ↗</a>}
          <label className="kd__field">
            <span className="kd__k">Key</span>
            <span className="kd__in">
              <input autoFocus type={show ? 'text' : 'password'} value={key} autoComplete="off" spellCheck={false}
                placeholder={st.key?.set ? `Saved key ends ${st.key.hint || '····'}` : 'moth_…'}
                onChange={(e) => { setKey(e.target.value.trim()); setTest(null) }}
                onKeyDown={(e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter') save() }} />
              <button type="button" className="kd__show" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </span>
          </label>
          {test && (
            <span className="kd__test">
              <Dot live={test.ok} /> {test.ok ? `Key valid · ${test.ms} ms` : `Rejected · ${test.msg ?? ''}`}
            </span>
          )}
          <span className="kd__note">Sent as Authorization: Bearer to {IN_BROWSER ? 'Atlas, through the relay' : st.key?.base?.replace(/^https?:\/\//, '') ?? 'api.mothquantum.com'}</span>
          {st.key?.set && (
            <button type="button" className="kd__remove" onClick={() => { if (window.confirm('Remove the saved Atlas key from this computer?')) st.clearKey() }}>Remove the saved key</button>
          )}
        </div>
        <footer className="kd__foot">
          <button className="kd__btn" disabled={st.busy.keytest} onClick={runTest}>{st.busy.keytest ? 'Testing…' : 'Test connection'}</button>
          <button className="kd__btn kd__btn--primary" disabled={!key || st.busy.key} onClick={save}>{st.busy.key ? 'Saving…' : 'Save key'}</button>
        </footer>
      </div>
    </div>
  )
}
