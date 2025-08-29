import { useEffect, useState } from 'react'
import { fetchMetrics } from '../lib/api.js'
import { Loading, ErrorBox } from '../components/State.jsx'

export default function Metrics() {
  const [minutes, setMinutes] = useState(240)
  const [interval, setInterval] = useState('5m')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const m = await fetchMetrics({ minutes, interval })
      setData(m)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="bg-white border rounded p-3 flex flex-col gap-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className="border rounded px-2 py-1 text-sm" type="number" min={1} max={7*24*60} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
          <select className="border rounded px-2 py-1 text-sm" value={interval} onChange={e => setInterval(e.target.value)}>
            {['1m','2m','5m','10m','15m','30m','1h'].map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <button onClick={load} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">Refresh</button>
        </div>
        {loading && <Loading label="Loading metrics…" />}
        {error && <ErrorBox error={error} />}
      </div>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SeriesCard title="Errors" series={data.errors} color="text-red-600" />
          <SeriesCard title="Warnings" series={data.warnings} color="text-amber-600" />
          <SeriesCard title="Info" series={data.info} color="text-blue-600" />
        </div>
      )}
    </div>
  )
}

function SeriesCard({ title, series, color }) {
  const total = series.reduce((a, [,v]) => a + v, 0)
  return (
    <div className="bg-white border rounded p-3">
      <div className={`text-sm font-semibold ${color}`}>{title}</div>
      <div className="text-xs text-slate-500">Total: {total}</div>
      <ul className="mt-2 text-xs max-h-[60vh] overflow-auto">
        {series.map(([ts, v]) => (
          <li key={ts} className="flex items-center justify-between border-b py-1">
            <span>{new Date(ts).toLocaleString()}</span>
            <span className="font-mono">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
