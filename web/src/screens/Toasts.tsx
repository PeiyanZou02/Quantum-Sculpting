// Errors surface briefly bottom-right; the full history is in the inspector log.
import { useEffect, useState } from 'react'
import { useStore } from '../store'

export function Toasts() {
  const error = useStore((s) => s.error)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!error) return
    setShown(error)
    const t = setTimeout(() => setShown(null), 6000)
    return () => clearTimeout(t)
  }, [error])
  return <div className="toasts">{shown && <div className="toast">! {shown}</div>}</div>
}
