import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.voodeex.bodytrain',
  appName: 'BodyTrain',
  webDir: 'dist',
  ios: {
    backgroundColor: '#0b0b0c',
    // Отступы под чёлку/home indicator делаем сами через env(safe-area-inset-*)
    contentInset: 'never',
    scrollEnabled: false,
  },
  plugins: {
    StatusBar: { style: 'DARK', overlaysWebView: true },
  },
}

export default config
