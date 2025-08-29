import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

export default function App() {
  const [source, setSource] = useState(() => localStorage.getItem('data_source') || 'auto')
  useEffect(() => { localStorage.setItem('data_source', source) }, [source])
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-white font-bold">A</span>
            <h1 className="text-xl font-semibold">Agentic LogAI</h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <NavLink to="/" end className={({isActive}) => isActive ? 'text-blue-600 font-medium' : 'text-slate-600 hover:text-slate-900'}>Dashboard</NavLink>
            <NavLink to="/logs" className={({isActive}) => isActive ? 'text-blue-600 font-medium' : 'text-slate-600 hover:text-slate-900'}>Logs</NavLink>
            <NavLink to="/metrics" className={({isActive}) => isActive ? 'text-blue-600 font-medium' : 'text-slate-600 hover:text-slate-900'}>Metrics</NavLink>
            <NavLink to="/resolutions" className={({isActive}) => isActive ? 'text-blue-600 font-medium' : 'text-slate-600 hover:text-slate-900'}>Resolutions</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">Source</span>
            <select value={source} onChange={e => setSource(e.target.value)} className="border rounded px-2 py-1 text-xs">
              <option value="auto">Auto</option>
              <option value="file">File</option>
              <option value="loki">Loki</option>
            </select>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3 text-xs text-slate-500 flex items-center justify-between">
          <div>© {new Date().getFullYear()} Agentic LogAI</div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            <span>Backend: 127.0.0.1:8000</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
