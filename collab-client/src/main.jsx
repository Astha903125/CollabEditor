import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// StrictMode intentionally renders components twice in development
// to help catch side effects and bugs. Zero effect in production.
createRoot(document.getElementById('root')).render(
    <App />
)
