import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import App from './App'
import { isNative } from './lib/http'
import { flushStorage } from './lib/storage'
import './index.css'

if (isNative) {
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined)
  // Сохраняем состояние, когда приложение уходит в фон.
  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) void flushStorage().catch(() => undefined)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
