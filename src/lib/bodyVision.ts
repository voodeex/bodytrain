import { registerPlugin } from '@capacitor/core'
import { isNative } from './http'

/**
 * Нативный плагин (ios/App/App/BodyVisionPlugin.swift) поверх Apple Vision / VisionKit:
 *  - classifyFood: встроенный в iOS классификатор изображений (~1300 меток, из них ~200 — еда).
 *    Работает на устройстве, офлайн, без скачивания моделей.
 *  - detectBarcode: поиск штрихкода на фото.
 *  - scanBarcode: живой сканер камерой (DataScannerViewController, iPhone XS и новее).
 */
export interface VisionLabel {
  id: string
  confidence: number
}

interface BodyVisionPlugin {
  classifyFood(opts: { image: string }): Promise<{ labels: VisionLabel[] }>
  detectBarcode(opts: { image: string }): Promise<{ codes: string[] }>
  scanBarcode(): Promise<{ code: string }>
  isScannerAvailable(): Promise<{ available: boolean }>
  getSecret(opts: { name: string }): Promise<{ value: string }>
  setSecret(opts: { name: string; value: string }): Promise<void>
}

export const BodyVision = registerPlugin<BodyVisionPlugin>('BodyVision')

export const visionAvailable = isNative

export async function classifyFood(base64: string): Promise<VisionLabel[]> {
  if (!isNative) throw new Error('Распознавание на устройстве работает только в iOS-приложении')
  const { labels } = await BodyVision.classifyFood({ image: base64 })
  return labels
}

export async function detectBarcode(base64: string): Promise<string[]> {
  if (isNative) return (await BodyVision.detectBarcode({ image: base64 })).codes
  // В браузере — BarcodeDetector, если он есть (Chrome/Android).
  const BD = (globalThis as unknown as { BarcodeDetector?: new () => { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector
  if (!BD) return []
  const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob()
  const bitmap = await createImageBitmap(blob)
  return (await new BD().detect(bitmap)).map((r) => r.rawValue)
}

export async function scannerAvailable() {
  if (!isNative) return false
  try {
    return (await BodyVision.isScannerAvailable()).available
  } catch {
    return false
  }
}

export async function scanBarcodeLive(): Promise<string | null> {
  try {
    return (await BodyVision.scanBarcode()).code
  } catch (e) {
    if ((e as { code?: string }).code === 'CANCELLED') return null
    throw e
  }
}
