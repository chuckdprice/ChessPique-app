import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import { completeOAuthReturn, isOAuthReturn, stripOAuthParams } from './lib/lichess/oauth.ts'
import { applyAppearance, loadAppearance } from './lib/settings.ts'

// Lichess sends its sign-in pop-up back here. Hand the result to the app's
// other windows and close, rather than booting a second copy of the app in a
// window that is about to disappear.
if (isOAuthReturn()) {
  completeOAuthReturn()
} else {
  // A code that reaches the top window has nowhere to go — the sign-in that
  // asked for it lives in the popup's opener. Take it out of the address bar
  // rather than leaving it to be bookmarked, shared or sent as a referrer.
  stripOAuthParams()

  // Stamp the theme before first paint to avoid a light-mode flash.
  applyAppearance(loadAppearance())

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      {/* Both report to Vercel and are inert anywhere else. */}
      <Analytics />
      <SpeedInsights />
    </StrictMode>,
  )
}
