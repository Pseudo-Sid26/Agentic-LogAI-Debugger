import { useEffect, useMemo, useState } from 'react'
import { fetchLogs, getFileSource, uploadLog } from '../lib/api.js'
import { Loading, ErrorBox } from '../components/State.jsx'

export default function Logs() {
  const [query, setQuery] = useState('{job="simulated_system"}')
  const [minutes, setMinutes] = useState(120)
  const [limit, setLimit] = useState(500)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fileInfo, setFileInfo] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [source, setSource] = useState(() => localStorage.getItem('data_source') || 'auto')
  const [textFilter, setTextFilter] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshSec, setRefreshSec] = useState(15)
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem('saved_queries') || '[]') } catch { return [] }
  })

  function saveCurrentQuery() {
    const next = Array.from(new Set([`${query}|${minutes}|${limit}|${source}`, ...saved])).slice(0, 8)
    setSaved(next)
    localStorage.setItem('saved_queries', JSON.stringify(next))
  }

  function loadSaved(s) {
    const [q, m, l, src] = s.split('|')
    setQuery(q); setMinutes(Number(m)); setLimit(Number(l)); setSource(src || 'auto')
  }

  const grouped = useMemo(() => groupByLevel(items ?? []), [items])

  async function refreshFileInfo() {
    try {
      const info = await getFileSource()
      setFileInfo(info)
    } catch {
      // ignore
    }
  }

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetchLogs({ query, minutes, limit, source })
      setItems(res.items)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  async function onUpload(e) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      setUploading(true)
      setError(null)
  const res = await uploadLog(f)
  const hint = res?.matched_lines > 0 ? `parsed ~${res.matched_lines}/${res.sampled_lines} lines` : 'file saved'
  setUploadMsg(`Uploaded ${f.name} (${Math.round(f.size/1024)} KB) — ${hint}`)
      await refreshFileInfo()
      await load()
    } catch (e) {
      setError(e)
    } finally {
      setUploading(false)
      e.target.value = ''
  setTimeout(() => setUploadMsg(''), 4000)
    }
  }

  useEffect(() => {
    load()
    refreshFileInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => load(), Math.max(3, refreshSec) * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshSec, query, minutes, limit, source])

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="bg-white border rounded p-3 flex flex-col gap-2">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input className="border rounded px-2 py-1 text-sm col-span-2" value={query} onChange={e => setQuery(e.target.value)} />
          <input className="border rounded px-2 py-1 text-sm" type="number" min={1} max={1440} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
          <input className="border rounded px-2 py-1 text-sm" type="number" min={1} max={5000} value={limit} onChange={e => setLimit(Number(e.target.value))} />
          <select className="border rounded px-2 py-1 text-sm" value={source} onChange={e => { setSource(e.target.value); localStorage.setItem('data_source', e.target.value) }}>
            {['auto','file','loki'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="border rounded px-2 py-1 text-sm" placeholder="filter text…" value={textFilter} onChange={e => setTextFilter(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={load} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">Run</button>
          <button onClick={saveCurrentQuery} className="px-3 py-1.5 rounded border text-sm">Save</button>
          {saved.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {saved.map((s, i) => (
                <button key={i} onClick={() => loadSaved(s)} className="px-2 py-1 text-xs border rounded">
                  {s.split('|')[0]}
                </button>
              ))}
            </div>
          )}
          <label className="text-sm">Upload log file (file source):
            <input type="file" accept=".log,.txt,.out,.json,.ndjson" className="ml-2 text-sm" onChange={onUpload} disabled={uploading} />
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> auto-refresh
            <input className="w-16 border rounded px-1 py-0.5 text-xs" type="number" min={3} max={120} value={refreshSec} onChange={e => setRefreshSec(Number(e.target.value))} /> s
          </label>
          {uploading && <span className="text-xs text-slate-500">Uploading…</span>}
          {!uploading && uploadMsg && <span className="text-xs text-green-600">{uploadMsg}</span>}
        </div>
        {fileInfo && (
          <div className="text-xs text-slate-600">
            Active file: <span className="font-mono">{fileInfo.active_file}</span> {fileInfo.exists ? '' : '(missing)'} • Size: {formatBytes(fileInfo.size)} {fileInfo.mtime ? `• Updated: ${new Date(fileInfo.mtime).toLocaleString()}` : ''}
          </div>
        )}
        {loading && <Loading label="Fetching logs…" />}
        {error && <ErrorBox error={error} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LevelColumn title={`Errors (${grouped.error.length})`} color="text-red-600" items={grouped.error} filter={textFilter} />
        <LevelColumn title={`Warnings (${grouped.warning.length})`} color="text-amber-600" items={grouped.warning} filter={textFilter} />
        <LevelColumn title={`Info (${grouped.info.length})`} color="text-blue-600" items={grouped.info} filter={textFilter} />
      </div>
    </div>
  )
}

function groupByLevel(items) {
  return {
    error: items.filter(i => i.level === 'error'),
    warning: items.filter(i => i.level === 'warning'),
    info: items.filter(i => i.level === 'info'),
  }
}

function LevelColumn({ title, color, items, filter='' }) {
  const visible = filter ? items.filter(i => (i.message||'').toLowerCase().includes(filter.toLowerCase())) : items
  return (
    <div className="bg-white border rounded p-3">
      <div className={`text-sm font-semibold ${color}`}>{title}</div>
      <ul className="mt-2 space-y-2 max-h-[70vh] overflow-auto">
        {visible.map((i, idx) => (
          <li key={idx} className="border rounded p-2 text-sm">
            <div className="text-xs text-slate-500">{new Date(i.timestamp).toLocaleString()} — {i.service}</div>
            <div className="mt-1 whitespace-pre-wrap font-mono text-[12px]">{i.message}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatBytes(n){
  if(n === undefined || n === null) return ''
  const k = 1024, sizes = ['B','KB','MB','GB','TB']
  const i = Math.max(0, Math.floor(Math.log(Math.max(1, n))/Math.log(k)))
  return `${(n/Math.pow(k,i)).toFixed(1)} ${sizes[i]}`
}
