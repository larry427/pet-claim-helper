/**
 * Document Scanner Utility using OpenCV.js
 *
 * Automatically detects document edges, crops, and straightens images
 * like CamScanner does. Used for vet bills and receipt photos.
 */

// OpenCV.js types
declare const cv: any

// Track OpenCV loading state
let cvReady = false
let cvLoadFailed = false // Permanently disable if loading fails
let cvLoadPromise: Promise<void> | null = null

/**
 * Load OpenCV.js asynchronously
 * Returns a promise that resolves when OpenCV is ready
 * If loading fails, marks OpenCV as permanently disabled for this session
 */
export async function loadOpenCV(): Promise<void> {
  // If loading previously failed, don't try again
  if (cvLoadFailed) {
    return Promise.reject(new Error('OpenCV loading previously failed'))
  }

  // Already loaded
  if (cvReady && typeof cv !== 'undefined') {
    return Promise.resolve()
  }

  // Already loading
  if (cvLoadPromise) {
    return cvLoadPromise
  }

  cvLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded globally
    if (typeof cv !== 'undefined' && cv.Mat) {
      cvReady = true
      resolve()
      return
    }

    // Dynamic import of opencv.js with timeout wrapper
    const loadTimeout = setTimeout(() => {
      cvLoadFailed = true
      cvLoadPromise = null
      reject(new Error('OpenCV.js load timeout'))
    }, 15000) // 15 second timeout for the entire load process

    import('@techstark/opencv-js')
      .then((opencvModule) => {
        // The module exports cv directly or as default
        const cvInstance = opencvModule.default || opencvModule

        // Wait for OpenCV to be ready
        if (cvInstance && cvInstance.onRuntimeInitialized !== undefined) {
          cvInstance.onRuntimeInitialized = () => {
            clearTimeout(loadTimeout)
            cvReady = true
            resolve()
          }
        } else if (cvInstance && cvInstance.Mat) {
          // Already initialized
          clearTimeout(loadTimeout)
          cvReady = true
          resolve()
        } else {
          // Give it a moment to initialize
          const checkReady = setInterval(() => {
            if (typeof cv !== 'undefined' && cv.Mat) {
              clearInterval(checkReady)
              clearTimeout(loadTimeout)
              cvReady = true
              resolve()
            }
          }, 100)

          // Timeout after 10 seconds of polling
          setTimeout(() => {
            clearInterval(checkReady)
            if (!cvReady) {
              clearTimeout(loadTimeout)
              cvLoadFailed = true
              cvLoadPromise = null
              reject(new Error('OpenCV.js failed to initialize'))
            }
          }, 10000)
        }
      })
      .catch((err) => {
        clearTimeout(loadTimeout)
        cvLoadFailed = true
        cvLoadPromise = null
        console.error('[documentScanner] Failed to load OpenCV.js:', err)
        reject(err)
      })
  })

  return cvLoadPromise
}

/**
 * Check if OpenCV loading has been disabled due to previous failure
 */
export function isOpenCVDisabled(): boolean {
  return cvLoadFailed
}

/**
 * Check if OpenCV is loaded and ready
 */
export function isOpenCVReady(): boolean {
  return cvReady && typeof cv !== 'undefined'
}

/**
 * Convert an image file to an HTMLImageElement
 */
function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

/**
 * Convert base64 to HTMLImageElement
 */
function base64ToImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image from base64'))

    // Ensure proper data URL format
    if (!base64.startsWith('data:')) {
      base64 = `data:image/jpeg;base64,${base64}`
    }
    img.src = base64
  })
}

/**
 * Order points in a consistent way: top-left, top-right, bottom-right, bottom-left
 */
function orderPoints(pts: number[][]): number[][] {
  // Sort by y-coordinate (top vs bottom)
  const sorted = [...pts].sort((a, b) => a[1] - b[1])

  // Top two points
  const topTwo = sorted.slice(0, 2).sort((a, b) => a[0] - b[0])
  // Bottom two points
  const bottomTwo = sorted.slice(2, 4).sort((a, b) => a[0] - b[0])

  // Return in order: top-left, top-right, bottom-right, bottom-left
  return [topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0]]
}

/**
 * Calculate distance between two points
 */
function distance(p1: number[], p2: number[]): number {
  return Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2))
}

/**
 * Find the document contour in the image
 * Returns the 4 corner points or null if not found
 */
function findDocumentContour(src: any): number[][] | null {
  // Convert to grayscale
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

  // Apply Gaussian blur to reduce noise
  const blurred = new cv.Mat()
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)

  // Apply Canny edge detection
  const edges = new cv.Mat()
  cv.Canny(blurred, edges, 50, 150)

  // Dilate to close gaps in edges
  const dilated = new cv.Mat()
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
  cv.dilate(edges, dilated, kernel)

  // Find contours
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

  let documentContour: number[][] | null = null
  let maxArea = 0
  const imageArea = src.rows * src.cols
  const minAreaThreshold = imageArea * 0.1 // Document must be at least 10% of image

  // Find the largest 4-point contour
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i)
    const area = cv.contourArea(contour)

    // Skip small contours
    if (area < minAreaThreshold) {
      contour.delete()
      continue
    }

    // Approximate the contour to reduce points
    const peri = cv.arcLength(contour, true)
    const approx = new cv.Mat()
    cv.approxPolyDP(contour, approx, 0.02 * peri, true)

    // Check if it's a quadrilateral (4 points)
    if (approx.rows === 4 && area > maxArea) {
      maxArea = area

      // Extract the 4 corner points
      const points: number[][] = []
      for (let j = 0; j < 4; j++) {
        points.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]])
      }
      documentContour = orderPoints(points)
    }

    approx.delete()
    contour.delete()
  }

  // Cleanup
  gray.delete()
  blurred.delete()
  edges.delete()
  dilated.delete()
  kernel.delete()
  contours.delete()
  hierarchy.delete()

  return documentContour
}

/**
 * Apply perspective transform to straighten the document
 */
function perspectiveTransform(src: any, corners: number[][]): any {
  // Calculate the dimensions of the output image
  const [tl, tr, br, bl] = corners

  // Width: max of top edge and bottom edge
  const widthTop = distance(tl, tr)
  const widthBottom = distance(bl, br)
  const maxWidth = Math.max(Math.round(widthTop), Math.round(widthBottom))

  // Height: max of left edge and right edge
  const heightLeft = distance(tl, bl)
  const heightRight = distance(tr, br)
  const maxHeight = Math.max(Math.round(heightLeft), Math.round(heightRight))

  // Source points (the detected corners)
  const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl[0], tl[1],
    tr[0], tr[1],
    br[0], br[1],
    bl[0], bl[1]
  ])

  // Destination points (the rectangle we want)
  const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    maxWidth - 1, 0,
    maxWidth - 1, maxHeight - 1,
    0, maxHeight - 1
  ])

  // Get the perspective transform matrix
  const transformMatrix = cv.getPerspectiveTransform(srcPoints, dstPoints)

  // Apply the transform
  const dst = new cv.Mat()
  cv.warpPerspective(src, dst, transformMatrix, new cv.Size(maxWidth, maxHeight))

  // Cleanup
  srcPoints.delete()
  dstPoints.delete()
  transformMatrix.delete()

  return dst
}

/**
 * Convert OpenCV Mat to base64 string
 */
function matToBase64(mat: any, quality = 0.92): string {
  // Create a canvas to draw the image
  const canvas = document.createElement('canvas')
  canvas.width = mat.cols
  canvas.height = mat.rows

  // Draw the Mat to the canvas
  cv.imshow(canvas, mat)

  // Convert to base64
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Convert OpenCV Mat to Blob
 */
function matToBlob(mat: any, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = mat.cols
    canvas.height = mat.rows
    cv.imshow(canvas, mat)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to convert to blob'))
        }
      },
      'image/jpeg',
      quality
    )
  })
}

export type ScanResult = {
  success: boolean
  processed: boolean // true if document was detected and processed
  base64: string
  blob: Blob
  originalWidth: number
  originalHeight: number
  croppedWidth?: number
  croppedHeight?: number
  error?: string
}

/**
 * Main function: Scan and crop a document from an image
 *
 * @param input - File object or base64 string
 * @returns Processed image as base64 and blob, with metadata
 */
export async function scanDocument(input: File | string): Promise<ScanResult> {
  // If OpenCV previously failed to load, skip scanning entirely and return original
  if (cvLoadFailed) {
    console.log('[documentScanner] OpenCV disabled, using original image')
    if (input instanceof File) {
      try {
        const base64 = await fileToBase64Fallback(input)
        return {
          success: true,
          processed: false,
          base64,
          blob: input,
          originalWidth: 0,
          originalHeight: 0,
        }
      } catch {
        // Fallback failed too
      }
    }
    return {
      success: false,
      processed: false,
      base64: '',
      blob: new Blob(),
      originalWidth: 0,
      originalHeight: 0,
      error: 'OpenCV disabled'
    }
  }

  try {
    // Ensure OpenCV is loaded (with timeout protection)
    await loadOpenCV()

    if (!isOpenCVReady()) {
      throw new Error('OpenCV not ready')
    }

    // Load the image
    let img: HTMLImageElement
    if (input instanceof File) {
      img = await fileToImage(input)
    } else {
      img = await base64ToImage(input)
    }

    const originalWidth = img.width
    const originalHeight = img.height

    // Create a canvas and draw the image
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    // Read into OpenCV Mat
    const src = cv.imread(canvas)

    // Find document contour
    const corners = findDocumentContour(src)

    let resultMat: any
    let processed = false

    if (corners) {
      // Document found - apply perspective transform
      resultMat = perspectiveTransform(src, corners)
      processed = true
      console.log('[documentScanner] Document detected and cropped')
    } else {
      // No document found - use original image
      resultMat = src.clone()
      console.log('[documentScanner] No document detected, using original')
    }

    // Convert result to base64 and blob
    const base64 = matToBase64(resultMat)
    const blob = await matToBlob(resultMat)

    const result: ScanResult = {
      success: true,
      processed,
      base64,
      blob,
      originalWidth,
      originalHeight,
      ...(processed && {
        croppedWidth: resultMat.cols,
        croppedHeight: resultMat.rows
      })
    }

    // Cleanup
    src.delete()
    resultMat.delete()

    return result

  } catch (error) {
    console.error('[documentScanner] Error:', error)

    // Fallback: return original image if possible
    if (input instanceof File) {
      try {
        const base64 = await fileToBase64Fallback(input)
        const blob = input
        return {
          success: true,
          processed: false,
          base64,
          blob,
          originalWidth: 0,
          originalHeight: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      } catch {
        // Complete failure
      }
    }

    return {
      success: false,
      processed: false,
      base64: '',
      blob: new Blob(),
      originalWidth: 0,
      originalHeight: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Fallback function to convert file to base64 without OpenCV
 */
function fileToBase64Fallback(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Check if a file is an image (not PDF)
 */
export function isImageFile(file: File): boolean {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  return imageTypes.includes(file.type.toLowerCase()) ||
         /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name)
}

/**
 * Pre-load OpenCV in the background
 * Call this early in app initialization
 */
export function preloadOpenCV(): void {
  loadOpenCV().catch((err) => {
    console.warn('[documentScanner] Failed to preload OpenCV:', err)
  })
}
