/**
 * Odie Pet Insurance API Integration Routes
 *
 * Proxies requests to the Odie staging/production API.
 * All routes require the ODIE_API_KEY and ODIE_API_BASE_URL env vars.
 *
 * Endpoints:
 *   GET  /api/odie/policy/:policyNumber          - Fetch policy details
 *   POST /api/odie/claims/submit                  - Submit a new claim
 *   POST /api/odie/claims/:claimNumber/upload     - Upload document to claim
 *   PATCH /api/odie/claims/:claimNumber/review    - Mark docs ready for review
 *   GET  /api/odie/claims/:claimNumber            - Get single claim status
 *   GET  /api/odie/policy/:policyNumber/claims    - List all claims for a policy
 */

import { Router } from 'express'
import multer from 'multer'

const router = Router()

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getOdieConfig() {
  const apiKey = process.env.ODIE_API_KEY?.trim()
  const baseUrl = process.env.ODIE_API_BASE_URL?.trim()
  if (!apiKey || !baseUrl) {
    throw new Error('Missing ODIE_API_KEY or ODIE_API_BASE_URL environment variables')
  }
  return { apiKey, baseUrl }
}

function odieHeaders(apiKey, contentType) {
  const headers = { 'x-api-key': apiKey }
  if (contentType) headers['Content-Type'] = contentType
  return headers
}

// Multer for document uploads — memory storage, 5 MB limit, allowed extensions
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: pdf, jpg, jpeg, png`))
    }
  },
})

// ---------------------------------------------------------------------------
// 1. GET /api/odie/policy/:policyNumber
//    Fetch full policy details from Odie
// ---------------------------------------------------------------------------
router.get('/policy/:policyNumber', async (req, res) => {
  const { policyNumber } = req.params
  console.log(`[Odie] GET policy ${policyNumber}`)

  try {
    const { apiKey, baseUrl } = getOdieConfig()
    const response = await fetch(`${baseUrl}/v1/policy/${encodeURIComponent(policyNumber)}`, {
      method: 'GET',
      headers: odieHeaders(apiKey),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error(`[Odie] Policy lookup failed (${response.status}):`, data)
      return res.status(response.status).json({
        ok: false,
        error: data.message || `Odie API error ${response.status}`,
        odieCode: data.code,
      })
    }

    console.log(`[Odie] Policy ${policyNumber}: status=${data.policyStatus}, active=${data.active}`)
    return res.json({
      ok: true,
      policy: {
        policyNumber: data.policyNumber,
        policyStatus: data.policyStatus,
        active: data.active,
        allowClaim: data.allowClaim,
        petName: data.petName,
        species: data.species,
        deductibleAmount: data.deductibleAmount,
        deductibleBalance: data.deductibleBalance,
        standardAnnualLimit: data.standardAnnualLimit,
        annualLimitBalance: data.annualLimitBalance,
        coinsurancePercent: data.coinsurancePercent,
        policyStartDate: data.policyStartDate,
        illnessEffectiveDate: data.illnessEffectiveDate,
        accidentEffectiveDate: data.accidentEffectiveDate,
        office_visits: data.office_visits,
      },
    })
  } catch (err) {
    console.error('[Odie] Policy fetch error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ---------------------------------------------------------------------------
// 2. POST /api/odie/claims/submit
//    Submit a new claim to Odie
// ---------------------------------------------------------------------------
router.post('/claims/submit', async (req, res) => {
  const {
    policyNumber,
    dateOfService,
    category,
    amountClaimed,
    description,
    veterinaryPractice,
  } = req.body

  console.log(`[Odie] POST submit claim: policy=${policyNumber}, amount=${amountClaimed}, category=${category}`)

  // Basic validation
  if (!policyNumber || !dateOfService || !category || !amountClaimed || !veterinaryPractice) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required fields: policyNumber, dateOfService, category, amountClaimed, veterinaryPractice',
    })
  }

  const validCategories = ['CLAIMTYPEACCIDENT', 'CLAIMTYPEILLNESS', 'CLAIMTYPEONGOING', 'CLAIMTYPEROUTINE']
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
    })
  }

  try {
    const { apiKey, baseUrl } = getOdieConfig()
    const now = new Date().toISOString()

    const payload = {
      dateOfService,
      category,
      amountClaimed: Number(amountClaimed),
      description: description || '',
      veterinaryPractice: {
        practiceName: veterinaryPractice.practiceName,
        contact: {
          line1: veterinaryPractice.line1 || veterinaryPractice.contact?.line1 || '',
          city: veterinaryPractice.city || veterinaryPractice.contact?.city || '',
          state: veterinaryPractice.state || veterinaryPractice.contact?.state || '',
          zipCode: veterinaryPractice.zipCode || veterinaryPractice.contact?.zipCode || '',
          country: veterinaryPractice.country || veterinaryPractice.contact?.country || 'USA',
          phone: veterinaryPractice.phone || veterinaryPractice.contact?.phone || '',
        },
      },
      pecAcknowledgment: true,
      certifiedInfoAck: now,
      crimeAck: now,
    }

    const response = await fetch(
      `${baseUrl}/v1/policy/${encodeURIComponent(policyNumber)}/claims`,
      {
        method: 'POST',
        headers: odieHeaders(apiKey, 'application/json'),
        body: JSON.stringify(payload),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error(`[Odie] Claim submit failed (${response.status}):`, data)
      return res.status(response.status).json({
        ok: false,
        error: data.message || `Odie API error ${response.status}`,
        odieCode: data.code,
      })
    }

    console.log(`[Odie] Claim submitted: claimNumber=${data.claimNumber}, status=${data.status}`)
    return res.json({
      ok: true,
      claim: {
        claimNumber: data.claimNumber,
        policyNumber: data.policyNumber,
        status: data.status,
        submissionDate: data.submissionDate,
        dateOfService: data.dateOfService,
        category: data.category,
        amountClaimed: data.amountClaimed,
        amountPaid: data.amountPaid,
        policyDeductibleBalance: data.policyDeductibleBalance,
      },
    })
  } catch (err) {
    console.error('[Odie] Claim submit error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ---------------------------------------------------------------------------
// 3. POST /api/odie/claims/:claimNumber/upload
//    Upload a document (vet invoice) to an existing claim
// ---------------------------------------------------------------------------
router.post('/claims/:claimNumber/upload', uploadDoc.single('document'), async (req, res) => {
  const { claimNumber } = req.params
  console.log(`[Odie] POST upload document to claim ${claimNumber}`)

  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No file provided. Attach a pdf, jpg, jpeg, or png (max 5MB).' })
  }

  try {
    const { apiKey, baseUrl } = getOdieConfig()

    // Build multipart form data manually for node-fetch
    // We need to use FormData — import dynamically since node-fetch provides it
    const { FormData, Blob } = await import('node-fetch')

    const form = new FormData()
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype })
    form.append('document', blob, req.file.originalname)
    form.append('documentType', 'Veterinary_Invoice')

    const response = await fetch(
      `${baseUrl}/v2/claim/${encodeURIComponent(claimNumber)}/documents`,
      {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: form,
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error(`[Odie] Document upload failed (${response.status}):`, data)
      return res.status(response.status).json({
        ok: false,
        error: data.message || `Odie API error ${response.status}`,
        odieCode: data.code,
      })
    }

    console.log(`[Odie] Document uploaded to claim ${claimNumber}:`, Array.isArray(data) ? data.length + ' doc(s)' : 'ok')
    return res.json({
      ok: true,
      documents: data,
    })
  } catch (err) {
    console.error('[Odie] Document upload error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ---------------------------------------------------------------------------
// 4. PATCH /api/odie/claims/:claimNumber/review
//    Tell Odie all documents are uploaded and ready for review
// ---------------------------------------------------------------------------
router.patch('/claims/:claimNumber/review', async (req, res) => {
  const { claimNumber } = req.params
  console.log(`[Odie] PATCH review-documents for claim ${claimNumber}`)

  try {
    const { apiKey, baseUrl } = getOdieConfig()

    const response = await fetch(
      `${baseUrl}/v2/claim/${encodeURIComponent(claimNumber)}/review-documents`,
      {
        method: 'PATCH',
        headers: odieHeaders(apiKey, 'application/json'),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error(`[Odie] Review-documents failed (${response.status}):`, data)
      return res.status(response.status).json({
        ok: false,
        error: data.message || `Odie API error ${response.status}`,
        odieCode: data.code,
      })
    }

    console.log(`[Odie] Claim ${claimNumber} marked ready for review`)
    return res.json({ ok: true, data })
  } catch (err) {
    console.error('[Odie] Review-documents error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ---------------------------------------------------------------------------
// 5. GET /api/odie/claims/:claimNumber
//    Get single claim status
// ---------------------------------------------------------------------------
router.get('/claims/:claimNumber', async (req, res) => {
  const { claimNumber } = req.params
  console.log(`[Odie] GET claim ${claimNumber}`)

  try {
    const { apiKey, baseUrl } = getOdieConfig()

    const response = await fetch(
      `${baseUrl}/v1/claim/${encodeURIComponent(claimNumber)}`,
      {
        method: 'GET',
        headers: odieHeaders(apiKey),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error(`[Odie] Claim lookup failed (${response.status}):`, data)
      return res.status(response.status).json({
        ok: false,
        error: data.message || `Odie API error ${response.status}`,
        odieCode: data.code,
      })
    }

    console.log(`[Odie] Claim ${claimNumber}: status=${data.status}, paid=${data.amountPaid}`)
    return res.json({
      ok: true,
      claim: {
        claimNumber: data.claimNumber,
        policyNumber: data.policyNumber,
        status: data.status,
        submissionDate: data.submissionDate,
        dateOfService: data.dateOfService,
        category: data.category,
        amountClaimed: data.amountClaimed,
        amountPaid: data.amountPaid,
        appliedToDeductible: data.appliedToDeductible,
        processedDate: data.processedDate,
        description: data.description,
        documents: data.documents || [],
        veterinaryPractice: data.veterinaryPractice,
      },
    })
  } catch (err) {
    console.error('[Odie] Claim fetch error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ---------------------------------------------------------------------------
// 6. GET /api/odie/policy/:policyNumber/claims
//    List all claims for a policy
// ---------------------------------------------------------------------------
router.get('/policy/:policyNumber/claims', async (req, res) => {
  const { policyNumber } = req.params
  console.log(`[Odie] GET claims for policy ${policyNumber}`)

  try {
    const { apiKey, baseUrl } = getOdieConfig()

    const response = await fetch(
      `${baseUrl}/v1/policy/${encodeURIComponent(policyNumber)}/claims`,
      {
        method: 'GET',
        headers: odieHeaders(apiKey),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error(`[Odie] Policy claims lookup failed (${response.status}):`, data)
      return res.status(response.status).json({
        ok: false,
        error: data.message || `Odie API error ${response.status}`,
        odieCode: data.code,
      })
    }

    const claims = Array.isArray(data) ? data : (data.claims || [])
    console.log(`[Odie] Policy ${policyNumber}: ${claims.length} claim(s)`)
    return res.json({ ok: true, claims })
  } catch (err) {
    console.error('[Odie] Policy claims fetch error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
