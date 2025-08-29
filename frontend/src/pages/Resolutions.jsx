import { useEffect, useState } from 'react'
import { fetchResolutions, applyFix, previewFix } from '../lib/api'

export default function Resolutions() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(null)
  const [preview, setPreview] = useState(null)
  const [applyingFromPreview, setApplyingFromPreview] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetchResolutions()
      setItems(res.items || [])
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function onApply(item, idx) {
    setApplying(idx)
    try {
      const payload = {
        file_location: item.file_location,
        related_code: item.related_code || '',
        code_suggestion: item.code_suggestion || '',
        create_backup: true,
        fingerprint: item._fp,
      }
      // If there's no explicit code suggestion, fall back to LLM-assisted mode
      if (!item.code_suggestion) {
        payload.use_llm = true
        payload.instruction = (
          item.instruction ||
          item.explanation ||
          item.suggestion ||
          item.suggested_fix ||
          item.message ||
          'Apply a minimal fix for the described issue.'
        )
      }
      const r = await applyFix(payload)
      if (r.success) {
        alert(`Fix applied to ${r.file || item.file_location}`)
        // Remove item locally and mark resolved server-side if possible
        setItems(prev => prev.filter((_, i) => i !== idx))
        if (item._fp) {
          try { await fetch('/api/resolutions/mark-resolved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint: item._fp }) }) } catch {}
        }
      } else {
        alert(r.message || 'Failed to apply fix')
      }
    } catch (e) {
      alert(String(e.message || e))
    } finally {
      setApplying(null)
    }
  }

  async function onPreview(item) {
    try {
      const payload = {
        file_location: item.file_location,
        related_code: item.related_code || '',
        code_suggestion: item.code_suggestion || '',
        use_llm: !item.code_suggestion,
        instruction: (
          item.instruction || item.explanation || item.suggestion || item.suggested_fix || item.message || ''
        )
      }
      const r = await previewFix(payload)
      setPreview(r)
    } catch (e) {
      alert(String(e.message || e))
    }
  }

  async function onApplyFromPreview(item) {
    if (!preview) return
    setApplyingFromPreview(true)
    try {
      const payload = {
        file_location: item.file_location,
        related_code: item.related_code || '',
        code_suggestion: preview.suggestion || item.code_suggestion || '',
        create_backup: true,
        fingerprint: item._fp,
      }
      const r = await applyFix(payload)
      if (r.success) {
        alert(`Fix applied to ${r.file}`)
        setPreview(null)
      } else {
        alert(r.message || 'Failed to apply fix')
      }
    } catch (e) {
      alert(String(e.message || e))
    } finally {
      setApplyingFromPreview(false)
    }
  }

  function renderDiff(diff) {
    if (!diff) return 'No changes would be made.'
    return diff.split('\n').map((line, i) => {
      let cls = 'text-slate-800'
      if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-green-700'
      if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-700'
      if (line.startsWith('@@')) cls = 'text-purple-700'
      return <div key={i} className={`whitespace-pre-wrap font-mono text-[12px] ${cls}`}>{line}</div>
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Resolutions</h2>
        <button onClick={load} className="px-3 py-1 text-sm border rounded">Refresh</button>
      </div>
      {loading && <div className="text-sm text-slate-500">Loading…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && items.length === 0 && (
        <div className="text-sm text-slate-500">No resolutions found. Run the agent analysis to generate error_analysis_*.json.</div>
      )}
      <div className="space-y-4">
        {items.slice(0, 20).map((it, idx) => (
          <div key={idx} className="border rounded-lg bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{it.error_type} <span className="text-slate-500">in</span> {it.file_location}</div>
                <div className="text-xs text-slate-500">Line {it.line_number} • Confidence {it.confidence || 'MEDIUM'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onPreview(it)} className="px-3 py-1 text-sm border rounded">Preview Diff</button>
                <button disabled={applying===idx} onClick={() => onApply(it, idx)} className="px-3 py-1 text-sm bg-blue-600 disabled:opacity-50 text-white rounded">
                  {applying===idx ? 'Applying…' : 'Apply Fix'}
                </button>
                <button onClick={() => onApply({ ...it, code_suggestion: it.code_suggestion || '' }, idx)} className="px-3 py-1 text-sm border rounded">Mark Resolved</button>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-600 mb-1">Suggested Code Change</div>
              <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-auto"><code>{it.code_suggestion}</code></pre>
            </div>
            {it.related_code && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-600 mb-1">Related Code (match target)</div>
                <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto"><code>{it.related_code}</code></pre>
              </div>
            )}
          </div>
        ))}
      </div>
      {preview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white w-full max-w-3xl rounded shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between">
              <div className="text-sm font-semibold">Diff Preview</div>
              <button className="text-xs px-2 py-1 border rounded" onClick={() => setPreview(null)}>Close</button>
            </div>
            <div className="p-3">
              <div className="text-xs text-slate-600 mb-2">{preview.file}</div>
              {preview.suggestion && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-slate-600 mb-1">Suggested Snippet</div>
                  <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-auto"><code>{preview.suggestion}</code></pre>
                </div>
              )}
              <div className="text-xs font-semibold text-slate-600 mb-1">Unified Diff</div>
              <div className="bg-slate-100 p-3 rounded overflow-auto">
                {renderDiff(preview.diff)}
              </div>
              <div className="mt-3 flex items-center justify-end">
                <button disabled={applyingFromPreview} onClick={() => onApplyFromPreview({
                  file_location: preview.file,
                  related_code: '',
                  code_suggestion: preview.suggestion || ''
                })} className="px-3 py-1 text-sm bg-blue-600 disabled:opacity-50 text-white rounded">
                  {applyingFromPreview ? 'Applying…' : 'Apply this diff'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
