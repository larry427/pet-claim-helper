import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'

// Configure worker for pdfjs v4 with Vite
GlobalWorkerOptions.workerSrc = pdfWorker

export async function pdfFileToPngDataUrl(file: File, dpi = 144): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = getDocument({ data: arrayBuffer })
  const pdf: PDFDocumentProxy = await loadingTask.promise
  const page = await pdf.getPage(1) // First page for now

  const viewport = page.getViewport({ scale: 1 })
  // Compute scale factor from desired DPI (default CSS pixel @96dpi)
  const scale = dpi / 96
  const scaledViewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context unavailable')
  canvas.width = Math.ceil(scaledViewport.width)
  canvas.height = Math.ceil(scaledViewport.height)

  await page.render({ canvasContext: context, viewport: scaledViewport }).promise

  const dataUrl = canvas.toDataURL('image/png')
  return dataUrl
}


