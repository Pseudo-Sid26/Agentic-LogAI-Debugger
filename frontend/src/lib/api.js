import dayjs from 'dayjs'

const base = '' // proxied by Vite dev server to http://localhost:8000

export async function apiHealth() {
  const r = await fetch(`${base}/api/health`)
  if (!r.ok) throw new Error('Health check failed')
  return r.json()
}

export async function fetchLogs(params = {}) {
  const u = new URL(`${base}/api/logs`, window.location.origin)
  if (params.query) u.searchParams.set('query', params.query)
  if (params.minutes) u.searchParams.set('minutes', String(params.minutes))
  if (params.limit) u.searchParams.set('limit', String(params.limit))
  // Prefer explicit param, then user setting, then default to 'auto' for seamless behavior
  const src = params.source || (typeof localStorage !== 'undefined' ? localStorage.getItem('data_source') : null) || 'auto'
  if (!u.searchParams.has('source')) u.searchParams.set('source', src)
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error('Failed to fetch logs')
  return r.json()
}

export async function fetchMetrics(params = {}) {
  const u = new URL(`${base}/api/metrics`, window.location.origin)
  if (params.minutes) u.searchParams.set('minutes', String(params.minutes))
  if (params.interval) u.searchParams.set('interval', String(params.interval))
  // Prefer explicit param, then user setting, then default to 'auto' for seamless behavior
  const src = params.source || (typeof localStorage !== 'undefined' ? localStorage.getItem('data_source') : null) || 'auto'
  if (!u.searchParams.has('source')) u.searchParams.set('source', src)
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error('Failed to fetch metrics')
  return r.json()
}

export function formatTime(ts) {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss')
}

export async function fetchLabelValues(label) {
  const r = await fetch(`/api/labels/${encodeURIComponent(label)}`)
  if (!r.ok) throw new Error('Failed to fetch label values')
  return r.json()
}

export async function fetchResolutions() {
  const r = await fetch(`/api/resolutions`)
  if (!r.ok) throw new Error('Failed to fetch resolutions')
  return r.json()
}

export async function applyFix(payload) {
  const r = await fetch(`/api/fix/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!r.ok) throw new Error('Failed to apply fix')
  return r.json()
}

export async function previewFix(payload) {
  const r = await fetch(`/api/fix/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!r.ok) throw new Error('Failed to preview fix')
  return r.json()
}

export async function getFileSource() {
  const r = await fetch(`/api/logs/source`)
  if (!r.ok) throw new Error('Failed to get file source')
  return r.json()
}

export async function setFileSource(path) {
  const r = await fetch(`/api/logs/source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
  if (!r.ok) throw new Error('Failed to set file source')
  return r.json()
}

export async function uploadLog(file) {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`/api/logs/upload`, { method: 'POST', body: fd })
  if (!r.ok) throw new Error('Failed to upload log file')
  return r.json()
}
