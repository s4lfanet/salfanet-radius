/**
 * Compress an image file to a base64 JPEG string.
 */
export const compressImage = (file, maxPx = 800, quality = 0.75) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = reject
  reader.onload = ev => {
    const img = new Image()
    img.onerror = reject
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
})

/**
 * Compose a human-readable address string from a wilayah selection object.
 */
export const composeAddress = (sw) => {
  const rtRw = sw.rt && sw.rw ? `RT ${sw.rt}/RW ${sw.rw}` : (sw.rt ? `RT ${sw.rt}` : (sw.rw ? `RW ${sw.rw}` : ''))
  const dusunPart = sw.dusun ? `Dusun ${sw.dusun}` : ''
  const parts = [sw.detail, dusunPart, rtRw, sw.kelNama, sw.kecNama ? `Kec. ${sw.kecNama}` : '', sw.kabNama, sw.provNama].filter(Boolean)
  return parts.join(', ')
}
