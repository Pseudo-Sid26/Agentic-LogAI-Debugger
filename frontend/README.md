# Agentic LogAI Frontend (React + Vite)

A React (JavaScript) dashboard for the FastAPI backend in `backend/services/main.py`.

- Dev server: Vite on http://localhost:5173
- Proxy: `/api` -> http://localhost:8000 (FastAPI)
- Styling: Tailwind CSS
- Routing: React Router v6
- Charts: Recharts

## Setup

1. Install Node.js 18+
2. Install deps

```powershell
cd frontend
npm install
```

3. Start backend (FastAPI) on port 8000
4. Run frontend

```powershell
npm run dev
```

## Build

```powershell
npm run build
npm run preview
```

## Notes
- Adjust the proxy target in `vite.config.js` if your backend runs elsewhere.
- Ensure CORS in FastAPI allows `http://localhost:5173` (already configured).