/** Читает файл из <input type="file"> и ужимает до maxSide px в JPEG. Возвращает base64 без префикса. */
export async function fileToJpegBase64(file: File, maxSide = 1280, quality = 0.85): Promise<{ base64: string; dataUrl: string }> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Фото слишком большое. Выбери файл до 25 МБ.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Не удалось открыть изображение'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('Не удалось прочитать размер фото')
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Не удалось подготовить фото')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }
  } finally {
    URL.revokeObjectURL(url)
  }
}
