// Errors surface briefly bottom-right; the full history is in the inspector log.
import { useEffect, useState } from 'react'
import { useStore } from '../store'

export function Toasts() {
  const error = useStore((s) => s.error)
  const [shown, setShown] = useState(error)
  // a new error shows at once; the effect hides it after 6 s
  const [prev, setPrev] = useState(error)
  if (prev !== error) {
    setPrev(error)
    if (error) setShown(error)
  }
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setShown(null), 6000)
    return () => clearTimeout(t)
  }, [error])
  return <div className="toasts">{shown && <div className="toast">! {shown}</div>}</div>
}
