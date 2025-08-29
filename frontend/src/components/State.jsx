export function Loading({ label = 'Loading…' }) {
  return (
    <div className="p-4 text-slate-500 text-sm">{label}</div>
  )
}

export function ErrorBox({ error }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm">{message}</div>
  )
}
