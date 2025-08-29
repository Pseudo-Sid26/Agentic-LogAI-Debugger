import React from 'react'
import { createBrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Logs from './pages/Logs.jsx'
import Metrics from './pages/Metrics.jsx'
import Resolutions from './pages/Resolutions.jsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'logs', element: <Logs /> },
      { path: 'metrics', element: <Metrics /> },
  { path: 'resolutions', element: <Resolutions /> },
    ],
  },
], {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  },
})
