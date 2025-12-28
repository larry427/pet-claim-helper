import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { fileToDataUrl } from './lib/fileUtils'
import type { ExtractedBill, LineItem, PetProfile, PetSpecies, InsuranceCompany, MultiPetExtracted, ExtractedPetGroup } from './types'
import { pdfFileToPngDataUrl } from './lib/pdfToImage'
import { dbLoadPets, dbUpsertPet, dbDeletePet, dbEnsureProfile } from './lib/petStorage'
import { supabase, updateUserTimezone } from './lib/supabase'
import { generateClaimPdf, generateClaimPdfForPet } from './lib/pdfClaim'
import AddMedicationForm from './components/AddMedicationForm'
import OnboardingModal from './components/OnboardingModal'
// DISABLED: Using add-to-homescreen library in index.html instead
// import AddToHomeScreenModal from './components/AddToHomeScreenModal'
import FinancialSummary from './components/FinancialSummary'
import MedicationsDashboard from './components/MedicationsDashboard'
import FoodTrackingDashboard from './components/FoodTrackingDashboard'
import TreatsTrackingDashboard from './components/TreatsTrackingDashboard'
import DoseMarkingPage from './components/DoseMarkingPage'
import DoseSuccess from './components/DoseSuccess'
import ClaimSubmissionModal from './components/ClaimSubmissionModal'
import { SignatureCapture } from './components/SignatureCapture'
import AdminDashboard from './components/AdminDashboard'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import { createClaim, listClaims, updateClaim, deleteClaim as dbDeleteClaim } from './lib/claims'
import { formatPhoneOnChange, formatPhoneForStorage, formatPhoneForDisplay } from './utils/phoneUtils'
import { INSURANCE_OPTIONS, getInsuranceValue, getInsuranceDisplay, getDeadlineDays } from './lib/insuranceOptions'
import React from 'react'

type SelectedFile = {
  file: File
  objectUrl?: string
}

// Auto-Submit Feature Flag Whitelist
// Only these email addresses can see the Auto-Submit button
const AUTOSUB_WHITELIST = [
  'test-automation@petclaimhelper.com',
  'larry@uglydogadventures.com',
  'larry@dogstrainedright.com',
]

// Insurers with Auto-Submit enabled (must match backend PRODUCTION_INSURERS)
const PRODUCTION_INSURERS = ['pumpkin', 'spot', 'healthy paws', 'nationwide', 'trupanion', 'pets best', 'figo', 'aspca']

// Demo accounts can auto-submit for any insurer (must match backend DEMO_ACCOUNTS)
const DEMO_ACCOUNTS = [
  'demo@petclaimhelper.com',
  'drsarah@petclaimhelper.com',
  'david@mybenefitexperience.com',
  'larry@uglydogadventures.com',  // TEMPORARY for testing BCC
  'larrysecrets@gmail.com'
]

// Route wrapper: Detect /dose/:code and render standalone page
// Otherwise render the full app
export default function App() {
  const path = window.location.pathname
  const doseMatch = path.match(/^\/dose\/([a-zA-Z0-9-]+)$/i)

  console.log('[App Router] Path:', path, 'DoseMatch:', doseMatch)

  // Static success page - zero database calls
  if (path === '/dose-success') {
    console.log('[App Router] Rendering static success page')
    return <DoseSuccess />
  }

  // Reset password page
  if (path === '/reset-password') {
    console.log('[App Router] Rendering reset password page')
    return <ResetPassword />
  }

  if (doseMatch) {
    const code = doseMatch[1]
    console.log('[App Router] Rendering standalone dose page for code:', code)
    return (
      <DoseMarkingPage
        medicationId={code}
        userId={null}
        onClose={() => {
          console.log('[App Router] Dose marking closed')
        }}
      />
    )
  }

  console.log('[App Router] Rendering full app')
  return <MainApp />
}


// Main app component with all the hooks
function MainApp() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedBill | null>(null)
  const [pets, setPets] = useState<PetProfile[]>([])
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null)
  const selectedPet = useMemo(() => pets.find(p => p.id === selectedPetId) ?? null, [pets, selectedPetId])
  const [visitNotes, setVisitNotes] = useState('')  // NEW: For visit notes
  const [visitTitle, setVisitTitle] = useState('')  // NEW: User friendly title
  const [expenseCategory, setExpenseCategory] = useState<'insured' | 'not_insured' | 'maybe_insured'>('insured')
  const [addingPet, setAddingPet] = useState(false)
  const [newPet, setNewPet] = useState<{ name: string; species: PetSpecies; insuranceCompany: InsuranceCompany; filing_deadline_days?: number | ''; monthly_premium?: number | ''; deductible_per_claim?: number | ''; insurance_pays_percentage?: number | ''; coverage_start_date?: string; policyNumber?: string; healthy_paws_pet_id?: string; spot_account_number?: string; figo_policy_number?: string }>(
    {
    name: '',
    species: 'dog',
    insuranceCompany: '',
      filing_deadline_days: '',
      monthly_premium: '',
      deductible_per_claim: '',
      insurance_pays_percentage: '',
      coverage_start_date: '',
      policyNumber: '',
      healthy_paws_pet_id: '',
      spot_account_number: '',
      figo_policy_number: ''
    }
  )
  const [editingPetId, setEditingPetId] = useState<string | null>(null)
  const [editPet, setEditPet] = useState<{
    name: string;
    species: PetSpecies;
    insuranceCompany: InsuranceCompany;
    filing_deadline_days?: number | '';
    monthly_premium?: number | '';
    deductible_per_claim?: number | '';
    coverage_start_date?: string;
    insurance_pays_percentage?: number | '';
    policyNumber?: string;
    healthy_paws_pet_id?: string;
    spot_account_number?: string;
    pumpkin_account_number?: string;
    figo_policy_number?: string;
  } | null>(null)
  const [newPetInsurer, setNewPetInsurer] = useState<string>('')
  const [editPetInsurer, setEditPetInsurer] = useState<string>('')
  const [customInsurerNameNew, setCustomInsurerNameNew] = useState('')
  const [customDeadlineNew, setCustomDeadlineNew] = useState<string>('')
  const [customInsurerNameEdit, setCustomInsurerNameEdit] = useState('')
  const [customDeadlineEdit, setCustomDeadlineEdit] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [authView, setAuthView] = useState<'login' | 'signup' | 'app'>('login')
  // Multi-pet extraction state
  const [multiExtracted, setMultiExtracted] = useState<MultiPetExtracted | null>(null)
  const [petMatches, setPetMatches] = useState<(string | null)[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [pendingMatchIndex, setPendingMatchIndex] = useState<number | null>(null)
  const petsSectionRef = useRef<HTMLDivElement | null>(null)
  const claimsSectionRef = useRef<HTMLDivElement | null>(null)
  const [claims, setClaims] = useState<any[]>([])
  const [dataRefreshToken, setDataRefreshToken] = useState(0)
  const [showClaims, setShowClaims] = useState(false)
  
  const [finPeriod, setFinPeriod] = useState<'all' | '2026' | '2025' | '2024' | 'last12'>('all')
  const [activeView, setActiveView] = useState<'app' | 'settings' | 'medications' | 'food' | 'admin'>('app')
  const [isAdmin, setIsAdmin] = useState(false)
  const [editingClaim, setEditingClaim] = useState<any | null>(null)
  const [editPetId, setEditPetId] = useState<string | null>(null)
  const [editServiceDate, setEditServiceDate] = useState('')
  const [editDiagnosis, setEditDiagnosis] = useState('')
  const [editVisitTitle, setEditVisitTitle] = useState('')
  const [editVisitNotes, setEditVisitNotes] = useState('')
  const [editItems, setEditItems] = useState<LineItem[]>([])
  const [editExpenseCat, setEditExpenseCat] = useState<'insured' | 'not_insured' | 'maybe_insured'>('insured')
  const [petSelectError, setPetSelectError] = useState(false)
  const [paidModalClaim, setPaidModalClaim] = useState<any | null>(null)
  const [paidAmount, setPaidAmount] = useState<string>('')
  const [paidDate, setPaidDate] = useState<string>(getLocalTodayYYYYMMDD())
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null) // null = not loaded yet
  const [successModal, setSuccessModal] = useState<null | {
    claimId: string | null
    petName: string
    species: string
    amount: number | null
    serviceDate: string | null
    insurance: string
    deadlineDate: string | null
    deadlineDays: number
  }>(null)
  // Medication linking state
  const [medSelectOpen, setMedSelectOpen] = useState(false)
  const [medicationsForPet, setMedicationsForPet] = useState<any[]>([])
  const [selectedMedicationIds, setSelectedMedicationIds] = useState<string[]>([])
  // Toast notifications
  function getLocalTodayYYYYMMDD() {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const [toast, setToast] = useState<{ message: string } | null>(null)
  const showToast = (message: string) => {
    setToast({ message })
    setTimeout(() => setToast(null), 2500)
  }
  const [createdClaimId, setCreatedClaimId] = useState<string | null>(null)
  const [showAddMedication, setShowAddMedication] = useState(false)
  // Medications refresh key - increment to force MedicationsDashboard to reload
  const [medicationsRefreshKey, setMedicationsRefreshKey] = useState(0)
  // SMS intro modal state
  const [showSmsIntroModal, setShowSmsIntroModal] = useState(false)
  const [hasPhone, setHasPhone] = useState<boolean | null>(null) // null = not checked yet
  // Claim auto-submission modal
  const [submittingClaim, setSubmittingClaim] = useState<any | null>(null)
  // Auto-Submit button animation state
  const [autoSubmitAnimating, setAutoSubmitAnimating] = useState<string | null>(null) // claim ID being animated
  // Pet photo upload state
  const [uploadingPhotoForPetId, setUploadingPhotoForPetId] = useState<string | null>(null)
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null)
  // DISABLED: Using add-to-homescreen library in index.html instead
  // const [showAddToHomeScreen, setShowAddToHomeScreen] = useState(false)

  // DISABLED: Using add-to-homescreen library in index.html instead
  // useEffect(() => {
  //   const urlParams = new URLSearchParams(window.location.search)
  //   if (urlParams.get('test-homescreen') === 'true') {
  //     setShowAddToHomeScreen(true)
  //   }
  // }, [])

  // Force re-render when extracted data changes - fix for mobile Safari
  useEffect(() => {
    if (extracted) {
      // Force a repaint on mobile Safari to ensure form fields update
      requestAnimationFrame(() => {
        // Trigger a layout recalculation
        document.body.offsetHeight // eslint-disable-line no-unused-expressions
      })
    }
  }, [extracted])

  // Auto-populate Visit Title when extracted data arrives
  useEffect(() => {
    console.log('[VISIT TITLE DEBUG] useEffect triggered', {
      extracted,
      diagnosis: extracted?.diagnosis,
      currentVisitTitle: visitTitle
    })
    if (extracted) {
      // Use extracted diagnosis if available, otherwise default to "Vet visit"
      const title = extracted.diagnosis?.trim() || 'Vet visit'
      console.log('[VISIT TITLE DEBUG] Setting visitTitle to:', title)
      setVisitTitle(title)
    }
  }, [extracted])
  // Onboarding photo tooltip
  const [showPhotoTooltip, setShowPhotoTooltip] = useState(false)

  // --- Name similarity helpers for auto-suggestions ---
  const normalizeName = (s: string): string => s.trim().toLowerCase()
  const levenshtein = (a: string, b: string): number => {
    const s = normalizeName(a)
    const t = normalizeName(b)
    const m = s.length
    const n = t.length
    if (m === 0) return n
    if (n === 0) return m
    const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) d[i][0] = i
    for (let j = 0; j <= n; j++) d[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1
        d[i][j] = Math.min(
          d[i - 1][j] + 1,      // deletion
          d[i][j - 1] + 1,      // insertion
          d[i - 1][j - 1] + cost // substitution
        )
      }
    }
    return d[m][n]
  }
  const nameSimilarity = (a: string, b: string): number => {
    const s = normalizeName(a)
    const t = normalizeName(b)
    if (!s || !t) return 0
    if (s === t) return 1
    if (s.includes(t) || t.includes(s)) return 0.92
    const dist = levenshtein(s, t)
    const maxLen = Math.max(s.length, t.length)
    return 1 - dist / (maxLen || 1)
  }
  const getSuggestedMatches = (groups: ExtractedPetGroup[], profiles: PetProfile[]): (string | null)[] => {
    const result: (string | null)[] = Array(groups.length).fill(null)
    const used = new Set<string>()
    groups.forEach((g, idx) => {
      const ranked = profiles
        .map((p) => ({ id: p.id, score: nameSimilarity(g.petName || '', p.name || '') }))
        .sort((a, b) => b.score - a.score)
      const best = ranked.find((r) => r.score >= 0.8 && !used.has(r.id))
      if (best) {
        result[idx] = best.id
        used.add(best.id)
      }
    })
    return result
  }

  useEffect(() => {
    // Debug: initial auth getSession check
    try { console.log('[auth] calling getSession()') } catch {}
    supabase.auth.getSession().then(async ({ data }) => {
      try { console.log('[auth] getSession() result:', { hasSession: Boolean(data?.session), userId: data?.session?.user?.id || null }) } catch {}
      const s = data.session
      if (s?.user) {
        setUserEmail(s.user.email ?? null)
        setUserId(s.user.id)
        setAuthView('app')
        dbEnsureProfile(s.user.id, s.user.email ?? null).catch(() => {})
        try {
          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
          updateUserTimezone(userTimezone).catch(() => {})
        } catch {}
        try { console.log('[auth] calling dbLoadPets for user:', s.user.id) } catch {}
        // Load pets and profile to check onboarding status
        Promise.all([
          dbLoadPets(s.user.id),
          supabase.from('profiles').select('onboarding_complete').eq('id', s.user.id).single()
        ]).then(([petsData, profileData]) => {
          setPets(petsData)
          const completed = profileData.data?.onboarding_complete ?? false
          setOnboardingComplete(completed)
          // Only show onboarding if no pets AND onboarding not completed
          if ((petsData || []).length === 0 && !completed) {
            setShowOnboarding(true)
          }
        }).catch((err) => {
          console.error('[auth] dbLoadPets failed:', err)
          setPets([])
        })
        listClaims(s.user.id).then(setClaims).catch((err) => { console.error('[auth] listClaims failed:', err); setClaims([]) })
      } else {
        try { console.log('[auth] getSession() no session found - showing login') } catch {}
        setAuthView('login')
      }
    }).catch((error) => {
      try { console.error('[auth] getSession() error:', error) } catch {}
      setAuthView('login')
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      try { console.log('[auth] onAuthStateChange:', { event, hasSession: Boolean(session), userId: session?.user?.id || null }) } catch {}
      if (session?.user) {
        setUserEmail(session.user.email ?? null)
        setUserId(session.user.id)
        setAuthView('app')
        dbEnsureProfile(session.user.id, session.user.email ?? null).catch(() => {})

        // Check for pending SMS consent from signup
        try {
          const pendingConsent = localStorage.getItem('pending_sms_consent')
          if (pendingConsent) {
            console.log('[auth] Found pending SMS consent, saving to database...')
            const consentData = JSON.parse(pendingConsent)

            // Fetch IP address
            let ipAddress = null
            try {
              const ipResponse = await fetch('https://api.ipify.org?format=json')
              const ipData = await ipResponse.json()
              ipAddress = ipData.ip
              console.log('[auth] IP address fetched:', ipAddress)
            } catch (ipErr) {
              console.log('[auth] Could not fetch IP address:', ipErr)
            }

            const insertData = {
              user_id: session.user.id,
              phone_number: consentData.phone_number,
              consented: consentData.consented,
              consent_text: consentData.consent_text,
              ip_address: ipAddress
            }
            console.log('[auth] Inserting SMS consent data:', insertData)

            const { data: insertResult, error: consentError } = await supabase
              .from('sms_consent')
              .insert(insertData)
              .select()

            if (consentError) {
              console.error('[auth] Failed to save SMS consent:', consentError)
              console.error('[auth] Consent error details:', JSON.stringify(consentError, null, 2))
            } else {
              console.log('[auth] SMS consent saved successfully!', insertResult)
              // Clear pending consent from localStorage
              localStorage.removeItem('pending_sms_consent')
              console.log('[auth] Cleared pending SMS consent from localStorage')
            }
          }
        } catch (err) {
          console.error('[auth] Error processing pending SMS consent:', err)
        }

        try {
          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
          updateUserTimezone(userTimezone).catch(() => {})
        } catch {}
        try { console.log('[auth] calling dbLoadPets for user:', session.user.id) } catch {}
        // Load pets and profile to check onboarding status
        Promise.all([
          dbLoadPets(session.user.id),
          supabase.from('profiles').select('onboarding_complete').eq('id', session.user.id).single()
        ]).then(([petsData, profileData]) => {
          setPets(petsData)
          const completed = profileData.data?.onboarding_complete ?? false
          setOnboardingComplete(completed)
          // Only show onboarding if no pets AND onboarding not completed
          if ((petsData || []).length === 0 && !completed) {
            setShowOnboarding(true)
          }
        }).catch((err) => {
          console.error('[auth] dbLoadPets failed:', err)
          setPets([])
        })
        listClaims(session.user.id).then(setClaims).catch((err) => { console.error('[auth] listClaims failed:', err); setClaims([]) })
      } else {
        setUserEmail(null)
        setUserId(null)
        setPets([])
        try { console.log('[auth] onAuthStateChange - signed out, clearing state') } catch {}
        setAuthView('login')
      }
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  // Load admin status from profile
  useEffect(() => {
    if (!userId) {
      setIsAdmin(false)
      return
    }

    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('[admin] Failed to load admin status:', error)
          setIsAdmin(false)
          return
        }
        setIsAdmin(data?.is_admin === true)
      })
      .catch(() => setIsAdmin(false))
  }, [userId])

  // Auto-select pet when there is exactly one
  useEffect(() => {
    if (pets && pets.length === 1) {
      setSelectedPetId((prev) => prev || pets[0].id)
    }
  }, [pets])

  // Photo upload tooltip after onboarding completion
  useEffect(() => {
    const justCompleted = localStorage.getItem('justCompletedOnboarding')
    if (justCompleted === 'true' && pets && pets.length > 0) {
      // Check if any pet doesn't have a photo
      const hasPetWithoutPhoto = pets.some(p => !p.photo_url)
      if (hasPetWithoutPhoto) {
        setShowPhotoTooltip(true)

        // Auto-dismiss after 5 seconds
        const timer = setTimeout(() => {
          setShowPhotoTooltip(false)
          localStorage.removeItem('justCompletedOnboarding')
        }, 5000)

        // Also dismiss on click anywhere
        const handleClick = () => {
          setShowPhotoTooltip(false)
          localStorage.removeItem('justCompletedOnboarding')
          document.removeEventListener('click', handleClick)
        }
        document.addEventListener('click', handleClick)

        return () => {
          clearTimeout(timer)
          document.removeEventListener('click', handleClick)
        }
      } else {
        // All pets have photos, clear the flag
        localStorage.removeItem('justCompletedOnboarding')
      }
    }
  }, [pets])

  // NOTE: /dose/:code route is now handled at the top of App() as a standalone page
  // No useEffect needed - it returns early before rendering the main app

  // Financial period filter - always defaults to 'all' so users see ALL bills immediately
  // Users can then filter down to specific years if they want
  // NOTE: We intentionally DO NOT persist this filter to localStorage
  // because users should see all their bills by default every time they open the app

  // One-time cleanup: Remove old localStorage filter if it exists
  useEffect(() => {
    try {
      localStorage.removeItem('pch.finPeriod')
    } catch {}
  }, [])

  // Bump a refresh token when core datasets change so child summaries can refetch
  useEffect(() => {
    setDataRefreshToken((t) => {
      console.log('[App] 🔄 Incrementing dataRefreshToken:', t, '→', t + 1, '| pets count:', pets.length)
      return t + 1
    })
  }, [claims, pets, finPeriod])

  useEffect(() => {
    if (!editingClaim) return
    setEditPetId(editingClaim.pet_id || null)
    setEditServiceDate(editingClaim.service_date || '')
    setEditVisitTitle(editingClaim.visit_title || '')
    setEditDiagnosis(editingClaim.diagnosis || '')
    setEditVisitNotes(editingClaim.visit_notes || '')
    setEditItems(Array.isArray(editingClaim.line_items) ? editingClaim.line_items : [])
    setEditExpenseCat((editingClaim.expense_category as any) || 'insured')
  }, [editingClaim])

  const addPet = () => {
    const trimmedName = newPet.name.trim()
    if (!trimmedName) return
    // Treat empty string or "Not Insured" as no insurance (insurance is optional)
    if (!newPetInsurer || newPetInsurer === 'Not Insured' || newPetInsurer === '— Select —') {
      newPet.insuranceCompany = '' as any
      newPet.filing_deadline_days = ''
      newPet.policyNumber = ''
    } else if (newPetInsurer === 'Custom Insurance') {
      const nm = customInsurerNameNew.trim()
      const dd = Number(customDeadlineNew)
      if (!nm) { alert('Enter custom insurance company name'); return }
      if (!Number.isFinite(dd) || dd < 1 || dd > 365) { alert('Deadline must be 1-365 days'); return }
      newPet.insuranceCompany = nm as any
      newPet.filing_deadline_days = dd
    } else {
      // Convert display value to database value (strip deadline label)
      newPet.insuranceCompany = getInsuranceValue(newPetInsurer) as any
      newPet.filing_deadline_days = getDeadlineDays(getInsuranceValue(newPetInsurer)) || 90
    }
    // DEBUG: Log the form values BEFORE creating the pet object
    console.log('🔍 [addPet] STEP 1 - Form values from newPet:')
    console.log('  - newPet.spot_account_number:', newPet.spot_account_number)
    console.log('  - After trim:', (newPet.spot_account_number || '').trim())
    console.log('  - Final value:', (newPet.spot_account_number || '').trim() || null)

    const id = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()))
    const created: PetProfile = {
      id,
      name: trimmedName,
      species: newPet.species,
      insuranceCompany: newPet.insuranceCompany || '',
      policyNumber: (newPet.policyNumber || '').trim(),
      ownerName: '',
      ownerPhone: '',
      filing_deadline_days: (newPet as any).filing_deadline_days as any,
      monthly_premium: newPet.monthly_premium === '' ? null : Number(newPet.monthly_premium),
      deductible_per_claim: newPet.deductible_per_claim === '' ? null : Number(newPet.deductible_per_claim),
      insurance_pays_percentage: newPet.insurance_pays_percentage === '' ? null : (Number(newPet.insurance_pays_percentage) / 100),
      annual_coverage_limit: null,
      coverage_start_date: newPet.coverage_start_date || null,
      healthy_paws_pet_id: (newPet.healthy_paws_pet_id || '').trim() || null,
      spot_account_number: (newPet.spot_account_number || '').trim() || null,
      figo_policy_number: (newPet.figo_policy_number || '').trim() || null,
    }

    // DEBUG: Log the created pet object AFTER creation
    console.log('🔍 [addPet] STEP 2 - Created PetProfile object:')
    console.log('  - created.spot_account_number:', created.spot_account_number)
    console.log('  - Full created object:', created)
    const updated = [...pets, created]
    setPets(updated)
    if (userId) {
      console.log('🔍 [addPet] STEP 3 - Calling dbUpsertPet with userId:', userId)
      dbUpsertPet(userId, created)
        .then(() => {
          console.log('🔍 [addPet] STEP 4 - dbUpsertPet SUCCESS')
        })
        .catch((e) => {
          console.error('🔍 [addPet] STEP 4 - dbUpsertPet ERROR:', e)
        })
    } else {
      console.log('🔍 [addPet] STEP 3 - SKIPPED dbUpsertPet (no userId)')
    }
    // If we were adding a pet for a pending match, set it
    if (pendingMatchIndex !== null) {
      const next = [...petMatches]
      next[pendingMatchIndex] = id
      setPetMatches(next)
      setPendingMatchIndex(null)
    } else {
      setSelectedPetId(id)
    }
    setAddingPet(false)
    setNewPet({ name: '', species: 'dog', insuranceCompany: '', filing_deadline_days: '', monthly_premium: '', deductible_per_claim: '', insurance_pays_percentage: '', coverage_start_date: '', policyNumber: '', healthy_paws_pet_id: '', spot_account_number: '', figo_policy_number: '' })
    setNewPetInsurer('')
    setCustomInsurerNameNew('')
    setCustomDeadlineNew('')
  }

  const startEditPet = (pet: PetProfile) => {
    setEditingPetId(pet.id)
    setEditPet({
      name: pet.name,
      species: pet.species,
      insuranceCompany: pet.insuranceCompany,
      filing_deadline_days: (pet as any).filing_deadline_days || '',
      monthly_premium: (pet as any).monthly_premium ?? '',
      deductible_per_claim: (pet as any).deductible_per_claim ?? '',
      coverage_start_date: (pet as any).coverage_start_date || '',
      insurance_pays_percentage: (pet as any).insurance_pays_percentage != null ? Math.round(Number((pet as any).insurance_pays_percentage) * 100) : '',
      policyNumber: pet.policyNumber || '',
      healthy_paws_pet_id: (pet as any).healthy_paws_pet_id || '',
      spot_account_number: (pet as any).spot_account_number || '',
      pumpkin_account_number: (pet as any).pumpkin_account_number || '',
      figo_policy_number: (pet as any).figo_policy_number || ''
    })
    // Set dropdown to display value
    if (!pet.insuranceCompany || pet.insuranceCompany === '') {
      setEditPetInsurer('Not Insured')
    } else {
      setEditPetInsurer(getInsuranceDisplay(pet.insuranceCompany))
    }
  }

  const saveEdit = async () => {
    console.log('[saveEdit] 🚀 Save started', { editingPetId, editPet })
    if (!editingPetId || !editPet) return
    // Treat empty string or "Not Insured" as no insurance (insurance is optional)
    let finalCompany = ''
    let finalDays: number | '' = ''
    if (!editPetInsurer || editPetInsurer === 'Not Insured' || editPetInsurer === '— Select —') {
      finalCompany = ''
      finalDays = ''
    } else if (editPetInsurer === 'Custom Insurance') {
      const nm = customInsurerNameEdit.trim()
      const dd = Number(customDeadlineEdit)
      if (!nm) { alert('Enter custom insurance company name'); return }
      if (!Number.isFinite(dd) || dd < 1 || dd > 365) { alert('Deadline must be 1-365 days'); return }
      finalCompany = nm
      finalDays = dd
    } else {
      // Convert display value to database value
      finalCompany = getInsuranceValue(editPetInsurer)
      finalDays = getDeadlineDays(finalCompany) || 90
    }
    const updated = pets.map((p) =>
      p.id === editingPetId
        ? {
            ...p,
            name: editPet.name.trim(),
            species: editPet.species,
            insuranceCompany: finalCompany as any,
            policyNumber: (editPet.policyNumber || '').trim(),
            ownerName: p.ownerName || '',
            ownerPhone: p.ownerPhone || '',
            filing_deadline_days: finalDays as any,
            monthly_premium: editPet.monthly_premium === '' ? null : Number(editPet.monthly_premium),
            deductible_per_claim: editPet.deductible_per_claim === '' ? null : Number(editPet.deductible_per_claim),
            coverage_start_date: editPet.coverage_start_date || null,
            insurance_pays_percentage: editPet.insurance_pays_percentage === '' ? null : (Number(editPet.insurance_pays_percentage) / 100),
            annual_coverage_limit: p.annual_coverage_limit ?? null,
            healthy_paws_pet_id: (editPet as any).healthy_paws_pet_id || null,
            spot_account_number: (editPet as any).spot_account_number || null,
            pumpkin_account_number: (editPet as any).pumpkin_account_number || null,
            figo_policy_number: (editPet as any).figo_policy_number || null,
          }
        : p,
    )

    const petToSave = updated.find(p => p.id === editingPetId)
    console.log('[saveEdit] 📝 Pet data to save:', petToSave)

    if (userId) {
      const toSave = updated.find(p => p.id === editingPetId)
      if (toSave) {
        try {
          console.log('[saveEdit] 💾 Starting dbUpsertPet...')
          await dbUpsertPet(userId, toSave)
          console.log('[saveEdit] ✅ dbUpsertPet complete')

          // Refresh pets list so Financial Summary updates immediately
          console.log('[saveEdit] 🔄 Starting dbLoadPets...')
          const refreshedPets = await dbLoadPets(userId)
          console.log('[saveEdit] 📦 dbLoadPets complete, got', refreshedPets.length, 'pets')
          console.log('[saveEdit] 📊 Refreshed pet data:', refreshedPets.find(p => p.id === editingPetId))

          setPets(refreshedPets)
          console.log('[saveEdit] ✅ State updated with fresh DB data')

          // CRITICAL FIX: Directly increment dataRefreshToken to force FinancialSummary refresh
          // Don't rely on the useEffect([pets]) to trigger, because React might not detect
          // the pets array change if the data is structurally identical
          setDataRefreshToken((t) => {
            console.log('[saveEdit] 🔄 Forcing dataRefreshToken increment:', t, '→', t + 1)
            return t + 1
          })
          console.log('[saveEdit] ✅ Financial Summary refresh triggered')
        } catch (e) {
          console.error('[saveEdit] ❌ Error:', e)
          // On error, update with optimistic local data as fallback
          setPets(updated)
        }
      }
    } else {
      // No userId - just update local state
      setPets(updated)
    }
    setEditingPetId(null)
    setEditPet(null)
    console.log('[saveEdit] 🏁 Save complete')
  }

  const handlePick = () => inputRef.current?.click()

  const handleLogout = async () => {
    try { console.log('[auth] signOut() called') } catch {}
    const { error } = await supabase.auth.signOut()
    try { console.log('[auth] signOut() result:', error || null) } catch {}
    try {
      const { data } = await supabase.auth.getSession()
      console.log('[auth] post-signOut getSession():', { hasSession: Boolean(data?.session) })
    } catch {}
  }

  const processFile = (file: File | undefined | null) => {
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] ========== processFile CALLED ==========')
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] file:', file)
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] file type:', file?.type)
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] file size:', file?.size)

    if (!file) {
      // eslint-disable-next-line no-console
      console.log('[MOBILE DEBUG] No file provided, setting selectedFile to null')
      setSelectedFile(null)
      return
    }
    const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf'
    if (!isAllowed) {
      // eslint-disable-next-line no-console
      console.log('[MOBILE DEBUG] File type not allowed:', file.type)
      setSelectedFile(null)
      return
    }
    const isImage = file.type.startsWith('image/')
    const objectUrl = isImage ? URL.createObjectURL(file) : undefined
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] Setting selectedFile:', { fileName: file.name, fileType: file.type, isImage, objectUrl })
    setSelectedFile({ file, objectUrl })
    setExtracted(null)
    setErrorMessage(null)
  }

  const handleChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>((e) => {
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] ========== handleChange CALLED ==========')
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] e.target.files:', e.target.files)
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] e.target.files?.[0]:', e.target.files?.[0])
    processFile(e.target.files?.[0])
    // Reset input value to allow selecting the same file again
    e.target.value = ''
  }, [])

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const onDragEnter: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const dt = e.dataTransfer
    if (!dt) return
    const file = dt.files?.[0] ?? null
    processFile(file)
  }

  const fileSizeLabel = useMemo(() => {
    if (!selectedFile) return ''
    const { size } = selectedFile.file
    const KB = 1024
    const MB = KB * 1024
    if (size < KB) return `${size} B`
    if (size < MB) return `${(size / KB).toFixed(1)} KB`
    return `${(size / MB).toFixed(2)} MB`
  }, [selectedFile])

  const normalizeExtracted = (raw: any): ExtractedBill => {
    // Accept both camelCase and snake_case per prompt
    const clinicName = typeof raw?.clinicName === 'string' ? raw.clinicName : (typeof raw?.clinic_name === 'string' ? raw.clinic_name : '')
    const clinicAddress = typeof raw?.clinicAddress === 'string' ? raw.clinicAddress : (typeof raw?.clinic_address === 'string' ? raw.clinic_address : '')
    const clinicPhone = typeof raw?.clinicPhone === 'string' ? raw.clinicPhone : (typeof raw?.clinic_phone === 'string' ? raw.clinic_phone : undefined)
    const petName = typeof raw?.petName === 'string' ? raw.petName : (typeof raw?.pet_name === 'string' ? raw.pet_name : '')
    const serviceDate = typeof raw?.dateOfService === 'string' ? raw.dateOfService : (typeof raw?.service_date === 'string' ? raw.service_date : '')
    const totalAmount = typeof raw?.totalAmount === 'string' ? raw.totalAmount : (raw?.total_amount != null ? String(raw.total_amount) : '')
    const invoiceNumber = typeof raw?.invoiceNumber === 'string' ? raw.invoiceNumber : (typeof raw?.invoice_number === 'string' ? raw.invoice_number : undefined)

    const itemsSrc = Array.isArray(raw?.lineItems) ? raw.lineItems : (Array.isArray(raw?.line_items) ? raw.line_items : [])
    const lineItems: LineItem[] = itemsSrc.map((it: any) => ({
      description: typeof it?.description === 'string' ? it.description : '',
      amount: typeof it?.amount === 'string' ? it.amount : (it?.amount != null ? String(it.amount) : ''),
    }))

    return {
      clinicName,
      clinicAddress,
      clinicPhone,
      petName,
      dateOfService: serviceDate,
      totalAmount,
      diagnosis: typeof raw?.diagnosis === 'string' ? raw.diagnosis : '',
      lineItems,
      invoiceNumber,
    }
  }

  const normalizeMultiExtracted = (raw: any): MultiPetExtracted | null => {
    if (!raw || !Array.isArray(raw.pets)) return null
    const pets: ExtractedPetGroup[] = raw.pets.map((p: any) => ({
      petName: typeof p?.petName === 'string' ? p.petName : '',
      petSpecies: typeof p?.petSpecies === 'string' ? p.petSpecies : undefined,
      lineItems: Array.isArray(p?.lineItems)
        ? p.lineItems.map((li: any) => ({
            description: typeof li?.description === 'string' ? li.description : '',
            amount: typeof li?.amount === 'string' ? li.amount : String(li?.amount ?? ''),
          }))
        : [],
      subtotal: typeof p?.subtotal === 'string' ? p.subtotal : undefined,
    }))
    return {
      clinicName: typeof raw?.clinicName === 'string' ? raw.clinicName : '',
      clinicAddress: typeof raw?.clinicAddress === 'string' ? raw.clinicAddress : '',
      clinicPhone: typeof raw?.clinicPhone === 'string' ? raw.clinicPhone : (typeof raw?.clinic_phone === 'string' ? raw.clinic_phone : undefined),
      dateOfService: typeof raw?.dateOfService === 'string' ? raw.dateOfService : '',
      diagnosis: typeof raw?.diagnosis === 'string' ? raw.diagnosis : '',
      pets,
      invoiceNumber: typeof raw?.invoiceNumber === 'string' ? raw.invoiceNumber : undefined,
    }
  }

  const parseAmountToNumber = (s: string): number => {
    const cleaned = (s || '').replace(/[^0-9.\-]/g, '')
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : 0
  }

  const computeSubtotal = (items: LineItem[]): string => {
    const total = items.reduce((sum, it) => sum + parseAmountToNumber(it.amount), 0)
    return `$${total.toFixed(2)}`
  }

  const uploadClaimPdf = async (uid: string, claimId: string, blob: Blob): Promise<string | null> => {
    try {
      console.log('[uploadClaimPdf] Starting upload...', {
        uid,
        claimId,
        blobSize: blob.size,
        blobType: blob.type,
        isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      })

      // Convert blob to File if needed for better mobile compatibility
      let fileToUpload: File | Blob = blob
      if (!(blob instanceof File)) {
        console.log('[uploadClaimPdf] Converting Blob to File for better mobile compatibility')
        fileToUpload = new File([blob], `${claimId}.pdf`, { type: 'application/pdf' })
      }

      const path = `${uid}/${claimId}.pdf`
      console.log('[uploadClaimPdf] Uploading to path:', path)

      const { error } = await supabase.storage.from('claim-pdfs').upload(path, fileToUpload, {
        upsert: true,
        contentType: 'application/pdf'
      })

      if (error) {
        console.error('[uploadClaimPdf] ❌ Supabase storage error:', error)
        throw new Error(`Storage upload failed: ${error.message}`)
      }

      console.log('[uploadClaimPdf] ✅ Storage upload successful, updating claim record...')

      const updateResult = await updateClaim(claimId, { pdf_path: path })
      console.log('[uploadClaimPdf] ✅ Claim record updated with pdf_path:', path, 'Result:', updateResult)

      // Verify the update worked
      const { data: verifyData, error: verifyError } = await supabase
        .from('claims')
        .select('pdf_path')
        .eq('id', claimId)
        .single()

      if (verifyError) {
        console.error('[uploadClaimPdf] ⚠️  Could not verify pdf_path update:', verifyError)
      } else if (verifyData?.pdf_path !== path) {
        console.error('[uploadClaimPdf] ❌ pdf_path verification FAILED - expected:', path, 'got:', verifyData?.pdf_path)
        throw new Error('Failed to update claim record with pdf_path')
      } else {
        console.log('[uploadClaimPdf] ✅ Verified pdf_path was saved correctly:', verifyData.pdf_path)
      }

      return path
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[uploadClaimPdf] ❌ CRITICAL ERROR - Invoice will NOT be attached:', e)
      // Re-throw so caller knows upload failed
      throw e
    }
  }

  // Pet photo upload
  const uploadPetPhoto = async (petId: string, file: File): Promise<void> => {
    if (!userId) {
      setPhotoUploadError('Please log in to upload photos')
      return
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024 // 5MB in bytes
    if (file.size > maxSize) {
      setPhotoUploadError('Photo must be smaller than 5MB')
      return
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg']
    if (!validTypes.includes(file.type)) {
      setPhotoUploadError('Please upload a PNG or JPEG image')
      return
    }

    setUploadingPhotoForPetId(petId)
    setPhotoUploadError(null)

    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop() || 'jpg'
      const timestamp = Date.now()
      const path = `${userId}/${petId}-${timestamp}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('pet-photos')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('pet-photos')
        .getPublicUrl(path)

      if (!urlData?.publicUrl) throw new Error('Failed to get public URL')

      // Update pet record with photo_url
      const pet = pets.find(p => p.id === petId)
      if (!pet) throw new Error('Pet not found')

      const updatedPet = { ...pet, photo_url: urlData.publicUrl }
      await dbUpsertPet(userId, updatedPet)

      // Refresh pets list
      const refreshedPets = await dbLoadPets(userId)
      setPets(refreshedPets)

      showToast('Photo uploaded successfully!')
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[uploadPetPhoto] error', e)
      setPhotoUploadError(e?.message || 'Failed to upload photo. Please try again.')
    } finally {
      setUploadingPhotoForPetId(null)
    }
  }

  const handlePetPhotoSelect = async (petId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await uploadPetPhoto(petId, file)
    // Reset input so same file can be selected again
    event.target.value = ''
  }

  // Filing deadline helpers
  const [showDeadlineHelp, setShowDeadlineHelp] = useState(false)
  const parseServiceDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const getDaysSince = (dateStr: string | undefined): number | null => {
    const d = parseServiceDate(dateStr)
    if (!d) return null
    const now = new Date()
    const ms = now.getTime() - d.getTime()
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))
    return days < 0 ? 0 : days
  }
  const getUrgency = (days: number | null): { color: string; msg: string } => {
    if (days === null) return { color: 'border-slate-300 bg-white', msg: '' }
    if (days <= 30) return { color: 'border-emerald-300 bg-emerald-50', msg: "You're filing promptly - great!" }
    if (days <= 60) return { color: 'border-yellow-300 bg-yellow-50', msg: '⚠️ Check your deadline soon' }
    if (days <= 90) return { color: 'border-orange-300 bg-orange-50', msg: '⚠️ Submit this bill immediately' }
    return { color: 'border-red-300 bg-red-50', msg: '🚨 URGENT - You may be past your deadline!' }
  }

  const handleProcess = async () => {
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] ========== handleProcess CALLED ==========')
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] selectedFile:', selectedFile)
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] typeof selectedFile:', typeof selectedFile)
    // eslint-disable-next-line no-console
    console.log('[MOBILE DEBUG] selectedFile?.file:', selectedFile?.file)

    if (!selectedFile) {
      // eslint-disable-next-line no-console
      console.log('[MOBILE DEBUG] ❌ EARLY RETURN - No selectedFile!')
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)
    try {
      // eslint-disable-next-line no-console
      console.log('[extract] starting server-side extraction, file type:', selectedFile.file.type)
      // eslint-disable-next-line no-console
      console.log('[extract] file size:', selectedFile.file.size)
      // eslint-disable-next-line no-console
      console.log('[extract] file name:', selectedFile.file.name)
      const apiBase = import.meta.env.DEV ? 'http://localhost:8787' : 'https://pet-claim-helper.onrender.com'
      const form = new FormData()
      form.append('file', selectedFile.file)
      const controller = new AbortController()
      const timeoutMs = 90_000
      const timeoutId = setTimeout(() => { try { controller.abort() } catch {} }, timeoutMs)
      const resp = await fetch(`${apiBase}/api/extract-pdf`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Server error (${resp.status})`)
      }
      const json = await resp.json()
      // eslint-disable-next-line no-console
      console.log('[MOBILE DEBUG] Full JSON response:', JSON.stringify(json, null, 2))
      if (!json || json.ok !== true || !json.data) {
        // eslint-disable-next-line no-console
        console.error('[extract] bad response shape', json)
        throw new Error('Invalid extraction response')
      }
      const parsed: any = json.data
      // eslint-disable-next-line no-console
      console.log('[MOBILE DEBUG] Parsed data from server:', JSON.stringify(parsed, null, 2))
      if (!parsed) {
        // eslint-disable-next-line no-console
        console.error('[extract] empty parsed data from server response')
        throw new Error('Could not parse JSON from server response.')
      }

      // Try multi-pet first
      const maybeMulti = normalizeMultiExtracted(parsed)
      if (maybeMulti && maybeMulti.pets.length > 1) {
        // eslint-disable-next-line no-console
        console.log('[MOBILE DEBUG] Multi-pet extraction detected:', maybeMulti)
        setMultiExtracted(maybeMulti)
        setExtracted(null)
        // Auto-suggest matches by name similarity
        const suggestions = getSuggestedMatches(maybeMulti.pets, pets)
        setPetMatches(suggestions)
        return
      }

      // Fallback to single pet
      const normalized = normalizeExtracted(parsed)
      // eslint-disable-next-line no-console
      console.log('[MOBILE DEBUG] Normalized extraction result:', JSON.stringify(normalized, null, 2))
      console.log('[VISIT TITLE DEBUG] Extracted diagnosis value:', normalized.diagnosis)
      if (selectedPet) {
        normalized.petName = selectedPet.name
      }
      // eslint-disable-next-line no-console
      console.log('[MOBILE DEBUG] Final extraction being set to state:', JSON.stringify(normalized, null, 2))
      console.log('[VISIT TITLE DEBUG] About to call setExtracted with diagnosis:', normalized.diagnosis)
      setExtracted(normalized)
      setMultiExtracted(null)
    } catch (err: any) {
      // Classify error for clearer UX
      const message = String(err?.message || '')
      const name = String(err?.name || '')
      const isAbort = name === 'AbortError' || /aborted|timeout/i.test(message)
      const isNetwork = /NetworkError|Failed to fetch|TypeError: Failed to fetch/i.test(message)
      const apiMsg = (err?.error && (err.error.message || err.error?.error?.message)) || message

      if (isAbort) {
        setErrorMessage('Extraction timed out. Mobile networks can be slow — please try again. We now wait up to 90 seconds.')
      } else if (isNetwork) {
        setErrorMessage('Network error during extraction. Please check your connection and try again.')
      } else {
        setErrorMessage(apiMsg || 'AI extraction failed. Please try again.')
      }
      // eslint-disable-next-line no-console
      console.error('[extract] error:', { name: err?.name, message: err?.message, cause: err?.cause })
      // Fallback: open a blank editable claim form so the user can enter manually
      const blank: ExtractedBill = {
        clinicName: '',
        clinicAddress: '',
        clinicPhone: '',
        petName: selectedPet ? selectedPet.name : '',
        dateOfService: '',
        totalAmount: '',
        diagnosis: '',
        lineItems: [],
      }
      setExtracted(blank)
      setMultiExtracted(null)
    } finally {
      setIsProcessing(false)
    }
  }

  const getDeadlineDays = (c: any): number => {
    // Claims have a joined 'pets' object with pet data including filing_deadline_days
    const petDeadline = c.pets?.filing_deadline_days
    return typeof petDeadline === 'number' && petDeadline > 0 ? petDeadline : 90
  }
  const getServiceDate = (c: any): Date | null => {
    if (!c.service_date) return null
    // Parse YYYY-MM-DD as local date to avoid timezone shift
    const m = String(c.service_date).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3])
    const dt = new Date(y, mo, d)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  const getDaysRemaining = (c: any): number | null => {
    const svc = getServiceDate(c)
    if (!svc) return null
    const deadline = new Date(svc.getTime())
    deadline.setDate(deadline.getDate() + getDeadlineDays(c))
    const now = new Date()
    const remMs = deadline.getTime() - now.getTime()
    return Math.ceil(remMs / (1000 * 60 * 60 * 24))
  }
  const statusBadge = (status: string): { text: string; cls: string } => {
    const s = (status || 'not_submitted').toLowerCase()
    switch (s) {
      case 'filed': // legacy
      case 'submitted':
        return { text: 'Claim - Filed', cls: 'bg-emerald-50 text-emerald-700' }
      case 'approved':
        return { text: 'Approved', cls: 'bg-emerald-50 text-emerald-700' }
      case 'paid':
        return { text: 'Paid', cls: 'bg-emerald-50 text-emerald-700' }
      case 'denied':
        return { text: 'Denied', cls: 'bg-rose-50 text-rose-700' }
      case 'not_filed': // legacy
      default:
        return { text: 'Bill - Pending Submission', cls: 'bg-blue-50 text-blue-700' }
    }
  }
  const deadlineBadge = (c: any): { text: string; cls: string } => {
    const rem = getDaysRemaining(c)
    const stRaw = (c.filing_status || 'not_submitted').toLowerCase()
    const st = stRaw === 'filed' ? 'submitted' : stRaw

    // Different badges for different statuses
    if (st === 'denied') return { text: '❌ Claim Denied', cls: 'bg-red-100 text-red-800 border border-red-300 font-semibold' }
    if (st === 'approved') return { text: '✅ Approved', cls: 'bg-green-100 text-green-800 border border-green-200 font-semibold' }
    if (st === 'paid') return { text: '✅ Paid', cls: 'bg-green-100 text-green-800 border border-green-200 font-semibold' }
    if (st === 'submitted') return { text: '✓ Deadline met', cls: 'bg-green-100 text-green-800 border border-green-200' }
    
    // Deadline urgency for not submitted
    if (rem === null) return { text: 'No date', cls: 'bg-slate-100 text-slate-600' }
    if (rem < 0) return { text: '❌ DEADLINE PASSED - Submit now!', cls: 'bg-red-100 text-red-800 border border-red-300 font-bold' }
    if (rem < 5) return { text: `🔴 URGENT - ${rem} days`, cls: 'bg-red-100 text-red-800 border border-red-300 font-bold animate-pulse' }
    if (rem <= 14) return { text: `⚠️ Due soon - ${rem} days`, cls: 'bg-orange-100 text-orange-800 border border-orange-300 font-semibold' }
    if (rem <= 29) return { text: `⏰ Due soon - ${rem} days`, cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300 font-semibold' }
    return { text: `✅ Plenty of time - ${rem} days`, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
  }
  const fmtMoney = (n: number | null | undefined): string => {
    const val = typeof n === 'number' && Number.isFinite(n) ? n : 0
    return `$${val.toFixed(2)}`
  }
  const orderedClaims = useMemo(() => {
    const arr = [...claims]
    arr.sort((a, b) => {
      const da = getServiceDate(a)?.getTime() || 0
      const db = getServiceDate(b)?.getTime() || 0
      return db - da
    })
    return arr
  }, [claims])

  const claimsSummary = useMemo(() => {
    const total = claims.length
    const insured = claims.filter(c => String(c.expense_category || 'insured').toLowerCase() === 'insured')
    const notSubmitted = insured.filter(c => ['not_filed','not_submitted'].includes(String(c.filing_status || 'not_submitted').toLowerCase()))
    const notFiledSum = notSubmitted.reduce((s, c) => s + (Number(c.total_amount) || 0), 0)
    const filedPending = insured.filter(c => ['filed','submitted'].includes(String(c.filing_status || '').toLowerCase())).length
    const expiringSoon = notSubmitted.filter(c => {
      const rem = getDaysRemaining(c)
      return rem !== null && rem >= 1 && rem <= 14
    }).length
    return { total, notFiledCount: notSubmitted.length, notFiledSum, filedPending, expiringSoon }
  }, [claims])

  // Financial aggregates
  const financial = useMemo(() => {
    const parseYmdLocal = (iso?: string | null): Date | null => {
      if (!iso) return null
      const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return null
      const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3])
      const dt = new Date(y, mo, d)
      return Number.isNaN(dt.getTime()) ? null : dt
    }

    const monthsForPeriod = (startIso?: string | null): number => {
      const start = parseYmdLocal(startIso)
      if (!start) return 0
      const now = new Date()
      if (finPeriod === '2026') {
        const year = 2026
        if (start.getFullYear() > year) return 0
        const startMonth = start.getFullYear() < year ? 0 : start.getMonth()
        const endMonth = (now.getFullYear() === year) ? now.getMonth() : 11
        return Math.max(0, endMonth - startMonth + 1)
      }
      if (finPeriod === '2025') {
        const year = 2025
        if (start.getFullYear() > year) return 0
        const startMonth = start.getFullYear() < year ? 0 : start.getMonth()
        const endMonth = (now.getFullYear() === year) ? now.getMonth() : 11
        return Math.max(0, endMonth - startMonth + 1)
      }
      if (finPeriod === '2024') {
        const year = 2024
        if (start.getFullYear() > year) return 0
        const startMonth = start.getFullYear() < year ? 0 : start.getMonth()
        const endMonth = 11
        return Math.max(0, endMonth - startMonth + 1)
      }
      // last12 or all -> months from start to now inclusive
      const end = now
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      return Math.max(0, months)
    }
    // Filter claims by selected period
    const filtered = claims.filter((c) => {
      const d = c.service_date ? parseYmdLocal(c.service_date) : null
      if (!d || Number.isNaN(d.getTime())) return false
      if (finPeriod === 'all') return true
      if (finPeriod === '2026') return d.getFullYear() === 2026
      if (finPeriod === '2025') return d.getFullYear() === 2025
      if (finPeriod === '2024') return d.getFullYear() === 2024
      if (finPeriod === 'last12') {
        const now = new Date()
        const cutoff = new Date(now.getTime())
        cutoff.setDate(cutoff.getDate() - 365)
        return d >= cutoff && d <= now
      }
      return true
    })

    const byCategory = { insured: { sum: 0, count: 0 }, not_insured: { sum: 0, count: 0 }, maybe_insured: { sum: 0, count: 0 } } as Record<string, { sum: number; count: number }>
    let reimbursed = 0
    let awaiting = 0
    let outOfPocket = 0
    let grandTotal = 0
    const perPet: Record<string, { sum: number; count: number }> = {}
    let awaitingInsured = 0
    let periodSpent = 0
    let periodReimbursed = 0
    const today = new Date()
    let spentOnAllPets = 0
    let reimbursedPaidPeriod = 0
    // Components for consolidated Actual Cost
    let premiumsPaid = 0
    let deductiblesPaid = 0
    let coinsurancePaid = 0
    let nonInsuredTotal = 0
    let deniedTotal = 0
    let pendingTotal = 0
    let userSharePaidInsured = 0

    for (const c of filtered) {
      const amt = Number(c.total_amount || 0)
      const status = String(c.filing_status || 'not_filed').toLowerCase()
      const cat = (c.expense_category || 'insured') as 'insured' | 'not_insured' | 'maybe_insured'
      const svcDate = parseYmdLocal(c.service_date)
      grandTotal += amt
      byCategory[cat].sum += amt
      byCategory[cat].count += 1

      if (status === 'paid') {
        const paidAmt = Number((c as any).reimbursed_amount || 0)
        reimbursed += paidAmt
        if (cat === 'insured') {
          userSharePaidInsured += Math.max(0, amt - paidAmt)
        }
      } else if (status === 'filed' || status === 'approved') {
        awaiting += amt
      }
      if (status === 'denied' || cat === 'not_insured') outOfPocket += amt
      if (cat !== 'insured') nonInsuredTotal += amt
      if (status === 'denied' && cat === 'insured') deniedTotal += amt

      // Money Coming Back: approved claims only
      if (status === 'approved') awaitingInsured += amt

      if (svcDate && !Number.isNaN(svcDate.getTime())) {
        periodSpent += amt
        if (svcDate <= today) {
          spentOnAllPets += amt
          if (status === 'paid') {
            const paidAmt = Number((c as any).reimbursed_amount || 0)
            periodReimbursed += paidAmt
            reimbursedPaidPeriod += paidAmt
          }
        }
        // Pending sums are claims under review (submitted/approved/not_submitted) up to today
        if (svcDate <= today && status === 'submitted' && cat === 'insured') {
          pendingTotal += amt
        }
      }

      const petName = c.pets?.name || 'Unknown Pet'
      if (!perPet[petName]) perPet[petName] = { sum: 0, count: 0 }
      perPet[petName].sum += amt
      perPet[petName].count += 1
    }
    // Premiums: sum per pet for this period using monthly_premium
    for (const p of pets) {
      const monthly = Number((p as any).monthly_premium || 0)
      if (monthly > 0) premiumsPaid += monthly * monthsForPeriod((p as any).coverage_start_date || null)
    }
    // Deductibles + coinsurance from paid insured claims in period
    for (const c of filtered) {
      const status = String(c.filing_status || '').toLowerCase()
      const cat = String(c.expense_category || '').toLowerCase()
      if (status === 'paid' && cat === 'insured') {
        const bill = Number(c.total_amount || 0)
        const ded = Math.max(0, Number((c as any).deductible_applied) || 0)
        const reimb = Math.max(0, Number((c as any).reimbursed_amount) || 0)
        deductiblesPaid += ded
        coinsurancePaid += Math.max(0, bill - ded - reimb)
      }
    }
    const definiteTotal = premiumsPaid + nonInsuredTotal + userSharePaidInsured
    const netCostPeriod = Math.max(0, spentOnAllPets - reimbursedPaidPeriod)
    const periodSpentActual = definiteTotal
    return { byCategory, reimbursed, awaiting, outOfPocket, grandTotal, perPet, awaitingInsured, periodSpent: periodSpentActual, periodReimbursed, periodNet: definiteTotal, definiteTotal, pendingTotal, spentOnAllPets, reimbursedPaidPeriod, netCostPeriod }
  }, [claims, finPeriod])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-lg border border-slate-700">
            {toast.message}
          </div>
        </div>
      )}
      <header className="px-4 pt-2 pb-3 md:py-8 bg-gradient-to-b from-white/50 to-transparent dark:from-slate-900/50">
        <div className="mx-auto max-w-6xl">
          {/* Logo - centered and prominent */}
          <div className="flex flex-col items-center justify-center mb-1 md:mb-6">
            <img
              src="/pch-logo.png"
              alt="Pet Cost Helper"
              className="w-[70vw] max-w-[320px] md:w-[90vw] md:max-w-[500px] h-auto object-contain mt-1 mb-0 md:mt-0 md:mb-0"
            />

            {/* Auto-submission teaser banner - PRIME LOCATION - Only show if user cannot auto-submit yet */}
            {(() => {
              const hasProductionInsurer = pets.some(pet => {
                const insurer = pet.insuranceCompany?.toLowerCase() || ''
                return PRODUCTION_INSURERS.some(prod => insurer.includes(prod))
              })
              const isDemoAccount = userEmail && DEMO_ACCOUNTS.includes(userEmail.toLowerCase())

              // Hide banner if user has Pumpkin/Spot OR is a demo account
              if (hasProductionInsurer || isDemoAccount) return null

              return (
                <div className="w-full px-4 mt-4 mb-3 md:mt-6 md:mb-4 animate-fade-in">
                  <div className="max-w-3xl mx-auto">
                    <div className="relative bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-[2px] shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
                      <div className="bg-white dark:bg-gray-900 rounded-2xl px-6 py-4 md:px-8 md:py-5">
                        <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4">
                          <span className="text-3xl md:text-4xl animate-pulse">🚀</span>
                          <div className="text-center md:text-left">
                            <div className="font-bold text-lg md:text-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                              Coming Soon: Auto-Submit Claims
                            </div>
                            <div className="text-sm md:text-base text-gray-600 dark:text-gray-300 mt-1">
                              One-click submission. Track payments. Never miss deadlines.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            <div className="text-base md:text-lg font-bold text-gray-500 dark:text-gray-400 text-center max-w-xl px-4 leading-snug mt-1 mb-3 md:mt-0 md:mb-0">
              <div>Know what your pets actually cost you.</div>
            </div>
          </div>
          {/* Navigation row - unified for mobile and desktop */}
          <div className="flex items-center justify-center gap-2 md:gap-3 flex-wrap mt-2 md:mt-0">
            {authView === 'app' && (
              <button
                type="button"
                onClick={() => claimsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="relative inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-2 md:px-3 py-1.5 text-xs hover:shadow"
              >
                Bills ({claims.length})
                {claimsSummary.expiringSoon > 0 && (
                  <span className="ml-2 inline-block h-2 w-2 rounded-full bg-rose-500" aria-hidden />
                )}
              </button>
            )}
            {authView === 'app' && (
              <button
                type="button"
                onClick={() => setActiveView(v => v === 'app' ? 'settings' : 'app')}
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-2 md:px-3 py-1.5 text-xs hover:shadow"
              >
                ⚙️ Settings
              </button>
            )}
            {authView === 'app' && (
              <button
                type="button"
                onClick={async () => {
                  if (activeView === 'medications') {
                    setActiveView('app')
                  } else {
                    // Check if user has phone number before showing medications view
                    if (hasPhone === null && userId) {
                      const { data } = await supabase.from('profiles').select('phone').eq('id', userId).single()
                      const phone = data?.phone || null
                      setHasPhone(!!phone)
                      if (!phone) {
                        setShowSmsIntroModal(true)
                      }
                    } else if (hasPhone === false) {
                      setShowSmsIntroModal(true)
                    }
                    setActiveView('medications')
                  }
                }}
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-2 md:px-3 py-1.5 text-xs hover:shadow"
              >
                💊 Medications
              </button>
            )}
            {authView === 'app' && isAdmin && (
              <button
                type="button"
                onClick={() => setActiveView(v => v === 'admin' ? 'app' : 'admin')}
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-2 md:px-3 py-1.5 text-xs hover:shadow"
              >
                📊 Admin Dashboard
              </button>
            )}
            {authView === 'app' && (
              <a
                href={`mailto:support@petclaimhelper.com?subject=Pet Cost Helper Support Request&body=Hi Pet Cost Helper Team,%0D%0A%0D%0AI need help with:%0D%0A%0D%0A----%0D%0AUser: ${userEmail || 'Not logged in'}%0D%0AUser ID: ${userId || 'N/A'}`}
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-2 md:px-3 py-1.5 text-xs hover:shadow"
                title="Need help? Contact support"
              >
                💬 Contact Support
              </a>
            )}
            {userEmail && <span className="hidden sm:inline text-xs text-slate-600 dark:text-slate-300">Logged in as: {userEmail}</span>}
            {userEmail && (
              <button onClick={handleLogout} className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-2 md:px-3 py-1.5 text-xs hover:shadow">Logout</button>
            )}
          </div>
        </div>
      </header>

      <main className="px-6">
        {authView === 'app' && activeView === 'settings' && (
          <SettingsPage
            userId={userId}
            userEmail={userEmail}
            onClose={() => setActiveView('app')}
            onDefaultExpenseChange={(cat) => setExpenseCategory(cat)}
            onDefaultPeriodChange={(p) => setFinPeriod(p as any)}
          />
        )}
        {authView === 'app' && activeView === 'medications' && (
          <section className="mx-auto mt-8 max-w-6xl px-2">
            <MedicationsDashboard userId={userId} pets={pets} refreshKey={medicationsRefreshKey} />
          </section>
        )}
        {authView === 'app' && activeView === 'admin' && (
          <>
            {isAdmin ? (
              <AdminDashboard />
            ) : (
              <section className="mx-auto max-w-2xl mt-8">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h2 className="text-red-800 font-semibold text-lg">Access Denied</h2>
                  <p className="text-red-600 mt-2">You do not have admin privileges to access this page.</p>
                  <button
                    onClick={() => setActiveView('app')}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {authView !== 'app' && (
          <section className="mx-auto max-w-md mt-8">
            {/* Tabs - dramatically different styling */}
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => setAuthView('signup')}
                className={[
                  'flex-1 px-6 py-3 text-sm rounded-t-xl transition-all font-semibold',
                  authView === 'signup'
                    ? 'bg-teal-600 text-white shadow-lg scale-105'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                ].join(' ')}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>✨</span>
                  <span>Create Account</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAuthView('login')}
                className={[
                  'flex-1 px-6 py-3 text-sm rounded-t-xl transition-all font-semibold',
                  authView === 'login'
                    ? 'bg-emerald-600 text-white shadow-lg scale-105'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                ].join(' ')}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>👋</span>
                  <span>Sign In</span>
                </div>
              </button>
            </div>

            {/* Card with colored header */}
            <div className="rounded-2xl rounded-tl-none rounded-tr-none border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xl overflow-hidden">
              {/* Colored header bar - changes based on mode */}
              <div className={[
                'px-6 py-4 text-white font-semibold',
                authView === 'signup'
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-600'
                  : 'bg-gradient-to-r from-emerald-500 to-green-600'
              ].join(' ')}>
                <div className="flex items-center gap-2 text-base">
                  {authView === 'signup' ? (
                    <>
                      <span className="text-xl">🚀</span>
                      <span>Get Started - Create Your Account</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">🔑</span>
                      <span>Welcome Back!</span>
                    </>
                  )}
                </div>
              </div>

              <div className="p-6">
                <AuthForm mode={authView} onSwitch={(v) => setAuthView(v)} />
              </div>
            </div>
          </section>
        )}
        {authView === 'app' && (
        <section className="mx-auto max-w-4xl" ref={petsSectionRef}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your Pets</h2>
            <button
              type="button"
              onClick={() => setAddingPet(v => !v)}
              className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm hover:shadow"
            >
              + Add Pet
            </button>
          </div>

          {photoUploadError && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200 flex items-start justify-between">
              <span>{photoUploadError}</span>
              <button onClick={() => setPhotoUploadError(null)} className="ml-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200">×</button>
            </div>
          )}

          {addingPet && (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 max-w-2xl mx-auto">
              <div className="space-y-3">
                <div>
                  <label htmlFor="pet-name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Pet Name <span className="text-red-500">*</span></label>
                  <input id="pet-name" value={newPet.name} onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                </div>
                <div>
                  <label htmlFor="pet-species" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Species <span className="text-red-500">*</span></label>
                  <select id="pet-species" value={newPet.species} onChange={(e) => setNewPet({ ...newPet, species: e.target.value as PetSpecies })} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3">
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Insurance Section - OPTIONAL */}
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Insurance Information (Optional)</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Skip this section if your pet doesn't have insurance</p>

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="pet-insurance" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Insurance Company</label>
                      <select id="pet-insurance" value={newPetInsurer} onChange={(e) => {
                        const displayValue = e.target.value
                        setNewPetInsurer(displayValue)

                        const dbValue = getInsuranceValue(displayValue)
                        const deadlineDays = getDeadlineDays(dbValue)

                        if (displayValue === 'Not Insured' || displayValue === '— Select —') {
                          setNewPet({ ...newPet, insuranceCompany: '' as any, filing_deadline_days: '', policyNumber: '' })
                        } else if (displayValue === 'Custom Insurance') {
                          setNewPet({ ...newPet, insuranceCompany: '' as any, filing_deadline_days: '' })
                        } else if (dbValue) {
                          setNewPet({ ...newPet, insuranceCompany: dbValue as any, filing_deadline_days: deadlineDays || 90 })
                        }
                      }} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3">
                        {INSURANCE_OPTIONS.map(opt => (
                          <option key={opt.display} value={opt.display}>{opt.display}</option>
                        ))}
                      </select>
                    </div>

                    {newPetInsurer === 'Healthy Paws (90 days)' && (
                      <div>
                        <label htmlFor="pet-healthy-paws-id" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Healthy Paws Pet ID</label>
                        <input
                          id="pet-healthy-paws-id"
                          value={newPet.healthy_paws_pet_id || ''}
                          onChange={(e) => setNewPet({ ...newPet, healthy_paws_pet_id: e.target.value })}
                          placeholder="e.g., 1400806-1"
                          className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                        />
                        <p className="mt-1 text-xs text-slate-500">Find this on your Healthy Paws policy card or portal</p>
                      </div>
                    )}

                    {newPetInsurer === 'Spot (270 days)' && (
                      <div>
                        <label htmlFor="pet-spot-account-number" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Account Number</label>
                        <input
                          id="pet-spot-account-number"
                          value={newPet.spot_account_number || ''}
                          onChange={(e) => setNewPet({ ...newPet, spot_account_number: e.target.value })}
                          placeholder="e.g., 12345678"
                          className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                        />
                      </div>
                    )}

                    {newPetInsurer === 'Figo (180 days)' && (
                      <div>
                        <label htmlFor="pet-figo-policy-number" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Policy Number</label>
                        <input
                          id="pet-figo-policy-number"
                          value={newPet.figo_policy_number || ''}
                          onChange={(e) => setNewPet({ ...newPet, figo_policy_number: e.target.value })}
                          placeholder="e.g., FG123456"
                          className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                        />
                      </div>
                    )}

                    {/* Policy Number - hide for Spot and Figo (they have dedicated fields) */}
                    {newPetInsurer && newPetInsurer !== 'Not Insured' && newPetInsurer !== '— Select —' && newPetInsurer !== 'Spot (270 days)' && newPetInsurer !== 'Figo (180 days)' && (
                      <div>
                        <label htmlFor="pet-policy-number" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Policy Number</label>
                        <input
                          id="pet-policy-number"
                          value={newPet.policyNumber || ''}
                          onChange={(e) => setNewPet({ ...newPet, policyNumber: e.target.value })}
                          placeholder="e.g., NW12345 or TP123456"
                          className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                        />
                      </div>
                    )}

                    {/* These 4 fields show for ALL insurers including Spot */}
                    {newPetInsurer && newPetInsurer !== 'Not Insured' && newPetInsurer !== '— Select —' && (
                      <>
                        <div>
                          <label htmlFor="pet-premium" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Monthly Premium (USD)</label>
                          <input id="pet-premium" type="number" min={0} value={String(newPet.monthly_premium ?? '')} onChange={(e) => setNewPet({ ...newPet, monthly_premium: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="50" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                        </div>
                        <div>
                          <label htmlFor="pet-deductible" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Deductible (Annual) (USD)</label>
                          <input id="pet-deductible" type="number" min={0} value={String(newPet.deductible_per_claim ?? '')} onChange={(e) => setNewPet({ ...newPet, deductible_per_claim: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="250" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                        </div>
                        <div>
                          <label htmlFor="pet-insurance-pays" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Insurance Pays (%)</label>
                          <input
                            id="pet-insurance-pays"
                            type="number"
                            min={50}
                            max={100}
                            value={String(newPet.insurance_pays_percentage ?? '')}
                            onChange={(e) => setNewPet({ ...newPet, insurance_pays_percentage: e.target.value === '' ? '' : Number(e.target.value) })}
                            placeholder="80"
                            className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                          />
                        </div>
                        <div>
                          <label htmlFor="pet-coverage-start" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Coverage Start Date</label>
                          <input
                            id="pet-coverage-start"
                            type="date"
                            value={newPet.coverage_start_date || ''}
                            onChange={(e) => setNewPet({ ...newPet, coverage_start_date: e.target.value })}
                            onClick={(e) => (e.currentTarget as any).showPicker?.()}
                            className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button type="button" onClick={addPet} className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4">Save Pet</button>
                <button type="button" onClick={() => setAddingPet(false)} className="text-sm text-slate-600 dark:text-slate-300">Cancel</button>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pets.length === 0 && (
              <div className="col-span-full text-sm text-slate-500 dark:text-slate-400">No pets saved yet. Click "+ Add Pet" to create one.</div>
            )}
            {pets.map(pet => (
              <div key={pet.id} className={[ 'rounded-xl border p-6 text-left bg-white dark:bg-slate-900/60 shadow-sm relative', selectedPetId === pet.id ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-800' ].join(' ')} style={{ border: `2px solid ${pet.color || (pet.species === 'dog' ? '#3B82F6' : pet.species === 'cat' ? '#F97316' : '#6B7280')}` }}>
                {/* Camera button for photo upload - top right */}
                <div className="absolute top-3 right-3 z-10">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => handlePetPhotoSelect(pet.id, e)}
                    className="sr-only"
                    id={`photo-upload-${pet.id}`}
                    disabled={uploadingPhotoForPetId === pet.id}
                  />
                  <label
                    htmlFor={`photo-upload-${pet.id}`}
                    className={[
                      'inline-flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-all',
                      pet.species === 'dog' ? 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50' : 'bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50',
                      uploadingPhotoForPetId === pet.id ? 'opacity-50 cursor-not-allowed' : ''
                    ].join(' ')}
                    title={pet.photo_url ? 'Change Photo' : 'Add Photo'}
                  >
                    {uploadingPhotoForPetId === pet.id ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </label>

                  {/* Onboarding tooltip - show only for first pet without photo */}
                  {showPhotoTooltip && !pet.photo_url && pets.indexOf(pet) === 0 && (
                    <div className="absolute -top-16 -right-2 pointer-events-none animate-bounce">
                      <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg shadow-xl whitespace-nowrap text-sm font-medium">
                        Upload the cutest picture of {pet.name}! 📸
                      </div>
                      {/* Arrow pointing down at camera icon */}
                      <div className="absolute top-full right-6 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-pink-500"></div>
                    </div>
                  )}
                </div>

                <div>
                  {/* Pet photo or fallback icon */}
                  <div className="flex justify-center mb-4">
                    {pet.photo_url ? (
                      <img
                        src={pet.photo_url}
                        alt={`${pet.name}'s photo`}
                        className="w-32 h-32 rounded-full object-cover border-4 shadow-lg transition-transform hover:scale-105"
                        style={{ borderColor: pet.color || (pet.species === 'dog' ? '#3B82F6' : pet.species === 'cat' ? '#F97316' : '#6B7280') }}
                      />
                    ) : (
                      <div
                        className="w-32 h-32 rounded-full flex items-center justify-center text-6xl border-4 shadow-lg"
                        style={{ borderColor: pet.color || (pet.species === 'dog' ? '#3B82F6' : pet.species === 'cat' ? '#F97316' : '#6B7280'), backgroundColor: pet.species === 'dog' ? '#EFF6FF' : pet.species === 'cat' ? '#FFF7ED' : '#F3F4F6' }}
                      >
                        {pet.species === 'dog' ? '🐕' : pet.species === 'cat' ? '🐱' : '🐾'}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 text-center">
                      <div className="text-base font-semibold flex items-center justify-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pet.color || (pet.species === 'dog' ? '#3B82F6' : pet.species === 'cat' ? '#F97316' : '#6B7280') }} />
                        {pet.name}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 capitalize">{pet.species}</div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPetId(pet.id)}
                      className={[
                        'inline-flex items-center justify-center rounded-lg px-3 py-1.5 h-12 text-sm hover:shadow w-full sm:w-auto whitespace-nowrap',
                        selectedPetId === pet.id
                          ? (pet.species === 'dog'
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-orange-600 hover:bg-orange-700 text-white')
                          : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                      ].join(' ')}
                    >
                      {selectedPetId === pet.id ? 'Selected' : 'Use This Pet'}
                    </button>
                    <button type="button" onClick={() => startEditPet(pet)} className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 w-full sm:w-auto px-3 whitespace-nowrap">Edit</button>
                  </div>
                </div>
                <div className="mt-4 text-sm text-slate-700 dark:text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Insurance:</span>
                    {(() => {
                      const company = pet.insuranceCompany || 'Not Insured'
                      const isNationwide = company.toLowerCase().includes('nationwide')
                      const isHealthyPaws = company.toLowerCase().includes('healthy paws')
                      const isTrupanion = company.toLowerCase().includes('trupanion')
                      const isPumpkin = company.toLowerCase().includes('pumpkin')
                      const isSpot = company.toLowerCase().includes('spot')
                      const isFigo = company.toLowerCase().includes('figo')
                      const isPetsBest = company.toLowerCase().includes('pets best')
                      const isNotInsured = company.toLowerCase().includes('not insured') || company.toLowerCase().includes('none')

                      let bgColor = 'bg-slate-100 dark:bg-slate-800'
                      let textColor = 'text-slate-700 dark:text-slate-300'
                      let borderColor = 'border-slate-200 dark:border-slate-700'

                      if (isNationwide) {
                        bgColor = 'bg-blue-50 dark:bg-blue-950'
                        textColor = 'text-blue-700 dark:text-blue-300'
                        borderColor = 'border-blue-200 dark:border-blue-800'
                      } else if (isHealthyPaws) {
                        bgColor = 'bg-green-50 dark:bg-green-950'
                        textColor = 'text-green-700 dark:text-green-300'
                        borderColor = 'border-green-200 dark:border-green-800'
                      } else if (isTrupanion) {
                        bgColor = 'bg-purple-50 dark:bg-purple-950'
                        textColor = 'text-purple-700 dark:text-purple-300'
                        borderColor = 'border-purple-200 dark:border-purple-800'
                      } else if (isPumpkin) {
                        bgColor = 'bg-orange-50 dark:bg-orange-950'
                        textColor = 'text-orange-600 dark:text-orange-300'
                        borderColor = 'border-orange-200 dark:border-orange-800'
                      } else if (isSpot) {
                        bgColor = 'bg-orange-50 dark:bg-orange-950'
                        textColor = 'text-orange-600 dark:text-orange-400'
                        borderColor = 'border-orange-200 dark:border-orange-800'
                      } else if (isFigo) {
                        bgColor = 'bg-teal-50 dark:bg-teal-950'
                        textColor = 'text-teal-600 dark:text-teal-300'
                        borderColor = 'border-teal-200 dark:border-teal-800'
                      } else if (isPetsBest) {
                        bgColor = 'bg-cyan-50 dark:bg-cyan-950'
                        textColor = 'text-cyan-700 dark:text-cyan-300'
                        borderColor = 'border-cyan-200 dark:border-cyan-800'
                      } else if (isNotInsured) {
                        bgColor = 'bg-slate-100 dark:bg-slate-800'
                        textColor = 'text-slate-600 dark:text-slate-400'
                        borderColor = 'border-slate-300 dark:border-slate-700'
                      }

                      return (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${bgColor} ${textColor} ${borderColor}`}>
                          {isNationwide && '🏛️'}
                          {isHealthyPaws && '🍀'}
                          {isTrupanion && '💜'}
                          {isPumpkin && '🎃'}
                          {isSpot && '🐾'}
                          {isFigo && '🐕'}
                          {isPetsBest && '🐶'}
                          {isNotInsured && '—'}
                          {company}
                        </span>
                      )
                    })()}
                  </div>
                </div>
                {editingPetId === pet.id && editPet && (
                  <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3 max-w-3xl mx-auto overflow-x-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="edit-pet-name" className="block text-xs">Pet Name</label>
                        <input id="edit-pet-name" value={editPet.name} onChange={(e) => setEditPet({ ...editPet, name: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label htmlFor="edit-pet-species" className="block text-xs">Species</label>
                        <select id="edit-pet-species" value={editPet.species} onChange={(e) => setEditPet({ ...editPet, species: e.target.value as PetSpecies })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm">
                          <option value="dog">Dog</option>
                          <option value="cat">Cat</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Insurance Information</div>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="edit-pet-insurance" className="block text-xs text-slate-500">Insurance Company</label>
                              <select id="edit-pet-insurance" value={editPetInsurer} onChange={(e) => {
                                const displayValue = e.target.value
                                setEditPetInsurer(displayValue)

                                // Convert display value to database value
                                const dbValue = getInsuranceValue(displayValue)
                                const deadlineDays = getDeadlineDays(dbValue)

                                if (displayValue === 'Not Insured' || displayValue === '— Select —') {
                                  setEditPet({ ...editPet, insuranceCompany: '' as any, filing_deadline_days: '', policyNumber: '' })
                                } else if (dbValue) {
                                  setEditPet({ ...editPet, insuranceCompany: dbValue as any, filing_deadline_days: deadlineDays || 90 })
                                }
                              }} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm">
                                {INSURANCE_OPTIONS.map(opt => (
                                  <option key={opt.display} value={opt.display}>{opt.display}</option>
                                ))}
                              </select>
                            </div>
                            {editPetInsurer === 'Not Insured' && (
                              <div className="sm:col-span-1 flex items-center text-xs text-slate-500 bg-blue-50/50 dark:bg-blue-900/10 px-3 py-2 rounded-md border border-blue-200 dark:border-blue-800">
                                <span>✓ No insurance selected. You can still track vet bills and file claims manually.</span>
                              </div>
                            )}
                            {editPetInsurer === 'Healthy Paws (90 days)' && (
                              <div className="sm:col-span-2">
                                <label htmlFor="edit-pet-healthy-paws-id" className="block text-xs text-slate-500">Healthy Paws Pet ID</label>
                                <input
                                  id="edit-pet-healthy-paws-id"
                                  value={editPet.healthy_paws_pet_id || ''}
                                  onChange={(e) => setEditPet({ ...editPet, healthy_paws_pet_id: e.target.value })}
                                  placeholder="e.g., 1400806-1"
                                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                                />
                                <div className="mt-1 text-[11px] text-slate-500">Find this on your Healthy Paws policy card or portal</div>
                              </div>
                            )}
                            {editPetInsurer === 'Spot (270 days)' && (
                              <div className="sm:col-span-2">
                                <label htmlFor="edit-pet-spot-account-number" className="block text-xs text-slate-500">Account Number</label>
                                <input
                                  id="edit-pet-spot-account-number"
                                  value={editPet.spot_account_number || ''}
                                  onChange={(e) => setEditPet({ ...editPet, spot_account_number: e.target.value })}
                                  placeholder="e.g., 12345678"
                                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                                />
                              </div>
                            )}
                            {editPetInsurer === 'Pumpkin (270 days)' && (
                              <div className="sm:col-span-2">
                                <label htmlFor="edit-pet-pumpkin-account-number" className="block text-xs text-slate-500">Pumpkin Account Number</label>
                                <input
                                  id="edit-pet-pumpkin-account-number"
                                  value={editPet.pumpkin_account_number || ''}
                                  onChange={(e) => setEditPet({ ...editPet, pumpkin_account_number: e.target.value })}
                                  placeholder="e.g., 12345678"
                                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                                />
                              </div>
                            )}
                            {editPetInsurer === 'Figo (180 days)' && (
                              <div className="sm:col-span-2">
                                <label htmlFor="edit-pet-figo-policy-number" className="block text-xs text-slate-500">Figo Policy Number</label>
                                <input
                                  id="edit-pet-figo-policy-number"
                                  value={editPet.figo_policy_number || ''}
                                  onChange={(e) => setEditPet({ ...editPet, figo_policy_number: e.target.value })}
                                  placeholder="e.g., FG123456"
                                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                                />
                              </div>
                            )}
                            {editPetInsurer && editPetInsurer !== 'Not Insured' && editPetInsurer !== '— Select —' && editPetInsurer !== 'Spot (270 days)' && editPetInsurer !== 'Pumpkin (270 days)' && editPetInsurer !== 'Figo (180 days)' && (
                              <div className="sm:col-span-2">
                                <label htmlFor="edit-pet-policy-number" className="block text-xs text-slate-500">Policy Number <span className="text-slate-400">(optional)</span></label>
                                <input
                                  id="edit-pet-policy-number"
                                  value={editPet.policyNumber || ''}
                                  onChange={(e) => setEditPet({ ...editPet, policyNumber: e.target.value })}
                                  placeholder="e.g., NW12345 or TP123456"
                                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {editPetInsurer !== 'Not Insured' && editPetInsurer !== '— Select —' && editPetInsurer && (
                        <>
                          <div>
                            <label htmlFor="edit-pet-premium" className="block text-xs">Monthly Premium (USD)</label>
                            <input id="edit-pet-premium" type="number" step="0.01" placeholder="e.g., 38.00" value={String(editPet.monthly_premium ?? '')} onChange={(e) => setEditPet({ ...editPet, monthly_premium: e.target.value === '' ? '' : Number(e.target.value) })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                            <div className="mt-1 text-[11px] text-slate-500">Monthly insurance premium cost</div>
                          </div>
                          <div>
                            <label htmlFor="edit-pet-deductible" className="block text-xs">Deductible (Annual) (USD)</label>
                            <input id="edit-pet-deductible" type="number" step="0.01" placeholder="e.g., 250.00" value={String(editPet.deductible_per_claim ?? '')} onChange={(e) => setEditPet({ ...editPet, deductible_per_claim: e.target.value === '' ? '' : Number(e.target.value) })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                            <div className="mt-1 text-[11px] text-slate-500">Amount you pay before insurance kicks in (resets yearly)</div>
                          </div>
                          <div>
                            <label htmlFor="edit-pet-insurance-pays" className="block text-xs">Insurance Pays (%)</label>
                            <input id="edit-pet-insurance-pays" type="number" min={0} max={100} placeholder="80" value={String(editPet.insurance_pays_percentage ?? '')} onChange={(e) => setEditPet({ ...editPet, insurance_pays_percentage: e.target.value === '' ? '' : Number(e.target.value) })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                            <div className="mt-1 text-[11px] text-slate-500">What percentage your insurance covers (e.g., 80% means you pay 20%)</div>
                          </div>
                          <div>
                            <label htmlFor="edit-pet-coverage-start" className="block text-xs">Coverage Start Date</label>
                            <input id="edit-pet-coverage-start" type="date" value={editPet.coverage_start_date || ''} onChange={(e) => setEditPet({ ...editPet, coverage_start_date: e.target.value })} className="mt-1 w-full min-w-[220px] rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                            <div className="mt-1 text-[11px] text-slate-500">When did your coverage start?</div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button type="button" onClick={saveEdit} className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm">Save</button>
                      <button type="button" onClick={() => {
  if (!editingPetId) return
  const petToDelete = pets.find(p => p.id === editingPetId)
  const petName = petToDelete?.name || 'this pet'

  if (!confirm(`⚠️ Delete ${petName}?\n\nThis will NOT delete bills for this pet, but you won't be able to file new bills.\n\nThis cannot be undone!`)) return
  
  const remaining = pets.filter(p => p.id !== editingPetId)
  setPets(remaining)
  if (userId) dbDeletePet(userId, editingPetId).catch((e) => { console.error('[deletePet] error', e) })
  setEditingPetId(null)
  setEditPet(null)
}} className="inline-flex items-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-sm">Delete</button>
                      <button type="button" onClick={() => { setEditingPetId(null); setEditPet(null) }} className="text-sm text-slate-600 dark:text-slate-300">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
        )}

        {/* Food Tracking Section - NEW! */}
        {authView === 'app' && (
          <section className="mx-auto mt-10 max-w-6xl">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-semibold">🍖 Food Tracking</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold shadow-sm animate-pulse">
                NEW ✨
              </span>
            </div>
            <FoodTrackingDashboard userId={userId} />
          </section>
        )}

        {/* Treats Tracking */}
        {authView === 'app' && activeView === 'food' && userId && (
          <section className="mx-auto max-w-6xl px-4 mt-12">
            <TreatsTrackingDashboard userId={userId} />
          </section>
        )}

        {/* Upload section */}
        {authView === 'app' && (
        <section key="upload-section" className="mx-auto max-w-3xl text-center mt-8 px-2">
          <h2 className="text-2xl font-semibold">Upload Vet Bill</h2>
          <div className="mt-4">
            <div
              className={[
                'rounded-2xl border bg-white dark:bg-slate-900/60 shadow-sm p-6 sm:p-8 transition-colors',
                isDragging
                  ? 'border-emerald-400 ring-2 ring-emerald-400/60 dark:ring-emerald-400/50 bg-emerald-50/40 dark:bg-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-800'
              ].join(' ')}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={handlePick}
                  className="group relative w-full sm:w-auto h-16 rounded-xl border border-slate-300/70 dark:border-slate-700 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 hover:from-white hover:to-white px-5 text-base sm:text-sm text-slate-800 dark:text-slate-100 shadow hover:shadow-lg transition"
                >
                  <div className="flex items-center gap-3">
                    <svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" x2="12" y1="3" y2="15" />
                    </svg>
                    <span className="font-medium">Upload Vet Bill (PDF or Photo)</span>
                  </div>
                </button>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">or drag & drop here</p>

                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleChange}
                  className="sr-only"
                />

                {selectedFile && (
                  <div className="mt-6 w-full text-left">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.file.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{fileSizeLabel}</p>
                      </div>
                    </div>
                    {selectedFile.objectUrl && (
                      <div className="mt-4">
                        <img
                          src={selectedFile.objectUrl}
                          alt="Selected preview"
                          className="max-h-80 w-full object-contain rounded-lg border border-slate-200 dark:border-slate-800"
                          onLoad={() => {
                            if (selectedFile.objectUrl) URL.revokeObjectURL(selectedFile.objectUrl)
                          }}
                        />
                      </div>
                    )}

                    <div className="mt-5">
                      <button
                        type="button"
                        onClick={(e) => {
                          // eslint-disable-next-line no-console
                          console.log('[MOBILE DEBUG] ========== PROCESS BILL BUTTON CLICKED ==========')
                          // eslint-disable-next-line no-console
                          console.log('[MOBILE DEBUG] Event:', e)
                          // eslint-disable-next-line no-console
                          console.log('[MOBILE DEBUG] isProcessing:', isProcessing)
                          handleProcess()
                        }}
                        disabled={isProcessing}
                        className="inline-flex items-center justify-center w-full h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 text-base sm:text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isProcessing && (
                          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" className="opacity-25" />
                            <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                          </svg>
                        )}
                        Process Bill
                      </button>
                      {isProcessing && (
                        <div className="mt-4 flex flex-col items-center text-sm text-slate-700 dark:text-slate-300">
                          <svg className="h-6 w-6 animate-spin mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" className="opacity-25" />
                            <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                          </svg>
                          <div>📄 Extracting bill data...</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Multi-pet matching UI */}
        {authView === 'app' && multiExtracted && (
          <section className="mx-auto mt-8 max-w-3xl">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm p-5 sm:p-8">
              <h2 className="text-lg font-semibold">Multiple Pets Detected</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">We found charges for multiple pets on this bill:</p>
              <ul className="mt-2 text-sm list-disc pl-6 text-slate-700 dark:text-slate-200">
                {multiExtracted.pets.map((pg, idx) => (
                  <li key={idx}>{pg.petName || `Pet ${idx + 1}`} ({pg.petSpecies || 'Pet'}) — {computeSubtotal(pg.lineItems)}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">We'll create a separate bill for each pet.</p>

              <div className="mt-6 space-y-4">
                <p className="text-sm font-medium">Match each pet to your saved profiles (or add new ones):</p>
                {multiExtracted.pets.map((pg, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="text-left">
                        <div className="text-sm font-medium">{pg.petName || `Pet ${idx + 1}`}</div>
                        <div className="text-xs text-slate-500">{pg.petSpecies || 'Pet'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                          value={petMatches[idx] || ''}
                          onChange={(e) => {
                            const next = [...petMatches]
                            next[idx] = e.target.value || null
                            setPetMatches(next)
                          }}
                        >
                          <option value="">Select saved pet…</option>
                          {pets.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.species})</option>
                          ))}
                        </select>
                        {!petMatches[idx] && (
                          <button
                            type="button"
                            className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs hover:shadow"
                            onClick={() => {
                              setPendingMatchIndex(idx)
                              setAddingPet(true)
                              const speciesStr = (pg.petSpecies || '').toLowerCase()
                              const inferred = speciesStr.includes('cat') ? ('cat' as PetSpecies) : speciesStr.includes('dog') ? ('dog' as PetSpecies) : newPet.species
                              setNewPet((prev) => ({ ...prev, name: pg.petName || '', species: inferred }))
                              petsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                            }}
                          >
                            + Add New Pet
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={petMatches.some((m) => !m)}
                  onClick={async () => {
                    const files: { name: string; amount: string }[] = []
                    for (let idx = 0; idx < multiExtracted.pets.length; idx++) {
                      const pg = multiExtracted.pets[idx]
                      const petId = petMatches[idx]
                      const matchedPet = pets.find((p) => p.id === petId) || null
                      const subtotal = pg.subtotal || computeSubtotal(pg.lineItems)
                      const { filename, blob } = generateClaimPdfForPet({
                        clinicName: multiExtracted.clinicName,
                        clinicAddress: multiExtracted.clinicAddress,
                        dateOfService: multiExtracted.dateOfService,
                        diagnosis: multiExtracted.diagnosis,
                        petName: pg.petName,
                        lineItems: pg.lineItems,
                        subtotal,
                        invoiceNumber: multiExtracted.invoiceNumber,
                      }, matchedPet)
                      // Save claim and upload PDF
                      if (userId) {
                        try {
                          const totalNum = parseFloat(String(subtotal).replace(/[^0-9.\-]/g, '')) || null
                          // prefer pet's filing_deadline_days, fallback to 90
                          const filingDaysToUse = Number((matchedPet as any)?.filing_deadline_days) || 90
                          // Parse YYYY-MM-DD as local date to avoid timezone shift
                          const parseDateLocal = (iso?: string | null): Date | null => {
                            if (!iso) return null
                            const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
                            if (!m) return null
                            const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3])
                            const dt = new Date(y, mo, d)
                            return Number.isNaN(dt.getTime()) ? null : dt
                          }
                          const svcDate = parseDateLocal(multiExtracted.dateOfService)
                          const deadlineDate = svcDate ? new Date(svcDate.getTime()) : null
                          if (deadlineDate) deadlineDate.setDate(deadlineDate.getDate() + filingDaysToUse)
                          const row: any = await createClaim({
                            user_id: userId,
                            pet_id: matchedPet ? matchedPet.id : null,
                            service_date: multiExtracted.dateOfService || null,
                            invoice_number: multiExtracted.invoiceNumber || null,
                            clinic_name: multiExtracted.clinicName || null,
                            clinic_address: multiExtracted.clinicAddress || null,
                            clinic_phone: multiExtracted.clinicPhone || null,
                            diagnosis: multiExtracted.diagnosis || null,
                            total_amount: totalNum,
                            line_items: pg.lineItems,
                            filing_status: 'not_filed',
                            filing_deadline_days: filingDaysToUse,
                          })
                          if (row?.id) await uploadClaimPdf(userId, row.id, blob)
                        } catch (e) { console.error('[createClaim multi] error', e) }
                      }
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = filename
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      URL.revokeObjectURL(url)
                      files.push({ name: filename, amount: subtotal })
                    }
                    if (userId) listClaims(userId).then(setClaims).catch(() => {})
                    setShowClaims(true)
                    alert(`✓ ${files.length} bills generated and downloaded!\n` + files.map(f => `- ${f.name} (${f.amount})`).join('\n') + '\n\nEmail each bill to your insurance company.')
                  }}
                >
                  Generate Bills
                </button>
              </div>
            </div>
          </section>
        )}

        {extracted && (
          <section key={JSON.stringify(extracted)} className="mx-auto mt-8 max-w-3xl">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm p-5 sm:p-8">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="h-11 inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm"
                  onClick={() => {
                    setExtracted(null)
                    setMultiExtracted(null)
                    setSelectedFile(null)
                    setErrorMessage(null)
                    setVisitNotes('')
                    setVisitTitle('')
                    setExpenseCategory('insured')
                  }}
                >
                  ← Cancel
                </button>
                <h2 className="text-lg font-semibold">Extracted Details</h2>
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <label className="block text-sm font-medium mb-1">What was this visit for? (Visit Title)</label>
                <input
                  value={visitTitle}
                  onChange={(e) => setVisitTitle(e.target.value)}
                  placeholder="e.g., Annual checkup, Emergency visit, Teeth cleaning"
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Edit if needed</p>
              </div>

              {/* No Prices Found Warning */}
              {(() => {
                if (!extracted || !Array.isArray(extracted.lineItems)) return null
                const amounts = extracted.lineItems.map((li) => parseAmountToNumber(li.amount))
                const hasItems = extracted.lineItems.length > 0
                const allZeroOrMissing = hasItems && amounts.every((n) => !Number.isFinite(n) || n === 0)
                if (!allZeroOrMissing) return null
                return (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="font-semibold">⚠️ NO PRICES FOUND</div>
                    <div className="mt-1">This appears to be a vaccination certificate or record, not an invoice.</div>
                    <div className="mt-1">Please upload the actual bill/receipt with itemized charges and prices.</div>
                    <div className="mt-1 text-amber-800/80">Insurance companies require invoices showing what you paid.</div>
                  </div>
                )
              })()}
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review and edit any field if needed.</p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Clinic Name</label>
                  <input value={extracted.clinicName} onChange={(e) => setExtracted({ ...extracted, clinicName: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Clinic Address</label>
                  <input value={extracted.clinicAddress} onChange={(e) => setExtracted({ ...extracted, clinicAddress: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Clinic Phone</label>
                  <input value={extracted.clinicPhone || ''} onChange={(e) => setExtracted({ ...extracted, clinicPhone: e.target.value })} placeholder="(XXX) XXX-XXXX" type="tel" className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Pet Name</label>
                  <input value={extracted.petName} onChange={(e) => setExtracted({ ...extracted, petName: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Date of Service</label>
                  <input type="date" value={extracted.dateOfService} onChange={(e) => setExtracted({ ...extracted, dateOfService: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Invoice Number</label>
                  <input value={extracted.invoiceNumber || ''} onChange={(e) => setExtracted({ ...extracted, invoiceNumber: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Total Amount</label>
                  <div className="relative mt-1">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <span className="text-slate-500 text-sm">$</span>
                    </div>
                    <input value={extracted.totalAmount} onChange={(e) => setExtracted({ ...extracted, totalAmount: e.target.value })} className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 pl-7 pr-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Diagnosis / Reason</label>
                  <textarea value={extracted.diagnosis} onChange={(e) => setExtracted({ ...extracted, diagnosis: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" rows={3} />
                </div>
              </div>

              {selectedPet && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold">Pet Insurance</h3>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block text-xs text-slate-500">Insurance Company</label>
                      <input value={selectedPet.insuranceCompany} readOnly className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500">Policy Number</label>
                      <input value={selectedPet.policyNumber} readOnly className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-sm" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Line Items</h3>
                  <button
                    type="button"
                    className="text-sm text-emerald-700 dark:text-emerald-300 hover:underline"
                    onClick={() => setExtracted({ ...extracted, lineItems: [...extracted.lineItems, { description: '', amount: '' }] })}
                  >
                    + Add Item
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {extracted.lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-8">
                        <input
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => {
                            const copy = [...extracted.lineItems]
                            copy[idx] = { ...copy[idx], description: e.target.value }
                            setExtracted({ ...extracted, lineItems: copy })
                          }}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <span className="text-slate-500 text-sm">$</span>
                          </div>
                          <input
                            placeholder="Amount"
                            value={item.amount}
                            onChange={(e) => {
                              const copy = [...extracted.lineItems]
                              copy[idx] = { ...copy[idx], amount: e.target.value }
                              setExtracted({ ...extracted, lineItems: copy })
                            }}
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 pl-7 pr-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-1 flex items-center">
                        <button
                          type="button"
                          className="text-slate-500 hover:text-rose-600 text-sm"
                          onClick={() => {
                            const copy = extracted.lineItems.filter((_, i) => i !== idx)
                            setExtracted({ ...extracted, lineItems: copy })
                          }}
                          aria-label="Remove item"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* NEW: Visit Notes Section */}
              <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-blue-50/60 dark:bg-blue-900/10 p-4">
                <label htmlFor="visit-notes" className="block text-sm font-semibold mb-2">
                  📝 Visit Notes <span className="text-xs font-normal text-slate-500">(Optional but recommended)</span>
                </label>
                <textarea
                  id="visit-notes"
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  placeholder="What was discussed at this vet visit? (e.g., 'Annual checkup - vet noted minor eye redness from outdoor play, cleared up in 2 days')"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  💡 <strong>Why this matters:</strong> Documenting what was discussed protects you from casual comments being misinterpreted later as pre-existing conditions.
                </p>
              </div>

              {/* Enhanced Filing Deadline Reminder (pre-save) - Only show for insured pets */}
              {selectedPet && selectedPet.insuranceCompany && selectedPet.insuranceCompany.trim() !== '' && selectedPet.insuranceCompany.toLowerCase() !== 'not insured' && expenseCategory !== 'not_insured' && (() => {
                const filingDays = Number((selectedPet as any)?.filing_deadline_days) || 90
                // Parse YYYY-MM-DD as local date to avoid timezone shift
                const parseDateLocal = (iso?: string | null): Date | null => {
                  if (!iso) return null
                  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
                  if (!m) return null
                  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3])
                  const dt = new Date(y, mo, d)
                  return Number.isNaN(dt.getTime()) ? null : dt
                }
                const svc = parseDateLocal(extracted.dateOfService)
                const deadline = svc ? new Date(svc.getTime()) : null
                if (deadline) deadline.setDate(deadline.getDate() + filingDays)
                const now = new Date()
                const rem = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
                const color = (() => {
                  if (rem === null) return { wrap: 'bg-slate-50 border-slate-200', title: 'text-slate-900' }
                  if (rem >= 60) return { wrap: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-900' }
                  if (rem >= 30) return { wrap: 'bg-yellow-50 border-yellow-200', title: 'text-yellow-900' }
                  if (rem >= 15) return { wrap: 'bg-orange-50 border-orange-200', title: 'text-orange-900' }
                  return { wrap: 'bg-rose-50 border-rose-200', title: 'text-rose-900' }
                })()
                // Deadline passed messaging
                if (rem !== null && rem < 0) {
                  const daysAgo = svc ? Math.floor((now.getTime() - svc.getTime()) / (1000 * 60 * 60 * 24)) : 0
                  const years = Math.floor(daysAgo / 365)
                  const months = Math.max(1, Math.floor((daysAgo % 365) / 30))
                  const howLong = years >= 1
                    ? (years === 1 ? 'over 1 year ago' : `over ${years} years ago`)
                    : `over ${months} months ago`
                  return (
                    <div className={[ 'mt-8 rounded-2xl border p-5 shadow-sm bg-rose-50 border-rose-200' ].join(' ')}>
                      <div className="text-sm font-semibold text-rose-900">⚠️ DEADLINE PASSED</div>
                      <div className="mt-2 text-sm text-rose-900">This bill is from {extracted.dateOfService || '—'} ({howLong}).</div>
                      <div className="mt-2 text-sm text-rose-900">Most insurers won't accept bills this old.</div>
                      <div className="mt-1 text-xs text-rose-900/80">Contact your insurance company to verify if you can still file.</div>
                    </div>
                  )
                }
                return (
                  <div className={[ 'mt-8 rounded-2xl border p-5 shadow-sm', color.wrap ].join(' ')}>
                    <div className={[ 'text-sm font-semibold flex items-center gap-2', color.title ].join(' ')}>
                      <span>⏰ FILING DEADLINE REMINDER</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-slate-600 dark:text-slate-400">Service Date</div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">{extracted.dateOfService ? parseDateLocal(extracted.dateOfService)?.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) || '—' : '—'}</div>
                      </div>
                      <div>
                        <div className="text-slate-600 dark:text-slate-400">Insurance</div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">{selectedPet ? selectedPet.insuranceCompany : '—'}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm">
                      <div className="text-slate-700">⚠️ Most insurers require filing within 60–180 days of service.</div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-slate-600 dark:text-slate-400">Estimated Deadline</div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">{deadline ? deadline.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-slate-600 dark:text-slate-400">Days Remaining</div>
                        <div className="font-bold text-slate-900 dark:text-slate-100 text-base">{rem === null ? '—' : `${rem} days`}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-600">This is a general reminder. Always verify your specific policy deadline.</div>
                  </div>
                )
              })()}

              {/* Expense Category - Only show for insured pets */}
              {selectedPet && selectedPet.insuranceCompany && selectedPet.insuranceCompany.trim() !== '' && selectedPet.insuranceCompany.toLowerCase() !== 'not insured' && (
                <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <label className="block text-sm font-semibold mb-2">Expense Category</label>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="exp-cat" value="insured" checked={expenseCategory === 'insured'} onChange={() => setExpenseCategory('insured')} />
                      <span>Insured</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="exp-cat" value="not_insured" checked={expenseCategory === 'not_insured'} onChange={() => setExpenseCategory('not_insured')} />
                      <span>Not Insured</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="exp-cat" value="maybe_insured" checked={expenseCategory === 'maybe_insured'} onChange={() => setExpenseCategory('maybe_insured')} />
                      <span>Maybe Insured</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  className="h-11 inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm"
                  onClick={() => {
                    setExtracted(null)
                    setMultiExtracted(null)
                    setSelectedFile(null)
                    setErrorMessage(null)
                    setVisitNotes('')
                    setVisitTitle('')
                    setExpenseCategory('insured')
                  }}
                >
                  ← Cancel
                </button>
                {!isProcessing && (
                <button
                  type="button"
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-medium"
                  onClick={async () => {
                    // Prevent duplicate submissions
                    if (isSaving) return

                    // Require pet selected
                    if (!selectedPet) {
                      setPetSelectError(true)
                      return
                    }

                    // Set saving state immediately
                    setIsSaving(true)

                    try {
                      // Save single-pet claim only (PDF will be generated on-demand when user clicks "View My Claim")
                      // Compute deadline based on service date and filing window
                      const filingDaysToUse = Number((selectedPet as any)?.filing_deadline_days) || 90
                      // Parse YYYY-MM-DD as local date to avoid timezone shift
                      const parseDateLocal = (iso?: string | null): Date | null => {
                        if (!iso) return null
                        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
                        if (!m) return null
                        const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3])
                        const dt = new Date(y, mo, d)
                        return Number.isNaN(dt.getTime()) ? null : dt
                      }
                      const svcDate = parseDateLocal(extracted.dateOfService)
                      const computedDeadlineDate = svcDate ? new Date(svcDate.getTime()) : null
                      if (computedDeadlineDate) computedDeadlineDate.setDate(computedDeadlineDate.getDate() + filingDaysToUse)
                      let row: any = null
                      if (userId) {
                        try {
                          const totalNum = parseFloat(String(extracted.totalAmount).replace(/[^0-9.\-]/g, '')) || null
                          row = await createClaim({
                          user_id: userId,
                          pet_id: selectedPet ? selectedPet.id : null,
                          service_date: extracted.dateOfService || null,
                          invoice_number: extracted.invoiceNumber || null,
                          clinic_name: extracted.clinicName || null,
                          clinic_address: extracted.clinicAddress || null,
                          clinic_phone: extracted.clinicPhone || null,
                          visit_title: visitTitle || null,
                          diagnosis: extracted.diagnosis || null,
                          total_amount: totalNum,
                          line_items: extracted.lineItems,
                      filing_status: 'not_submitted',
                          filing_deadline_days: filingDaysToUse,
                          visit_notes: visitNotes || null,
                          expense_category: expenseCategory,
                        })
                        // Upload the vet bill PDF to storage and save path to claim
                        console.log('[createClaim single] Checking for vet bill upload...', {
                          hasClaimId: !!row?.id,
                          hasSelectedFile: !!selectedFile,
                          hasFile: !!selectedFile?.file,
                          selectedFileType: selectedFile?.file?.type
                        })
                        if (row?.id && selectedFile?.file) {
                          try {
                            console.log('[createClaim single] Uploading vet bill PDF to storage...')
                            await uploadClaimPdf(userId, row.id, selectedFile.file)
                            console.log('[createClaim single] ✅ Uploaded vet bill PDF for claim:', row.id)
                          } catch (uploadError) {
                            console.error('[createClaim single] ❌ Failed to upload vet bill:', uploadError)
                            // Show error to user but still create the claim
                            alert(`⚠️ Warning: Failed to attach vet invoice.\n\nThe claim was created but the invoice file could not be uploaded. You may need to attach it manually when submitting.\n\nError: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`)
                          }
                        } else {
                          console.warn('[createClaim single] ⚠️  No vet bill PDF to upload - selectedFile or file is missing')
                        }
                        } catch (e) { console.error('[createClaim single] error', e) }
                      }
                      // Show success modal directly
                      const success = {
                        claimId: row?.id || null,
                        petName: selectedPet?.name || 'Unknown',
                        species: selectedPet?.species || '',
                        amount: parseAmountToNumber(String(extracted.totalAmount || '')),
                        serviceDate: extracted.dateOfService || null,
                        insurance: selectedPet?.insuranceCompany || '',
                        deadlineDate: (computedDeadlineDate ? computedDeadlineDate.toISOString().slice(0,10) : null),
                        deadlineDays: filingDaysToUse,
                      } as typeof successModal
                      setSuccessModal(success)
                      setCreatedClaimId(row?.id || null)
                      // eslint-disable-next-line no-console
                      console.log('[LOOKS GOOD CLICKED] Showing success modal', { claimId: row?.id })
                      // Clear the bill review form
                      setExtracted(null)
                    } finally {
                      // Always reset saving state
                      setIsSaving(false)
                    }
                  }}
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Looks Good'
                  )}
                </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Financial Summary */}
        {authView === 'app' && (
          <section className="mx-auto mt-10 max-w-5xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Financial Summary</h2>
              <div className="text-sm">
                <label className="mr-2 text-slate-600">Show expenses for:</label>
                <select
                  value={finPeriod}
                  onChange={(e) => setFinPeriod(e.target.value as any)}
                  className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                >
                  <option value="all">All Time</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                  <option value="last12">Last 12 Months</option>
                </select>
              </div>
            </div>
            <FinancialSummary userId={userId} refreshToken={dataRefreshToken} period={finPeriod} />
          </section>
        )}

        {/* Claims History Dashboard */}
        {authView === 'app' && claims.length > 0 && (
          <section className="mx-auto mt-10 max-w-5xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Vet Bills</h2>
            </div>

            {/* Coming Soon: Auto-Submit Banner - Only show if user cannot auto-submit yet */}
            {(() => {
              const hasProductionInsurer = pets.some(pet => {
                const insurer = pet.insuranceCompany?.toLowerCase() || ''
                return PRODUCTION_INSURERS.some(prod => insurer.includes(prod))
              })
              const isDemoAccount = userEmail && DEMO_ACCOUNTS.includes(userEmail.toLowerCase())

              // Hide banner if user has Pumpkin/Spot OR is a demo account (they can already auto-submit)
              if (hasProductionInsurer || isDemoAccount) return null

              return (
                <div className="mt-4 mb-4 p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md">
                  <div className="flex items-center space-x-3 text-white">
                    <span className="text-3xl">🚀</span>
                    <div>
                      <h3 className="font-bold text-lg">Auto-Submit Coming Soon!</h3>
                      <p className="text-sm text-blue-100">
                        Soon we'll file claims directly with your insurance company. No more manual work!
                      </p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Summary */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="text-xs text-slate-500">Total bills</div>
                <div className="text-lg font-semibold">{claimsSummary.total}</div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="text-xs text-slate-500">Bills pending submission</div>
                <div className="text-lg font-semibold">{claimsSummary.notFiledCount} <span className="text-sm text-slate-500">({fmtMoney(claimsSummary.notFiledSum)})</span></div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="text-xs text-slate-500">Claims filed</div>
                <div className="text-lg font-semibold">{claimsSummary.filedPending}</div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="text-xs text-slate-500">Claims expiring soon (&lt; 15 days)</div>
                <div className="text-lg font-semibold">{claimsSummary.expiringSoon}</div>
              </div>
            </div>

            {/* Claims list */}
            <div ref={claimsSectionRef} className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full overflow-x-hidden" style={{ overscrollBehaviorX: 'none' }}>
              {orderedClaims.map((c) => {
                const pet = c.pets || {}
                const petColor = pet?.color || (pet?.species === 'cat' ? '#F97316' : pet?.species === 'dog' ? '#3B82F6' : '#6B7280')
                const rem = getDaysRemaining(c)
                const deadline = (() => {
                  const svc = getServiceDate(c)
                  if (!svc) return null
                  const d = new Date(svc.getTime())
                  d.setDate(d.getDate() + getDeadlineDays(c))
                  return d
                })()
                const dlBadge = deadlineBadge(c)
                const stBadge = statusBadge(c.filing_status)
                const isNotInsured = String(c.expense_category || 'insured') === 'not_insured'
                const catBadge = (() => {
                  const v = (c.expense_category || 'insured') as 'insured' | 'not_insured' | 'maybe_insured'
                  // Database returns insurance_company (snake_case), not insuranceCompany
                  const insuranceCompany = (pet as any)?.insurance_company || ''

                  if (v === 'insured') {
                    // Show "Insured • [Company Name]" if insurance company exists
                    const text = insuranceCompany ? `Insured • ${insuranceCompany}` : 'Insured'
                    return { text, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
                  }
                  if (v === 'not_insured') return { text: 'Not Insured', cls: 'bg-amber-50 text-amber-700 border border-amber-200' }

                  // Maybe insured - also show company if available
                  const text = insuranceCompany ? `Maybe Insured • ${insuranceCompany}` : 'Maybe Insured'
                  return { text, cls: 'bg-amber-50 text-amber-700 border border-amber-200' }
                })()
                return (
                  <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900 shadow-sm min-h-[180px] w-full" style={{ border: `2px solid ${petColor}`, touchAction: 'pan-y', overscrollBehaviorX: 'none' }}>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: petColor + '20' }}>
                          <span className="text-slate-700">{pet.species === 'cat' ? '🐱' : '🐶'}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 break-words line-clamp-2">
                            {(() => {
                              const title = ((c.visit_title && String(c.visit_title)) || (c.diagnosis && String(c.diagnosis)) || '').trim()
                              return title ? `${pet.name || 'Pet'} • ${title}` : (pet.name || 'Pet')
                            })()}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400 truncate">
                        <span className="mr-1">🏥</span>{c.clinic_name || '—'}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${catBadge.cls}`}>{catBadge.text}</div>
                        {!isNotInsured && (
                          <div className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${stBadge.cls}`}>{stBadge.text}</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-slate-500">Service Date</div>
                        <div className="font-medium">{c.service_date ? (getServiceDate(c)?.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) || '—') : '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-500">Amount</div>
                        <div className="font-mono font-semibold">{fmtMoney(c.total_amount)}</div>
                        {String(c.filing_status || '').toLowerCase() === 'paid' && (
                          <>
                            <div className="mt-1 text-[11px]">
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                {(() => {
                                  const claimed = Number(c.total_amount || 0)
                                  const reimb = Number((c as any).reimbursed_amount || 0)
                                  const pct = claimed > 0 ? Math.round((reimb / claimed) * 100) : 0
                                  return `Claimed: ${fmtMoney(claimed)} → Received: ${fmtMoney(reimb)} (${pct}%)`
                                })()}
                              </span>
                            </div>
                            {c.paid_date && (
                              <div className="mt-1 text-[11px]">
                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                  {`Date Paid: ${new Date(c.paid_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {(() => {
                        const statusLower = String(c.filing_status || '').toLowerCase()
                        const shouldShow = Boolean(c.filed_date) && (statusLower === 'filed' || statusLower === 'paid')
                        if (!shouldShow) return null
                        const label = (() => {
                          const ymd = String(c.filed_date || '')
                          const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
                          if (m) {
                            const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
                            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                          }
                          const d = c.filed_date ? new Date(c.filed_date as any) : null
                          return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
                        })()
                        return (
                          <div className="col-span-2 mt-1 text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <span>📤</span>
                            <span>
                              Filed: {label}
                            </span>
                          </div>
                        )
                      })()}
                      {!isNotInsured ? (
                        <>
                          <div>
                          <div className="text-slate-500">Filing Deadline</div>
                            <div className="font-medium whitespace-nowrap overflow-hidden">{deadline ? deadline.toISOString().slice(0,10) : '—'}</div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full ${dlBadge.cls}`}>{dlBadge.text}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <div className="text-slate-500">Info</div>
                            <div className="font-medium whitespace-nowrap overflow-hidden">💰 Self-paid vet bill</div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-start sm:items-center justify-between gap-2">
                      {(() => {
                        const stRaw = String(c.filing_status || 'not_submitted').toLowerCase()
                        const st = (stRaw === 'filed') ? 'submitted' : (stRaw === 'not_filed' ? 'not_submitted' : stRaw)
                        if (isNotInsured) {
                          return (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">⭕ Not insured - No filing required</span>
                            </div>
                          )
                        }
                        if (st === 'not_submitted') {
                          // Check if user can auto-submit for this claim
                          const showAutoSubmit = (() => {
                            if (!userEmail) return false

                            const normalizedEmail = userEmail.toLowerCase()
                            const insurer = c.pets?.insurance_company?.toLowerCase() || ''

                            // Demo accounts can auto-submit for ANY insurer
                            if (DEMO_ACCOUNTS.includes(normalizedEmail)) {
                              return true
                            }

                            // Real users can only auto-submit for production insurers
                            return PRODUCTION_INSURERS.some(prod => insurer.includes(prod))
                          })()

                          return (
                            <>
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                                {/* Auto-Submit Button - Whitelisted Users Only */}
                                {showAutoSubmit && (
                                  <button
                                    type="button"
                                    className={`
                                      text-xs px-2 py-1 rounded font-semibold whitespace-nowrap flex items-center gap-1.5
                                      transition-all duration-200 ease-out
                                      ${autoSubmitAnimating === c.id
                                        ? 'scale-95 bg-gradient-to-r from-teal-600 via-teal-500 to-teal-600 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]'
                                        : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                                      }
                                      text-white
                                    `}
                                    onClick={async () => {
                                      // Haptic feedback (if supported)
                                      if (navigator.vibrate) {
                                        navigator.vibrate(10) // Light impact
                                      }

                                      // Step 1: Button press animation (0-300ms)
                                      setAutoSubmitAnimating(c.id)

                                      // Step 2: Loading state with shimmer (300-1000ms = 700ms visible)
                                      // Let users see the gradient shimmer, spinner, and "Preparing..." text
                                      await new Promise(resolve => setTimeout(resolve, 1000))

                                      // Step 3: Modal transition (1000-1200ms)
                                      setSubmittingClaim(c)

                                      // Keep animation state briefly for smooth modal transition
                                      await new Promise(resolve => setTimeout(resolve, 200))
                                      setAutoSubmitAnimating(null)
                                    }}
                                    title="Automatically generate PDF and email to insurance company"
                                  >
                                    {autoSubmitAnimating === c.id ? (
                                      <>
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span className="animate-pulse">Preparing...</span>
                                      </>
                                    ) : (
                                      <>
                                        <span>🚀</span>
                                        Auto-Submit
                                      </>
                                    )}
                                  </button>
                                )}

                                {/* Manual Submit Button - Existing */}
                                <button
                                  type="button"
                                  className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
                                  onClick={async () => {
                                    try {
                                      const today = getLocalTodayYYYYMMDD()
                                      const input = prompt('Enter filed date (YYYY-MM-DD):', today) || today
                                      const filedDate = input
                                      await updateClaim(c.id, { filing_status: 'filed', filed_date: filedDate })
                                      setClaims(prev => prev.map(cl => cl.id === c.id ? { ...cl, filing_status: 'filed', filed_date: filedDate } : cl))
                                      try { alert('✓ Claim marked as submitted') } catch {}
                                      await new Promise((r) => setTimeout(r, 500))
                                      if (userId) {
                                        const updated = await listClaims(userId)
                                        setClaims(updated)
                                      }
                                    } catch (e) { console.error('[mark filed] error', e) }
                                  }}
                                  title="Manually mark as submitted (if you filed yourself)"
                                >
                                  Mark Submitted
                                </button>
                              </div>
                              {/* Change Status Dropdown - Separate Row */}
                              {(['insured','maybe'].includes(String(c.expense_category || 'insured').toLowerCase())) && (
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-xs text-slate-500 whitespace-nowrap">Change Status:</span>
                                  <select
                                    className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    value="not_submitted"
                                    onChange={async (e) => {
                                      try {
                                        const next = e.target.value
                                        const newStatus = next === 'submitted' ? 'filed' : (next === 'not_submitted' ? 'not_filed' : next)
                                        await updateClaim(c.id, { filing_status: newStatus })
                                        // Optimistically update local UI to reflect new status immediately
                                        setClaims(prev => prev.map(cl => cl.id === c.id ? { ...cl, filing_status: newStatus } : cl))
                                        try { alert('✓ Status updated') } catch {}
                                        await new Promise((r) => setTimeout(r, 400))
                                        if (userId) listClaims(userId).then(setClaims)
                                      } catch (er) { console.error('[edit status] error', er) }
                                    }}
                                  >
                                    <option value="not_submitted">Not Submitted</option>
                                    <option value="submitted">Submitted</option>
                                    <option value="denied">Denied</option>
                                  </select>
                                </div>
                              )}
                              {/* Coming Soon: Auto-Submit Teaser - Only show if claim does NOT support auto-submit */}
                              {!showAutoSubmit && (
                                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-400 rounded">
                                  <div className="flex items-start">
                                    <span className="text-2xl mr-2">🚀</span>
                                    <div>
                                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                                        Coming Soon: Auto-Submit
                                      </p>
                                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                        We'll file claims directly with your insurance company - no more manual work!
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          )
                        }
                        if (st === 'submitted') {
                          return (
                            <div className="flex flex-col gap-2">
                              <div className="text-xs text-slate-600">What happened with this claim?</div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-xs px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => {
                                    setPaidModalClaim(c)
                                    const preset = (c.total_amount && Number.isFinite(Number(c.total_amount))) ? String(Number(c.total_amount).toFixed(2)) : ''
                                    setPaidAmount(preset)
                                    setPaidDate(getLocalTodayYYYYMMDD())
                                  }}
                                >
                                  Payment Received? Mark as Paid
                                </button>
                                <button
                                  type="button"
                                  className="text-xs px-3 py-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-800"
                                  onClick={async () => {
                                    try {
                                      await updateClaim(c.id, { filing_status: 'denied' })
                                      setClaims(prev => prev.map(cl => cl.id === c.id ? { ...cl, filing_status: 'denied' } : cl))
                                      try { alert('✓ Claim marked as denied') } catch {}
                                      if (userId) listClaims(userId).then(setClaims)
                                    } catch (er) { console.error('[deny claim] error', er) }
                                  }}
                                >
                                  Deny Claim
                                </button>
                              </div>
                              {/* Change Status Dropdown - Separate Row */}
                              {(['insured','maybe'].includes(String(c.expense_category || 'insured').toLowerCase())) && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500 whitespace-nowrap">Change Status:</span>
                                  <select
                                    className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    value="submitted"
                                    onChange={async (e) => {
                                      try {
                                        const next = e.target.value
                                        const newStatus = next === 'submitted' ? 'filed' : (next === 'not_submitted' ? 'not_filed' : next)
                                        await updateClaim(c.id, { filing_status: newStatus })
                                        // Optimistically update local UI to reflect new status immediately
                                        setClaims(prev => prev.map(cl => cl.id === c.id ? { ...cl, filing_status: newStatus } : cl))
                                        try { alert('✓ Status updated') } catch {}
                                        if (userId) listClaims(userId).then(setClaims)
                                      } catch (er) { console.error('[edit status] error', er) }
                                    }}
                                  >
                                    <option value="submitted">Submitted</option>
                                    <option value="not_submitted">Not Submitted</option>
                                    <option value="denied">Denied</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          )
                        }
                        // paid or denied
                        return null
                      })()}
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {c.pdf_path && (
                          <a
                            href="#"
                            onClick={async (e) => {
                              e.preventDefault()
                              try {
                                const { data } = await supabase.storage.from('claim-pdfs').createSignedUrl(c.pdf_path, 60)
                                if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                              } catch (err) { console.error('[view pdf] error', err) }
                            }}
                            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 whitespace-nowrap"
                          >
                            View PDF
                          </a>
                        )}
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-800 shrink-0 whitespace-nowrap"
                          onClick={async () => {
                            if (!confirm('Delete this bill?')) return
                            try {
                              await dbDeleteClaim(c.id)
                              if (userId) listClaims(userId).then(setClaims)
                            } catch (e) {
                              console.error('[delete claim] error', e)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {orderedClaims.length === 0 && (
              <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900">
                No vet bills yet. Upload your first bill to get started!
              </div>
            )}

          </section>
        )}

        {authView === 'app' && (
          <footer className="mx-auto max-w-3xl text-center py-10 text-xs text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} Pet Cost Helper
            </footer> 
          )}
         
      </main>
      {showSettings && (            
        <SettingsModal
              userId={userId}
              userEmail={userEmail}
              onClose={() => setShowSettings(false)}
            />
          )}
      {petSelectError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPetSelectError(false)}>
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold text-rose-700">⚠️ Please Select a Pet</div>
            <div className="mt-2 text-sm text-rose-800">You haven't selected a pet for this bill yet.</div>
            <div className="mt-1 text-sm text-rose-800">Please go back and click 'Use This Pet' for the pet you want to add this bill for.</div>
            <div className="mt-4 flex justify-end">
              <button className="inline-flex items-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-sm" onClick={() => setPetSelectError(false)}>Go Back</button>
            </div>
          </div>
        </div>
      )}
      {editingClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingClaim(null)}>
          <div className="relative mx-4 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold">Edit Bill</h3>
              <button className="text-sm" onClick={() => setEditingClaim(null)}>Close</button>
            </div>
            {/* Warning (fixed under header) */}
            {['filed','paid'].includes(String(editingClaim.filing_status || '').toLowerCase()) && (
              <div className="mx-5 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">⚠️ This claim has been filed. Changes may require resubmitting to insurance.</div>
            )}
            {/* Scrollable content */}
            <div className="p-5 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs text-slate-500">Pet</label>
                <select className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2" value={editPetId || ''} onChange={(e) => setEditPetId(e.target.value)}>
                  <option value="">—</option>
                  {pets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500">Service Date</label>
                <input type="date" className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2" value={editServiceDate} onChange={(e) => setEditServiceDate(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500">Visit Title</label>
                <input className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2" value={editVisitTitle} onChange={(e) => setEditVisitTitle(e.target.value)} placeholder="e.g., Annual checkup, Teeth cleaning" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500">Diagnosis / Reason</label>
                <input className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2" value={editDiagnosis} onChange={(e) => setEditDiagnosis(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500">Visit Notes</label>
                <textarea rows={3} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2" value={editVisitNotes} onChange={(e) => setEditVisitNotes(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-slate-500">Line Items</label>
                  <button type="button" className="text-xs text-emerald-700" onClick={() => setEditItems([...editItems, { description: '', amount: '' }])}>+ Add Item</button>
                </div>
                <div className="mt-2 space-y-2">
                  {editItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input className="col-span-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-2 py-1" placeholder="Description" value={it.description} onChange={(e) => { const arr = [...editItems]; arr[idx] = { ...arr[idx], description: e.target.value }; setEditItems(arr) }} />
                      <input className="col-span-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-2 py-1" placeholder="Amount" value={it.amount} onChange={(e) => { const arr = [...editItems]; arr[idx] = { ...arr[idx], amount: e.target.value }; setEditItems(arr) }} />
                      <button className="col-span-1 text-xs" onClick={() => { const arr = editItems.filter((_,i)=>i!==idx); setEditItems(arr) }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Expense Category</label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1"><input type="radio" name="edit-exp" checked={editExpenseCat==='insured'} onChange={() => setEditExpenseCat('insured')} /> Insured</label>
                  <label className="inline-flex items-center gap-1"><input type="radio" name="edit-exp" checked={editExpenseCat==='not_insured'} onChange={() => setEditExpenseCat('not_insured')} /> Not Insured</label>
                  <label className="inline-flex items-center gap-1"><input type="radio" name="edit-exp" checked={editExpenseCat==='maybe_insured'} onChange={() => setEditExpenseCat('maybe_insured')} /> Maybe</label>
                </div>
              </div>
              </div>
            </div>
            {/* Footer */}
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button className="text-sm" onClick={() => setEditingClaim(null)}>Cancel</button>
              <button className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm" onClick={async () => {
                if (!editingClaim) return
                try {
                  await updateClaim(editingClaim.id, {
                    pet_id: editPetId || editingClaim.pet_id,
                    service_date: editServiceDate || null,
                    visit_title: editVisitTitle || null,
                    diagnosis: editDiagnosis || null,
                    visit_notes: editVisitNotes || null,
                    line_items: editItems,
                    expense_category: editExpenseCat,
                  } as any)
                  if (userId) {
                    const refreshed = await listClaims(userId)
                    setClaims(refreshed)
                  }
                  setEditingClaim(null)
                  alert('Bill updated')
                } catch (e) { console.error('[update claim] error', e); alert('Error updating bill') }
              }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
      {paidModalClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPaidModalClaim(null)}>
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Mark as Paid</h3>
              <button className="text-sm" onClick={() => setPaidModalClaim(null)}>Close</button>
            </div>
            <div className="p-5 text-sm space-y-3">
              <div>
                <div className="text-slate-500">Claimed Amount</div>
                <div className="font-mono font-semibold">{fmtMoney(paidModalClaim.total_amount)}</div>
              </div>
              <div>
                <label className="block text-slate-500">Reimbursed Amount</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2"
                  placeholder="0.00"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>
                  <div>
                    <label className="block text-slate-500">Date Received</label>
                    <input
                      type="date"
                      value={paidDate}
                      onChange={(e) => setPaidDate(e.target.value)}
                      max={getLocalTodayYYYYMMDD()}
                      placeholder="YYYY-MM-DD"
                      className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2"
                    />
                  </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="text-slate-500">Difference</div>
                <div className="font-mono font-semibold">
                  {(() => {
                    const claimed = Number(paidModalClaim.total_amount || 0)
                    const reimb = Number(paidAmount || 0)
                    const diff = claimed - reimb
                    return fmtMoney(diff)
                  })()}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button className="text-sm" onClick={() => setPaidModalClaim(null)}>Cancel</button>
              <button
                className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                onClick={async () => {
                  try {
                    const amountNum = Number(paidAmount)
                    if (!Number.isFinite(amountNum) || amountNum < 0) {
                      alert('Please enter a valid reimbursed amount')
                      return
                    }
                        if (!paidDate) {
                          alert('Please select the date received')
                          return
                        }
                        const paidIso = new Date(paidDate).toISOString().slice(0,10)

                        // Compute deductible_applied and user_coinsurance_payment
                        const claimed = Number(paidModalClaim.total_amount || 0)
                        const petId = paidModalClaim.pet_id || null
                        // Use calendar year of service_date
                        const svcY = paidModalClaim.service_date ? Number(String(paidModalClaim.service_date).slice(0,4)) : null
                        const alreadyDeductedThisYear = svcY && petId ? claims.some((c: any) => (
                          c.id !== paidModalClaim.id &&
                          c.pet_id === petId &&
                          String(c.expense_category || '').toLowerCase() === 'insured' &&
                          String(c.filing_status || '').toLowerCase() === 'paid' &&
                          c.service_date && String(c.service_date).slice(0,4) === String(svcY) &&
                          Number(c.deductible_applied || 0) > 0
                        )) : false
                        const pet = petId ? pets.find(p => p.id === petId) : null
                        const petDeductible = Math.max(0, Number(pet?.deductible_per_claim || 0))
                        const deductible_applied = Math.min(claimed, alreadyDeductedThisYear ? 0 : petDeductible)
                        const user_coinsurance_payment = Math.max(0, claimed - deductible_applied - amountNum)

                        await updateClaim(paidModalClaim.id, {
                          filing_status: 'paid',
                          reimbursed_amount: amountNum,
                          paid_date: paidIso,
                          deductible_applied,
                          user_coinsurance_payment,
                        } as any)
                    if (userId) {
                      const updated = await listClaims(userId)
                      setClaims(updated)
                    }
                    setPaidModalClaim(null)
                    setPaidAmount('')
                        setPaidDate(getLocalTodayYYYYMMDD())
                    alert('Claim marked as paid')
                  } catch (e) {
                    console.error('[mark paid] error', e)
                    alert('Error saving paid status')
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Medications prescribed question */}
      {/* Medication selection modal (removed - users add medications separately) */}
      {medSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMedSelectOpen(false)}>
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold">Select Medications Prescribed</div>
            <div className="mt-3 space-y-2 max-h-[50vh] overflow-y-auto">
              {medicationsForPet.length === 0 && (
                <div className="text-sm text-slate-600">No active medications found</div>
              )}
              {medicationsForPet.map((m: any) => (
                <label key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedMedicationIds.includes(m.id)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSelectedMedicationIds(prev => checked ? [...prev, m.id] : prev.filter(id => id !== m.id))
                    }}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    selectedMedicationIds.includes(m.id)
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'bg-white border-gray-300'
                  }`}>
                    {selectedMedicationIds.includes(m.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{m.medication_name}</div>
                    {m.dosage && <div className="text-xs text-slate-500">{m.dosage}</div>}
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-3">
              <button type="button" className="w-full h-12 rounded-lg border border-slate-300 dark:border-slate-700" onClick={() => setShowAddMedication(true)}>+ Add New Medication</button>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button type="button" className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4" onClick={() => setMedSelectOpen(false)}>Cancel</button>
              <button type="button" className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4" onClick={async () => {
                try {
                  if (createdClaimId && selectedMedicationIds.length > 0) {
                    await updateClaim(createdClaimId, { medication_ids: selectedMedicationIds } as any)
                  }
                  setMedSelectOpen(false)
                  // Show lightweight toast instead of claim success modal
                  showToast('Medications saved ✓')
                } catch (e) { console.error('[med select -> link meds] error', e); setMedSelectOpen(false); showToast('Medications saved ✓') }
              }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showAddMedication && (
        <AddMedicationForm
          open={showAddMedication}
          onClose={() => setShowAddMedication(false)}
          onSaved={async (newMedicationId) => {
            try {
              if (userId && selectedPet) {
                const today = getLocalTodayYYYYMMDD()
                const { data } = await supabase
                  .from('medications')
                  .select('*')
                  .eq('user_id', userId)
                  .eq('pet_id', selectedPet.id)
                  .lte('start_date', today)
                  .or(`end_date.is.null,end_date.gte.${today}`)
                setMedicationsForPet(Array.isArray(data) ? data : [])

                // Auto-check the newly added medication
                if (newMedicationId && !selectedMedicationIds.includes(newMedicationId)) {
                  setSelectedMedicationIds(prev => [...prev, newMedicationId])
                }
              }
            } catch {}
          }}
          userId={userId}
          pets={pets}
          defaultPetId={selectedPet?.id || null}
        />
      )}

      {/* NOTE: /dose/:code is now a standalone page, not a modal - see top of App() */}

      {/* Auto-Submit Claim Modal */}
      {submittingClaim && userId && (
        <ClaimSubmissionModal
          claim={submittingClaim}
          pet={submittingClaim.pets || {}}
          userId={userId}
          onClose={() => setSubmittingClaim(null)}
          onSuccess={async (messageId) => {
            console.log('[Auto-Submit] Success! Message ID:', messageId)
            setSubmittingClaim(null)
            // Refresh claims list to show updated status
            if (userId) {
              const updated = await listClaims(userId)
              setClaims(updated)
            }
            showToast('✅ Claim submitted to insurance!')
          }}
        />
      )}

      {/* Onboarding (no pets yet) */}
      <OnboardingModal
        open={showOnboarding}
        onClose={() => {
          setShowOnboarding(false)
          if (userId) {
            dbLoadPets(userId).then(setPets).catch(() => {})
          }

          // Check flag immediately before photo tooltip useEffect can clear it
          const justCompleted = localStorage.getItem('justCompletedOnboarding')
          if (justCompleted !== 'true') {
            // User cancelled onboarding, don't show add-to-homescreen
            return
          }

          // Check if we should show Add to Home Screen modal after onboarding
          const addedToHomeScreen = localStorage.getItem('pch_added_to_homescreen')
          const dismissedAt = localStorage.getItem('pch_homescreen_dismissed_at')

          if (addedToHomeScreen === 'true') {
            // User already confirmed they added it
            return
          }

          if (dismissedAt) {
            const dismissedDate = new Date(dismissedAt)
            const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
            if (daysSinceDismissed < 3) {
              // Dismissed less than 3 days ago
              return
            }
          }

          // Passed all checks - show add-to-homescreen modal after brief delay
          setTimeout(() => {
            if (window.AddToHomeScreenInstance) {
              // Clear display count in case modal was shown during testing
              window.AddToHomeScreenInstance.clearModalDisplayCount()
              window.AddToHomeScreenInstance.show('en')
            }
          }, 500)
        }}
        userId={userId || ''}
        userEmail={userEmail}
      />

      {/* DISABLED: Using add-to-homescreen library in index.html instead */}
      {/* <AddToHomeScreenModal
        open={showAddToHomeScreen}
        onClose={() => {
          setShowAddToHomeScreen(false)
          localStorage.setItem('pch_homescreen_dismissed_at', new Date().toISOString())
        }}
        onConfirm={() => {
          setShowAddToHomeScreen(false)
          localStorage.setItem('pch_added_to_homescreen', 'true')
        }}
      /> */}

      {/* SMS Intro Modal (first time clicking Medication tab) */}
      {showSmsIntroModal && (
        <SmsIntroModal
          userId={userId}
          onClose={() => setShowSmsIntroModal(false)}
          onSave={(phone) => {
            setHasPhone(true)
            setShowSmsIntroModal(false)
          }}
        />
      )}

      {successModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSuccessModal(null)}>
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl shadow animate-pulse">✓</div>
              <div className="mt-3 text-lg font-semibold text-emerald-800 dark:text-emerald-200">Vet Bill Saved Successfully!</div>
              <div className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-300/80">Your vet bill was saved. You can submit it to insurance when ready.</div>
            </div>
            <div className="p-6 text-sm">
              <div className="space-y-1">
                <div><span className="text-slate-500 dark:text-slate-400">Pet:</span> <span className="text-slate-900 dark:text-slate-100 font-semibold">{successModal.petName} ({successModal.species})</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Amount:</span> <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{fmtMoney(successModal.amount || 0)}</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Service Date:</span> <span className="text-slate-900 dark:text-slate-100">{successModal.serviceDate || '—'}</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Insurance:</span> <span className="text-slate-900 dark:text-slate-100">{successModal.insurance || 'Not Insured'}</span></div>
                {/* Only show Filing Deadline if pet has insurance */}
                {successModal.insurance && successModal.insurance.trim() !== '' && (
                  <div><span className="text-slate-500 dark:text-slate-400">Filing Deadline:</span> <span className="text-slate-900 dark:text-slate-100">{successModal.deadlineDate || '—'} ({(() => {
                    if (!successModal.deadlineDate) return '—'
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const deadline = new Date(successModal.deadlineDate)
                    deadline.setHours(0, 0, 0, 0)
                    const diffTime = deadline.getTime() - today.getTime()
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                    return diffDays > 0 ? `${diffDays} days remaining` : 'overdue'
                  })()})</span></div>
                )}
              </div>
                  <div className="mt-5 flex justify-center">
                <button
                  type="button"
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 text-sm font-medium w-full sm:w-auto"
                  onClick={async () => {
                    // Close modal and clear form; return to dashboard
                    setSuccessModal(null)
                    setExtracted(null)
                    setMultiExtracted(null)
                    setSelectedFile(null)
                    setErrorMessage(null)
                    setVisitNotes('')
                    setVisitTitle('')
                    setExpenseCategory('insured')
                    // Refresh claims so the new claim appears immediately
                    try {
                      if (userId) {
                        const updated = await listClaims(userId)
                        setClaims(updated)
                      }
                    } catch {}
                    setShowClaims(false)
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer with security message */}
      <footer className="mt-12 pb-8 text-center">
        <p className="text-xs text-slate-400">
          🔒 Your data is encrypted and never shared
        </p>
      </footer>
    </div>
  )
}

function AuthForm({ mode, onSwitch }: { mode: 'login' | 'signup'; onSwitch: (m: 'login' | 'signup') => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [signupNoticeEmail, setSignupNoticeEmail] = useState<string | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      try { console.log('[auth] handleSubmit start:', { mode, emailPreview: email.replace(/(.).+(@.+)/, '$1***$2') }) } catch {}
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        try { console.log('[auth] signUp result:', { hasUser: Boolean(data?.user), hasSession: Boolean(data?.session), error: error || null }) } catch {}
        if (error) throw error

        // Show verification notice; most setups require email confirmation before login
        setSignupNoticeEmail(email)
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        try { console.log('[auth] signInWithPassword result:', { hasUser: Boolean(data?.user), hasSession: Boolean(data?.session), error: error || null }) } catch {}
        if (error) throw error
        try {
          const { data: sess } = await supabase.auth.getSession()
          console.log('[auth] post-login getSession():', { hasSession: Boolean(sess?.session), userId: sess?.session?.user?.id || null })
          const raw = (typeof window !== 'undefined') ? window.localStorage?.getItem('pch.auth') : null
          console.log('[auth] localStorage pch.auth present:', Boolean(raw))
        } catch {}
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  // Show forgot password view
  if (showForgotPassword && mode === 'login') {
    return <ForgotPassword onBack={() => setShowForgotPassword(false)} />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {signupNoticeEmail && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 text-sm">
          <div className="font-medium">Account created!</div>
          <div className="text-[13px] mt-1">
            Please check your email at <span className="font-mono">{signupNoticeEmail}</span> to verify your account.
            You won't be able to log in until you confirm your email address.
          </div>
        </div>
      )}

      <div>
        <label htmlFor="auth-email" className="block text-xs font-medium text-slate-600 dark:text-slate-300">Email</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={mode === 'signup' ? 'Enter your email to get started' : 'Enter your email'}
          className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label htmlFor="auth-password" className="block text-xs font-medium text-slate-600 dark:text-slate-300">Password</label>
        <div className="mt-1 relative">
          <input
            id="auth-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Create a password (6+ characters)' : 'Enter your password'}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 pr-10 text-sm"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12a21.87 21.87 0 0 1 5.06-7.94" />
                <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
                <path d="M1 1l22 22" />
                <path d="M9.88 4.12A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8a21.87 21.87 0 0 1-2.16 3.19" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mode === 'login' && (
        <div className="text-right">
          <button
            type="button"
            onClick={() => setShowForgotPassword(true)}
            className="text-xs text-emerald-600 hover:text-emerald-700"
          >
            Forgot password?
          </button>
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {mode === 'signup' && (
        <p className="text-xs text-center text-slate-500">
          🔒 Your data is encrypted and never shared
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className={[
          'w-full inline-flex items-center justify-center rounded-lg text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60 transition-colors',
          mode === 'signup'
            ? 'bg-teal-600 hover:bg-teal-700'
            : 'bg-emerald-600 hover:bg-emerald-700'
        ].join(' ')}
      >
        {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Sign Up'}
      </button>

      {/* Helper text to switch modes */}
      <div className="text-center pt-2 border-t border-slate-200">
        <p className="text-xs text-slate-600">
          {mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => onSwitch('login')}
                className="text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Sign in instead →
              </button>
            </>
          ) : (
            <>
              New here?{' '}
              <button
                type="button"
                onClick={() => onSwitch('signup')}
                className="text-teal-600 hover:text-teal-700 font-medium"
              >
                Create an account →
              </button>
            </>
          )}
        </p>
      </div>
    </form>
  )
}
   function SettingsModal({ userId, userEmail, onClose }: { userId: string | null; userEmail: string | null; onClose: () => void }) {
    const [email, setEmail] = useState(userEmail || '')
  
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-xl font-semibold mb-4">Settings</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="settings-userid" className="block text-sm font-medium mb-1">User ID</label>
              <input
                id="settings-userid"
                type="text"
                value={userId || ''}
                disabled
                className="w-full px-3 py-2 border rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="settings-email" className="block text-sm font-medium mb-1">Email</label>
              <input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            {/* DISABLED: Using add-to-homescreen library in index.html instead */}
            {/* <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  onClose()
                  setShowAddToHomeScreen(true)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <span>🐾</span>
                <span>Add to Home Screen</span>
              </button>
            </div> */}
          </div>
          <button
            onClick={onClose}
            className="mt-6 w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  function SettingsPage({ userId, userEmail, onClose, onDefaultExpenseChange, onDefaultPeriodChange }: {
    userId: string | null;
    userEmail: string | null;
    onClose: () => void;
    onDefaultExpenseChange: (v: 'insured' | 'not_insured' | 'maybe_insured') => void;
    onDefaultPeriodChange: (v: 'all' | '2026' | '2025' | '2024' | 'last12') => void;
  }) {
    const [loading, setLoading] = useState(false)
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')
    const [address, setAddress] = useState('')
    const [city, setCity] = useState('')
    const [state, setState] = useState('')
    const [zip, setZip] = useState('')
    const [signature, setSignature] = useState<string | null>(null)

    useEffect(() => {
      if (!userId) return
      ;(async () => {
        setLoading(true)
        try {
          const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
          if (error) throw error
          if (data) {
            setFullName(data.full_name || '')
            setPhone(data.phone ? formatPhoneForDisplay(data.phone) : '')
            setAddress(data.address || '')
            setCity(data.city || '')
            setState(data.state || '')
            setZip(data.zip || '')
            setSignature(data.signature || null)
          }
        } catch (e) { console.error('[settings load] error', e) } finally { setLoading(false) }
      })()
    }, [userId])

    const saveProfile = async () => {
      if (!userId) return
      setLoading(true)
      try {
        const phoneE164 = formatPhoneForStorage(phone)

        const { error } = await supabase.from('profiles').upsert({
          id: userId,
          email: userEmail || '',
          full_name: fullName,
          phone: phoneE164 || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
        })
        if (error) throw error
        alert('Profile saved successfully!')
        onClose()
      } catch (e) { console.error('[save profile] error', e); alert('Error saving profile') } finally { setLoading(false) }
    }

    return (
      <section className="mx-auto max-w-3xl mt-6 pb-12">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-600 dark:text-slate-300">Close</button>
        </div>

        {/* Profile Information */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-sm font-semibold">Profile Information</div>
          <p className="text-xs text-slate-500 mt-1">Manage your personal information</p>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs text-slate-500">Email</label>
              <input value={userEmail || ''} readOnly className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Full Name <span className="text-red-500">*</span></label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Smith" className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Street Address <span className="text-red-500">*</span></label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <label className="block text-xs text-slate-500">City <span className="text-red-500">*</span></label>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="San Francisco" className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-3">
                <label className="block text-xs text-slate-500">State <span className="text-red-500">*</span></label>
                <input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} placeholder="CA" maxLength={2} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm uppercase" />
              </div>
              <div className="col-span-3">
                <label className="block text-xs text-slate-500">ZIP <span className="text-red-500">*</span></label>
                <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="94105" maxLength={10} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500">Phone Number <span className="text-red-500">*</span></label>
              <input value={phone} onChange={(e) => setPhone(formatPhoneOnChange(e.target.value, phone))} placeholder="(123) 456-7890" className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Signature */}
        <div className="mt-4">
          <SignatureCapture
            userId={userId!}
            initialSignature={signature}
            onSave={(sig) => setSignature(sig)}
          />
        </div>

        {/* Save Button */}
        <div className="mt-4 sticky bottom-4 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-lg">
          <button
            type="button"
            onClick={saveProfile}
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-60 transition-colors"
          >
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
          <p className="mt-2 text-xs text-center text-slate-500">
            <span className="text-red-500">*</span> Required fields for claim submission
          </p>
        </div>
      </section>
    )
  }

function SmsIntroModal({ userId, onClose, onSave }: { userId: string | null; onClose: () => void; onSave: (phone: string) => void }) {
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEnableReminders = async () => {
    if (!userId || !phone.trim() || !consent) return

    setSaving(true)
    setError(null)
    try {
      const phoneE164 = formatPhoneForStorage(phone)
      if (!phoneE164) throw new Error('Invalid phone number')

      // Save phone to profile
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ phone: phoneE164, sms_opt_in: true })
        .eq('id', userId)
      if (profErr) throw profErr

      // Save SMS consent
      let ipAddress = null
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json')
        const ipData = await ipResponse.json()
        ipAddress = ipData.ip
      } catch {
        // Ignore IP fetch errors
      }

      const { error: consentErr } = await supabase
        .from('sms_consent')
        .insert({
          user_id: userId,
          phone_number: phoneE164,
          consented: true,
          consent_text: "I agree to receive SMS medication reminders. Reply STOP to opt out, HELP for support.",
          ip_address: ipAddress
        })
      if (consentErr) {
        console.error('[SmsIntroModal] Failed to save SMS consent:', consentErr)
        // Don't fail if consent logging fails
      }

      onSave(phoneE164)
    } catch (e: any) {
      setError(e?.message || 'Failed to save phone number')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {error && <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🐾</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Never forget a dose</div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Get a friendly text when it's medication time</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneOnChange(e.target.value, phone))}
              placeholder="(555) 123-4567"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-2 border-slate-400 dark:border-slate-500 checked:bg-emerald-600 checked:border-emerald-600"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300">
              I agree to receive SMS medication reminders. Reply STOP to opt out, HELP for support.
            </span>
          </label>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={!phone.trim() || !consent || saving}
            onClick={handleEnableReminders}
            className="flex-1 h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] hover:shadow-lg text-white px-4 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-200 text-sm font-medium"
          >
            {saving ? 'Saving…' : 'Enable Reminders'}
          </button>
        </div>
      </div>
    </div>
  )
}

