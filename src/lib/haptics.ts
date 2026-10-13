import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { telegram } from './telegram'

const safe = (p: Promise<unknown>) => p.catch(() => undefined)
// В Telegram вибрация — через его API: navigator.vibrate в iOS WebView не работает.
const tgHaptics = () => (typeof window !== 'undefined' ? telegram()?.HapticFeedback : undefined)

export const tap = () => (tgHaptics() ? tgHaptics()!.impactOccurred('light') : void safe(Haptics.impact({ style: ImpactStyle.Light })))
export const thud = () => (tgHaptics() ? tgHaptics()!.impactOccurred('medium') : void safe(Haptics.impact({ style: ImpactStyle.Medium })))
export const success = () => (tgHaptics() ? tgHaptics()!.notificationOccurred('success') : void safe(Haptics.notification({ type: NotificationType.Success })))
