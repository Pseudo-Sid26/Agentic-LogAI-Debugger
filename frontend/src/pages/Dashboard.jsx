import { useEffect, useState } from 'react'
import { apiHealth, fetchMetrics } from '../lib/api.js'
import { Loading, ErrorBox } from '../components/State.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [health, setHealth] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState(null)
  const [minutes, setMinutes] = useState(120)
  const [interval, setInterval] = useState('5m')
  const [loading, setLoading] = useState(false)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    try {
      setLoading(true)
      setError(null)
      const [h, m] = await Promise.all([apiHealth(), fetchMetrics({ minutes, interval })])
      setHealth(h); setMetrics(m)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  if (error) return <div className="max-w-7xl mx-auto p-4"><ErrorBox error={error} /></div>
  if (!health || !metrics) return <div className="max-w-7xl mx-auto p-4"><Loading label="Loading dashboard…" /></div>

  const merged = mergeSeries(metrics)

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card title="API">
          <div className="text-sm text-slate-600">Status</div>
          <div className="text-lg font-semibold">{health.status}</div>
          <div className="text-xs text-slate-500">{new Date(health.time).toLocaleString()}</div>
        </Card>
        <Card title="Errors (last 2h)">
          <div className="text-2xl font-semibold text-red-600">{sumSeries(metrics.errors)}</div>
        </Card>
        <Card title="Warnings (last 2h)">
          <div className="text-2xl font-semibold text-amber-500">{sumSeries(metrics.warnings)}</div>
        </Card>
      </section>

      <section className="bg-white border rounded p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold">Log Levels Over Time</h2>
          <div className="flex items-center gap-2">
            <select className="border rounded px-2 py-1 text-xs" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
              {[15,30,60,120,240,480].map(m => <option key={m} value={m}>Last {m<60?`${m}m`:`${m/60}h`}</option>)}
            </select>
            <select className="border rounded px-2 py-1 text-xs" value={interval} onChange={e => setInterval(e.target.value)}>
              {['1m','2m','5m','10m','15m','30m','1h'].map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <button onClick={refresh} className="px-2.5 py-1 rounded bg-blue-600 text-white text-xs">Refresh</button>
          </div>
        </div>
        {loading && <div className="mb-2"><Loading label="Refreshing…" /></div>}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged}>
              <XAxis dataKey="ts" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="errors" stroke="#ef4444" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="warnings" stroke="#f59e0b" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="info" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}

function sumSeries(s) {
  return s.reduce((acc, [, v]) => acc + v, 0)
}

function mergeSeries(m) {
  const map = new Map()
  for (const [ts, v] of m.errors) map.set(ts, { ts, errors: v, warnings: 0, info: 0 })
  for (const [ts, v] of m.warnings) map.set(ts, { ts, errors: map.get(ts)?.errors ?? 0, warnings: v, info: map.get(ts)?.info ?? 0 })
  for (const [ts, v] of m.info) map.set(ts, { ts, errors: map.get(ts)?.errors ?? 0, warnings: map.get(ts)?.warnings ?? 0, info: v })
  return Array.from(map.values()).sort((a,b) => a.ts.localeCompare(b.ts))
}

function Card({ title, children }) {
  return (
    <div className="bg-white border rounded p-3">
      <div className="text-xs font-medium text-slate-500">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}
