import { useEffect, useMemo, useRef, useState } from 'react'
import { fileToDataUrl } from './lib/fileUtils'
import type { ExtractedBill, LineItem, PetProfile, PetSpecies, InsuranceCompany, MultiPetExtracted, ExtractedPetGroup } from './types'
import { pdfFileToPngDataUrl } from './lib/pdfToImage'
import { dbLoadPets, dbUpsertPet, dbDeletePet, dbEnsureProfile } from './lib/petStorage'
import { supabase } from './lib/supabase'
import { generateClaimPdf, generateClaimPdfForPet } from './lib/pdfClaim'
import AddMedicationForm from './components/AddMedicationForm'
import OnboardingModal from './components/OnboardingModal'
import FinancialSummary from './components/FinancialSummary'
import MedicationsDashboard from './components/MedicationsDashboard'
import { createClaim, listClaims, updateClaim, deleteClaim as dbDeleteClaim } from './lib/claims'
import React from 'react'

type SelectedFile = {
  file: File
  objectUrl?: string
}

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedBill | null>(null)
  const [pets, setPets] = useState<PetProfile[]>([])
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null)
  const selectedPet = useMemo(() => pets.find(p => p.id === selectedPetId) ?? null, [pets, selectedPetId])
  const [visitNotes, setVisitNotes] = useState('')  // NEW: For visit notes
  const [visitTitle, setVisitTitle] = useState('')  // NEW: User friendly title
  const [expenseCategory, setExpenseCategory] = useState<'insured' | 'not_insured' | 'maybe_insured'>('insured')
  const [addingPet, setAddingPet] = useState(false)
  const [newPet, setNewPet] = useState<{ name: string; species: PetSpecies; insuranceCompany: InsuranceCompany; policyNumber: string; ownerName: string; ownerAddress: string; ownerPhone: string; filing_deadline_days?: number | '' }>({
    name: '',
    species: 'dog',
    insuranceCompany: '',
    policyNumber: '',
    ownerName: '',
    ownerAddress: '',
    ownerPhone: '',
    filing_deadline_days: ''
  })
  const [editingPetId, setEditingPetId] = useState<string | null>(null)
  const [editPet, setEditPet] = useState<{
    name: string;
    species: PetSpecies;
    insuranceCompany: InsuranceCompany;
    policyNumber: string;
    ownerName: string;
    ownerAddress: string;
    ownerPhone: string;
    filing_deadline_days?: number | '';
    monthly_premium?: number | '';
    deductible_per_claim?: number | '';
    coverage_start_date?: string;
  } | null>(null)
  const [newPetInsurer, setNewPetInsurer] = useState<'Trupanion' | 'Nationwide' | 'Healthy Paws' | 'Fetch' | 'Custom Insurance' | ''>('')
  const [editPetInsurer, setEditPetInsurer] = useState<'Trupanion' | 'Nationwide' | 'Healthy Paws' | 'Fetch' | 'Custom Insurance' | ''>('')
  const [customInsurerNameNew, setCustomInsurerNameNew] = useState('')
  const [customDeadlineNew, setCustomDeadlineNew] = useState<string>('')
  const [customInsurerNameEdit, setCustomInsurerNameEdit] = useState('')
  const [customDeadlineEdit, setCustomDeadlineEdit] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [authView, setAuthView] = useState<'login' | 'signup' | 'app'>('app')

  // Multi-pet extraction state
  const [multiExtracted, setMultiExtracted] = useState<MultiPetExtracted | null>(null)
  const [petMatches, setPetMatches] = useState<(string | null)[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [pendingMatchIndex, setPendingMatchIndex] = useState<number | null>(null)
  const petsSectionRef = useRef<HTMLDivElement | null>(null)
  const claimsSectionRef = useRef<HTMLDivElement | null>(null)
  const [claims, setClaims] = useState<any[]>([])
  const [showClaims, setShowClaims] = useState(false)
  const [claimsSort, setClaimsSort] = useState<'urgent' | 'date_newest' | 'date_oldest' | 'amount_high' | 'amount_low' | 'pet' | 'status'>('urgent')
  const [finPeriod, setFinPeriod] = useState<'all' | '2025' | '2024' | 'last12'>('all')
  const [activeView, setActiveView] = useState<'app' | 'settings' | 'medications'>('app')
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
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
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
  const [medQuestionOpen, setMedQuestionOpen] = useState(false)
  const [medSelectOpen, setMedSelectOpen] = useState(false)
  const [medicationsForPet, setMedicationsForPet] = useState<any[]>([])
  const [selectedMedicationIds, setSelectedMedicationIds] = useState<string[]>([])
  const [createdClaimId, setCreatedClaimId] = useState<string | null>(null)
  const [pendingSuccess, setPendingSuccess] = useState<null | typeof successModal>(null)
  const [showAddMedication, setShowAddMedication] = useState(false)

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
    const session = supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s?.user) {
        setUserEmail(s.user.email ?? null)
        setUserId(s.user.id)
        dbEnsureProfile(s.user.id, s.user.email ?? null).catch(() => {})
        setAuthView('app')
        dbLoadPets(s.user.id).then((p) => { setPets(p); if ((p || []).length === 0) setShowOnboarding(true) }).catch(() => setPets([]))
        listClaims(s.user.id).then(setClaims).catch(() => setClaims([]))
      } else {
        setAuthView('signup')
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email ?? null)
        setUserId(session.user.id)
        dbEnsureProfile(session.user.id, session.user.email ?? null).catch(() => {})
        setAuthView('app')
        dbLoadPets(session.user.id).then((p) => { setPets(p); if ((p || []).length === 0) setShowOnboarding(true) }).catch(() => setPets([]))
        listClaims(session.user.id).then(setClaims).catch(() => setClaims([]))
      } else {
        setUserEmail(null)
        setUserId(null)
        setPets([])
        setAuthView('signup')
      }
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  // Persist financial period filter
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pch.finPeriod') as 'all' | '2025' | '2024' | 'last12' | null
      if (saved) setFinPeriod(saved)
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('pch.finPeriod', finPeriod) } catch {}
  }, [finPeriod])

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
    if (!newPetInsurer) { alert('Please select an insurance company'); return }
    if (newPetInsurer === 'Custom Insurance') {
      const nm = customInsurerNameNew.trim()
      const dd = Number(customDeadlineNew)
      if (!nm) { alert('Enter custom insurance company name'); return }
      if (!Number.isFinite(dd) || dd < 1 || dd > 365) { alert('Deadline must be 1-365 days'); return }
      newPet.insuranceCompany = nm as any
      newPet.filing_deadline_days = dd
    } else {
      newPet.insuranceCompany = newPetInsurer as any
      newPet.filing_deadline_days = 90
    }
    const id = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()))
    const created: PetProfile = {
      id,
      name: trimmedName,
      species: newPet.species,
      insuranceCompany: newPet.insuranceCompany,
      policyNumber: newPet.policyNumber.trim(),
      ownerName: newPet.ownerName.trim(),
      ownerAddress: newPet.ownerAddress.trim(),
      ownerPhone: newPet.ownerPhone.trim(),
      filing_deadline_days: (newPet as any).filing_deadline_days as any,
    }
    const updated = [...pets, created]
    setPets(updated)
    if (userId) {
      dbUpsertPet(userId, created).catch((e) => { console.error('[addPet] upsert error', e) })
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
    setNewPet({ name: '', species: 'dog', insuranceCompany: '', policyNumber: '', ownerName: '', ownerAddress: '', ownerPhone: '', filing_deadline_days: '' })
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
      policyNumber: pet.policyNumber,
      ownerName: pet.ownerName || '',
      ownerAddress: pet.ownerAddress || '',
      ownerPhone: pet.ownerPhone || '',
      filing_deadline_days: (pet as any).filing_deadline_days || '',
      monthly_premium: (pet as any).monthly_premium ?? '',
      deductible_per_claim: (pet as any).deductible_per_claim ?? '',
      coverage_start_date: (pet as any).coverage_start_date || ''
    })
    const known = ['Trupanion','Nationwide','Healthy Paws','Fetch']
    if (known.includes(pet.insuranceCompany)) {
      setEditPetInsurer(pet.insuranceCompany as any)
      setCustomInsurerNameEdit('')
      setCustomDeadlineEdit(String((pet as any).filing_deadline_days || ''))
    } else {
      setEditPetInsurer('Custom Insurance')
      setCustomInsurerNameEdit(pet.insuranceCompany)
      setCustomDeadlineEdit(String((pet as any).filing_deadline_days || ''))
    }
  }

  const saveEdit = () => {
    if (!editingPetId || !editPet) return
    if (!editPetInsurer) { alert('Please select an insurance company'); return }
    let finalCompany = ''
    let finalDays: number | '' = ''
    if (editPetInsurer === 'Custom Insurance') {
      const nm = customInsurerNameEdit.trim()
      const dd = Number(customDeadlineEdit)
      if (!nm) { alert('Enter custom insurance company name'); return }
      if (!Number.isFinite(dd) || dd < 1 || dd > 365) { alert('Deadline must be 1-365 days'); return }
      finalCompany = nm
      finalDays = dd
    } else {
      finalCompany = editPetInsurer
      finalDays = 90
    }
    const updated = pets.map((p) =>
      p.id === editingPetId
        ? {
            ...p,
            name: editPet.name.trim(),
            species: editPet.species,
            insuranceCompany: finalCompany as any,
            policyNumber: editPet.policyNumber.trim(),
            ownerName: editPet.ownerName.trim(),
            ownerAddress: editPet.ownerAddress.trim(),
            ownerPhone: editPet.ownerPhone.trim(),
            filing_deadline_days: finalDays as any,
            monthly_premium: editPet.monthly_premium === '' ? null : Number(editPet.monthly_premium),
            deductible_per_claim: editPet.deductible_per_claim === '' ? null : Number(editPet.deductible_per_claim),
            coverage_start_date: editPet.coverage_start_date || null,
          }
        : p,
    )
    setPets(updated)
    if (userId) {
      const toSave = updated.find(p => p.id === editingPetId)
      if (toSave) dbUpsertPet(userId, toSave).catch((e) => { console.error('[saveEdit] upsert error', e) })
    }
    setEditingPetId(null)
    setEditPet(null)
  }

  const handlePick = () => inputRef.current?.click()

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const processFile = (file: File | undefined | null) => {
    if (!file) {
      setSelectedFile(null)
      return
    }
    const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf'
    if (!isAllowed) {
      setSelectedFile(null)
      return
    }
    const isImage = file.type.startsWith('image/')
    const objectUrl = isImage ? URL.createObjectURL(file) : undefined
    setSelectedFile({ file, objectUrl })
    setExtracted(null)
    setErrorMessage(null)
  }

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    processFile(e.target.files?.[0])
  }

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
      const path = `${uid}/${claimId}.pdf`
      const { error } = await supabase.storage.from('claim-pdfs').upload(path, blob, { upsert: true, contentType: 'application/pdf' })
      if (error) throw error
      await updateClaim(claimId, { pdf_path: path })
      return path
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[uploadClaimPdf] error', e)
      return null
    }
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
    if (days <= 90) return { color: 'border-orange-300 bg-orange-50', msg: '⚠️ File this claim immediately' }
    return { color: 'border-red-300 bg-red-50', msg: '🚨 URGENT - You may be past your deadline!' }
  }

  const handleProcess = async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    setErrorMessage(null)
    try {
      // eslint-disable-next-line no-console
      console.log('[extract] starting server-side extraction, file type:', selectedFile.file.type)
      const apiBase = import.meta.env.DEV ? 'http://localhost:3000' : 'https://pet-claim-helper.onrender.com'
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
      if (!json || json.ok !== true || !json.data) {
        // eslint-disable-next-line no-console
        console.error('[extract] bad response shape', json)
        throw new Error('Invalid extraction response')
      }
      const parsed: any = json.data
      if (!parsed) {
        // eslint-disable-next-line no-console
        console.error('[extract] empty parsed data from server response')
        throw new Error('Could not parse JSON from server response.')
      }

      // Try multi-pet first
      const maybeMulti = normalizeMultiExtracted(parsed)
      if (maybeMulti && maybeMulti.pets.length > 1) {
        setMultiExtracted(maybeMulti)
        setExtracted(null)
        // Auto-suggest matches by name similarity
        const suggestions = getSuggestedMatches(maybeMulti.pets, pets)
        setPetMatches(suggestions)
        return
      }

      // Fallback to single pet
      const normalized = normalizeExtracted(parsed)
      if (selectedPet) {
        normalized.petName = selectedPet.name
      }
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
    return typeof c.filing_deadline_days === 'number' && c.filing_deadline_days > 0 ? c.filing_deadline_days : 90
  }
  const getServiceDate = (c: any): Date | null => {
    if (!c.service_date) return null
    const d = new Date(c.service_date)
    return Number.isNaN(d.getTime()) ? null : d
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
        return { text: 'Submitted', cls: 'bg-blue-50 text-blue-700' }
      case 'approved':
        return { text: 'Approved', cls: 'bg-emerald-50 text-emerald-700' }
      case 'paid':
        return { text: 'Paid', cls: 'bg-emerald-50 text-emerald-700' }
      case 'denied':
        return { text: 'Denied', cls: 'bg-rose-50 text-rose-700' }
      case 'not_filed': // legacy
      default:
        return { text: 'Not Submitted', cls: 'bg-slate-100 text-slate-700' }
    }
  }
  const deadlineBadge = (c: any): { text: string; cls: string } => {
    const rem = getDaysRemaining(c)
    const stRaw = (c.filing_status || 'not_submitted').toLowerCase()
    const st = stRaw === 'filed' ? 'submitted' : stRaw
    
    // Different badges for different statuses
    if (st === 'submitted') return { text: '📤 Submitted - Pending', cls: 'bg-blue-100 text-blue-800 border border-blue-200' }
    if (st === 'approved') return { text: '✅ Approved', cls: 'bg-green-100 text-green-800 border border-green-200' }
    if (st === 'paid') return { text: '💰 Paid', cls: 'bg-green-100 text-green-800 border border-green-200' }
    if (st === 'denied') return { text: '❌ Denied', cls: 'bg-red-100 text-red-800 border border-red-200' }
    
    // Deadline urgency for not submitted
    if (rem === null) return { text: 'No date', cls: 'bg-slate-100 text-slate-600' }
    if (rem >= 15) return { text: '✅ Plenty of time', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
    if (rem >= 7) return { text: `⚠️ Due soon - ${rem} days`, cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300 font-semibold' }
    if (rem >= 1) return { text: `🚨 ${rem} days left!`, cls: 'bg-red-100 text-red-800 border border-red-300 font-bold animate-pulse' }
    return { text: '❌ Deadline passed', cls: 'bg-slate-200 text-slate-700 font-medium' }
  }
  const fmtMoney = (n: number | null | undefined): string => {
    const val = typeof n === 'number' && Number.isFinite(n) ? n : 0
    return `$${val.toFixed(2)}`
  }
  const sortedClaims = useMemo(() => {
    const arr = [...claims]
    const key = claimsSort
    const urgentScore = (c: any) => {
      const st = (c.filing_status || 'not_submitted').toLowerCase()
      const rem = getDaysRemaining(c)
      if (st !== 'not_submitted' && st !== 'not_filed') return 9999 // non-urgent if already submitted
      return rem === null ? 9998 : rem // smaller rem => more urgent
    }
    arr.sort((a, b) => {
      switch (key) {
        case 'date_newest': {
          const da = getServiceDate(a)?.getTime() || 0
          const db = getServiceDate(b)?.getTime() || 0
          return db - da
        }
        case 'date_oldest': {
          const da = getServiceDate(a)?.getTime() || 0
          const db = getServiceDate(b)?.getTime() || 0
          return da - db
        }
        case 'amount_high': {
          const aa = a.total_amount || 0
          const ab = b.total_amount || 0
          return (ab as number) - (aa as number)
        }
        case 'amount_low': {
          const aa = a.total_amount || 0
          const ab = b.total_amount || 0
          return (aa as number) - (ab as number)
        }
        case 'pet': {
          return (a.pets?.name || '').localeCompare(b.pets?.name || '')
        }
        case 'status': {
          return (a.filing_status || '').localeCompare(b.filing_status || '')
        }
        case 'urgent':
        default:
          return urgentScore(a) - urgentScore(b)
      }
    })
    return arr
  }, [claims, claimsSort])

  const claimsSummary = useMemo(() => {
    const total = claims.length
    const notFiled = claims.filter(c => (c.filing_status || 'not_filed').toLowerCase() === 'not_filed')
    const notFiledSum = notFiled.reduce((s, c) => s + (c.total_amount || 0), 0)
    const filedPending = claims.filter(c => ['filed'].includes((c.filing_status || '').toLowerCase())).length
    const expiringSoon = notFiled.filter(c => {
      const rem = getDaysRemaining(c)
      return rem !== null && rem >= 1 && rem <= 14
    }).length
    return { total, notFiledCount: notFiled.length, notFiledSum, filedPending, expiringSoon }
  }, [claims])

  // Financial aggregates
  const financial = useMemo(() => {
    // Filter claims by selected period
    const filtered = claims.filter((c) => {
      const d = c.service_date ? new Date(c.service_date) : null
      if (!d || Number.isNaN(d.getTime())) return false
      if (finPeriod === 'all') return true
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

    for (const c of filtered) {
      const amt = Number(c.total_amount || 0)
      const status = String(c.filing_status || 'not_filed').toLowerCase()
      const cat = (c.expense_category || 'insured') as 'insured' | 'not_insured' | 'maybe_insured'
      const svcDate = c.service_date ? new Date(c.service_date) : null
      grandTotal += amt
      byCategory[cat].sum += amt
      byCategory[cat].count += 1

      if (status === 'paid') {
        const paidAmt = Number((c as any).reimbursed_amount || 0)
        reimbursed += paidAmt
      } else if (status === 'filed' || status === 'approved') {
        awaiting += amt
      }
      if (status === 'denied' || cat === 'not_insured') outOfPocket += amt

      // Money Coming Back: approved claims only
      if (status === 'approved') awaitingInsured += amt

      if (svcDate && !Number.isNaN(svcDate.getTime())) {
        periodSpent += amt
        if (status === 'paid') {
          const paidAmt = Number((c as any).reimbursed_amount || 0)
          periodReimbursed += paidAmt
        }
      }

      const petName = c.pets?.name || 'Unknown Pet'
      if (!perPet[petName]) perPet[petName] = { sum: 0, count: 0 }
      perPet[petName].sum += amt
      perPet[petName].count += 1
    }

    const periodNet = periodSpent - periodReimbursed
    return { byCategory, reimbursed, awaiting, outOfPocket, grandTotal, perPet, awaitingInsured, periodSpent, periodReimbursed, periodNet }
  }, [claims, finPeriod])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100">
      <header className="px-6 py-5">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
          <img src="/pch-logo.png" alt="Pet Claim Helper" className="h-14 w-14 object-contain" />
            <span className="text-xl font-semibold tracking-tight">Pet Claim Helper</span>
          </div>
          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-3">
            {authView === 'app' && (
              <button
                type="button"
                onClick={() => claimsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="relative inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-3 py-1.5 text-xs hover:shadow"
              >
                Claims ({claims.length})
                {claimsSummary.expiringSoon > 0 && (
                  <span className="ml-2 inline-block h-2 w-2 rounded-full bg-rose-500" aria-hidden />
                )}
              </button>
            )}
            {authView === 'app' && (
              <button
                type="button"
                onClick={() => setActiveView(v => v === 'app' ? 'settings' : 'app')}
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-3 py-1.5 text-xs hover:shadow"
              >
                ⚙️ Settings
              </button>
            )}
            {authView === 'app' && (
              <button
                type="button"
                onClick={() => setActiveView(v => v === 'medications' ? 'app' : 'medications')}
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-3 py-1.5 text-xs hover:shadow"
              >
                💊 Medications
              </button>
            )}
            {authView === 'app' && (
  <button
    type="button"
    onClick={async () => {
      try {
        const response = await fetch('http://localhost:8787/api/send-reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        const data = await response.json()
        alert(`✅ ${data.message}\n\nEmails sent: ${data.sent}\nTotal expiring claims: ${data.totalClaims}`)
      } catch (error) {
        alert('❌ Error sending reminders: ' + (error as Error).message)
      }
    }}
    className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-3 py-1.5 text-xs hover:shadow"
  >
    📧 Send Reminders
  </button>
)}
            {userEmail && <span className="text-xs text-slate-600 dark:text-slate-300">Logged in as: {userEmail}</span>}
            {userEmail && (
              <button onClick={handleLogout} className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-3 py-1.5 text-xs hover:shadow">Logout</button>
            )}
          </div>
          {/* Mobile hamburger */}
          <div className="md:hidden">
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/5 px-3 py-2 text-sm"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* Mobile slide-out menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-white dark:bg-slate-900 shadow-xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Menu</div>
              <button type="button" className="text-sm" onClick={() => setMobileMenuOpen(false)}>Close</button>
            </div>
            {authView === 'app' && (
              <>
                <button type="button" className="w-full h-12 rounded-lg border border-slate-200 dark:border-slate-700 text-left px-4" onClick={() => { setMobileMenuOpen(false); claimsSectionRef.current?.scrollIntoView({ behavior: 'smooth' }) }}>Pet Claims</button>
                <button type="button" className="w-full h-12 rounded-lg border border-slate-200 dark:border-slate-700 text-left px-4" onClick={() => { setMobileMenuOpen(false); setActiveView('medications') }}>Medications</button>
                <button type="button" className="w-full h-12 rounded-lg border border-slate-200 dark:border-slate-700 text-left px-4" onClick={() => { setMobileMenuOpen(false); setActiveView(v => v === 'app' ? 'settings' : 'app') }}>Settings</button>
                <button type="button" className="w-full h-12 rounded-lg border border-slate-200 dark:border-slate-700 text-left px-4" onClick={async () => {
                  try {
                    const response = await fetch('http://localhost:8787/api/send-reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
                    const data = await response.json()
                    alert(`✅ ${data.message}\n\nEmails sent: ${data.sent}\nTotal expiring claims: ${data.totalClaims}`)
                  } catch (error) {
                    alert('❌ Error sending reminders: ' + (error as Error).message)
                  } finally {
                    setMobileMenuOpen(false)
                  }
                }}>Send Reminders</button>
                {userEmail && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-2">Logged in as: {userEmail}</div>
                )}
                {userEmail && (
                  <button type="button" className="w-full h-12 rounded-lg bg-rose-600 hover:bg-rose-700 text-white" onClick={() => { setMobileMenuOpen(false); handleLogout() }}>Logout</button>
                )}
              </>
            )}
          </div>
        </div>
      )}

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
            <MedicationsDashboard userId={userId} pets={pets} />
          </section>
        )}
        {authView !== 'app' && (
          <section className="mx-auto max-w-md mt-8">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm">
              <div className="px-6 pt-4">
                <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAuthView('signup')}
                    className={[
                      'pb-3 text-sm font-medium transition-colors',
                      authView === 'signup' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    ].join(' ')}
                  >
                    Sign Up
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthView('login')}
                    className={[
                      'pb-3 text-sm font-medium transition-colors',
                      authView === 'login' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    ].join(' ')}
                  >
                    Log In
                  </button>
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

          {addingPet && (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Name</label>
                  <input value={newPet.name} onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Species</label>
                  <select value={newPet.species} onChange={(e) => setNewPet({ ...newPet, species: e.target.value as PetSpecies })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm">
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Insurance Information</div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500">Insurance Company</label>
                        <select value={newPetInsurer} onChange={(e) => {
                          const v = e.target.value as any
                          setNewPetInsurer(v)
                          if (v === 'Custom Insurance') {
                            setNewPet({ ...newPet, insuranceCompany: '' as any, filing_deadline_days: '' })
                          } else if (v) {
                            setNewPet({ ...newPet, insuranceCompany: v as any, filing_deadline_days: 90 })
                          }
                        }} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm">
                          <option value="">— Select —</option>
                          <option value="Trupanion">Trupanion (90 days)</option>
                          <option value="Nationwide">Nationwide (90 days)</option>
                          <option value="Healthy Paws">Healthy Paws (90 days)</option>
                          <option value="Fetch">Fetch (90 days)</option>
                          <option value="Custom Insurance">Custom Insurance</option>
                        </select>
                      </div>
                      {newPetInsurer === 'Custom Insurance' ? (
                        <>
                          <div>
                            <label className="block text-xs text-slate-500">Insurance Company Name</label>
                            <input value={customInsurerNameNew} onChange={(e) => setCustomInsurerNameNew(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500">Filing Deadline (days)</label>
                            <input type="number" min={1} max={365} value={customDeadlineNew} onChange={(e) => setCustomDeadlineNew(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                          </div>
                        </>
                      ) : (
                        <div className="sm:col-span-1 flex items-end text-xs text-slate-600">{newPetInsurer ? 'Filing Deadline: 90 days' : ''}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Policy #</label>
                  <input value={newPet.policyNumber} onChange={(e) => setNewPet({ ...newPet, policyNumber: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Owner Name</label>
                  <input value={newPet.ownerName} onChange={(e) => setNewPet({ ...newPet, ownerName: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Owner Address</label>
                  <input value={newPet.ownerAddress} onChange={(e) => setNewPet({ ...newPet, ownerAddress: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Owner Phone</label>
                  <input value={newPet.ownerPhone} onChange={(e) => setNewPet({ ...newPet, ownerPhone: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={addPet} className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm">Save Pet</button>
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
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-semibold flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pet.color || (pet.species === 'dog' ? '#3B82F6' : pet.species === 'cat' ? '#F97316' : '#6B7280') }} />
                      {pet.name}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 capitalize">{pet.species}</div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch gap-3 w-32 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedPetId(pet.id)}
                      className={[
                        'inline-flex items-center justify-center rounded-lg px-3 py-1.5 h-12 text-sm hover:shadow w-full sm:w-auto',
                        selectedPetId === pet.id
                          ? (pet.species === 'dog'
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-orange-600 hover:bg-orange-700 text-white')
                          : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                      ].join(' ')}
                    >
                      {selectedPetId === pet.id ? 'Selected' : 'Use This Pet'}
                    </button>
                    <button type="button" onClick={() => startEditPet(pet)} className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 w-full sm:w-auto px-3">Edit</button>
                  </div>
                </div>
                <div className="mt-4 text-sm text-slate-700 dark:text-slate-300 space-y-1.5">
                  <div><span className="text-slate-500">Insurance:</span> {pet.insuranceCompany}</div>
                  <div><span className="text-slate-500">Policy #:</span> {pet.policyNumber || '—'}</div>
                  {(pet.ownerName || pet.ownerAddress || pet.ownerPhone) && (
                    <div className="mt-3 space-y-1.5">
                      <div><span className="text-slate-500">Owner:</span> {pet.ownerName || ''}</div>
                      <div><span className="text-slate-500">Address:</span> {pet.ownerAddress || ''}</div>
                      <div><span className="text-slate-500">Phone:</span> {pet.ownerPhone || ''}</div>
                    </div>
                  )}
                </div>
                {editingPetId === pet.id && editPet && (
                  <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs">Name</label>
                        <input value={editPet.name} onChange={(e) => setEditPet({ ...editPet, name: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs">Species</label>
                        <select value={editPet.species} onChange={(e) => setEditPet({ ...editPet, species: e.target.value as PetSpecies })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm">
                          <option value="dog">Dog</option>
                          <option value="cat">Cat</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Insurance Information</div>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-slate-500">Insurance Company</label>
                              <select value={editPetInsurer} onChange={(e) => {
                                const v = e.target.value as any
                                setEditPetInsurer(v)
                                if (v === 'Custom Insurance') {
                                  setEditPet({ ...editPet, insuranceCompany: '' as any, filing_deadline_days: '' })
                                } else if (v) {
                                  setEditPet({ ...editPet, insuranceCompany: v as any, filing_deadline_days: 90 })
                                }
                              }} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm">
                                <option value="">— Select —</option>
                                <option value="Trupanion">Trupanion (90 days)</option>
                                <option value="Nationwide">Nationwide (90 days)</option>
                                <option value="Healthy Paws">Healthy Paws (90 days)</option>
                                <option value="Fetch">Fetch (90 days)</option>
                                <option value="Custom Insurance">Custom Insurance</option>
                              </select>
                            </div>
                            {editPetInsurer === 'Custom Insurance' ? (
                              <>
                                <div>
                                  <label className="block text-xs text-slate-500">Insurance Company Name</label>
                                  <input value={customInsurerNameEdit} onChange={(e) => setCustomInsurerNameEdit(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-slate-500">Filing Deadline (days)</label>
                                  <input type="number" min={1} max={365} value={customDeadlineEdit} onChange={(e) => setCustomDeadlineEdit(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                                </div>
                              </>
                            ) : (
                              <div className="sm:col-span-1 flex items-end text-xs text-slate-600">{editPetInsurer ? 'Filing Deadline: 90 days' : ''}</div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs">Policy #</label>
                        <input value={editPet.policyNumber} onChange={(e) => setEditPet({ ...editPet, policyNumber: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs">Monthly Premium (USD)</label>
                        <input type="number" step="0.01" placeholder="e.g., 38.00" value={String(editPet.monthly_premium ?? '')} onChange={(e) => setEditPet({ ...editPet, monthly_premium: e.target.value === '' ? '' : Number(e.target.value) })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                        <div className="mt-1 text-[11px] text-slate-500">Monthly insurance premium cost</div>
                      </div>
                      <div>
                        <label className="block text-xs">Deductible per Claim (USD)</label>
                        <input type="number" step="0.01" placeholder="e.g., 250.00" value={String(editPet.deductible_per_claim ?? '')} onChange={(e) => setEditPet({ ...editPet, deductible_per_claim: e.target.value === '' ? '' : Number(e.target.value) })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                        <div className="mt-1 text-[11px] text-slate-500">Deductible amount per claim</div>
                      </div>
                      <div>
                        <label className="block text-xs">Coverage Start Date</label>
                        <input type="date" value={editPet.coverage_start_date || ''} onChange={(e) => setEditPet({ ...editPet, coverage_start_date: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                        <div className="mt-1 text-[11px] text-slate-500">When did your coverage start?</div>
                      </div>
                      <div>
                        <label className="block text-xs">Owner Name</label>
                        <input value={editPet.ownerName} onChange={(e) => setEditPet({ ...editPet, ownerName: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs">Owner Address</label>
                        <input value={editPet.ownerAddress} onChange={(e) => setEditPet({ ...editPet, ownerAddress: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs">Owner Phone</label>
                        <input value={editPet.ownerPhone} onChange={(e) => setEditPet({ ...editPet, ownerPhone: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button type="button" onClick={saveEdit} className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm">Save</button>
                      <button type="button" onClick={() => {
  if (!editingPetId) return
  const petToDelete = pets.find(p => p.id === editingPetId)
  const petName = petToDelete?.name || 'this pet'
  
  if (!confirm(`⚠️ Delete ${petName}?\n\nThis will NOT delete claims for this pet, but you won't be able to file new claims.\n\nThis cannot be undone!`)) return
  
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

        {/* Upload section */}
        {authView === 'app' && (
        <section className="mx-auto max-w-3xl text-center mt-8 px-2">
          <h2 className="text-2xl font-semibold">File Your Claim</h2>
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
                        onClick={handleProcess}
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
                  <li key={idx}>{pg.petName || `Pet ${idx + 1}`} ({pg.petSpecies || 'Pet'}) — {pg.subtotal || computeSubtotal(pg.lineItems)}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">We'll create a separate claim for each pet.</p>

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
                          const svcDate = multiExtracted.dateOfService ? new Date(multiExtracted.dateOfService) : null
                          const deadlineDate = svcDate ? new Date(svcDate.getTime()) : null
                          if (deadlineDate) deadlineDate.setDate(deadlineDate.getDate() + filingDaysToUse)
                          const row: any = await createClaim({
                            user_id: userId,
                            pet_id: matchedPet ? matchedPet.id : null,
                            service_date: multiExtracted.dateOfService || null,
                            invoice_number: multiExtracted.invoiceNumber || null,
                            clinic_name: multiExtracted.clinicName || null,
                            clinic_address: multiExtracted.clinicAddress || null,
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
                    alert(`✓ ${files.length} claims generated and downloaded!\n` + files.map(f => `- ${f.name} (${f.amount})`).join('\n') + '\n\nEmail each claim to your insurance company.')
                  }}
                >
                  Generate Claims
                </button>
              </div>
            </div>
          </section>
        )}

        {extracted && (
          <section className="mx-auto mt-8 max-w-3xl">
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
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Pet Name</label>
                  <input value={extracted.petName} onChange={(e) => setExtracted({ ...extracted, petName: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Date of Service</label>
                  <input value={extracted.dateOfService} onChange={(e) => setExtracted({ ...extracted, dateOfService: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Invoice Number</label>
                  <input value={extracted.invoiceNumber || ''} onChange={(e) => setExtracted({ ...extracted, invoiceNumber: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Total Amount</label>
                  <input value={extracted.totalAmount} onChange={(e) => setExtracted({ ...extracted, totalAmount: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
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
                        <input
                          placeholder="Amount"
                          value={item.amount}
                          onChange={(e) => {
                            const copy = [...extracted.lineItems]
                            copy[idx] = { ...copy[idx], amount: e.target.value }
                            setExtracted({ ...extracted, lineItems: copy })
                          }}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm"
                        />
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

              {/* Enhanced Filing Deadline Reminder (pre-save) */}
              {expenseCategory !== 'not_insured' && (() => {
                const filingDays = Number((selectedPet as any)?.filing_deadline_days) || 90
                const svc = extracted.dateOfService ? new Date(extracted.dateOfService) : null
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
                      <div className="mt-2 text-sm text-rose-900">Most insurers won't accept claims this old.</div>
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
                        <div className="font-bold text-slate-900 dark:text-slate-100">{extracted.dateOfService ? new Date(extracted.dateOfService).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</div>
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
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                  onClick={async () => {
                    // Require pet selected
                    if (!selectedPet) {
                      setPetSelectError(true)
                      return
                    }
                    // Save single-pet claim only (PDF will be generated on-demand when user clicks "View My Claim")
                    // Compute deadline based on service date and filing window
                    const filingDaysToUse = Number((selectedPet as any)?.filing_deadline_days) || 90
                    const svcDate = extracted.dateOfService ? new Date(extracted.dateOfService) : null
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
                          visit_title: visitTitle || null,
                          diagnosis: extracted.diagnosis || null,
                          total_amount: totalNum,
                          line_items: extracted.lineItems,
                      filing_status: 'not_submitted',
                          filing_deadline_days: filingDaysToUse,
                          visit_notes: visitNotes || null,
                          expense_category: expenseCategory,
                        })
                      } catch (e) { console.error('[createClaim single] error', e) }
                    }
                    // Prepare success details and open medication question flow
                    const pending = {
                      claimId: row?.id || null,
                      petName: selectedPet?.name || 'Unknown',
                      species: selectedPet?.species || '',
                      amount: parseAmountToNumber(String(extracted.totalAmount || '')),
                      serviceDate: extracted.dateOfService || null,
                      insurance: selectedPet?.insuranceCompany || '',
                      deadlineDate: (computedDeadlineDate ? computedDeadlineDate.toISOString().slice(0,10) : null),
                      deadlineDays: filingDaysToUse,
                    } as typeof successModal
                    setPendingSuccess(pending)
                    setCreatedClaimId(row?.id || null)
                    // eslint-disable-next-line no-console
                    console.log('[LOOKS GOOD CLICKED] About to show medication modal', { claimId: row?.id })
                    setMedQuestionOpen(true)
                    // Do not clear form here; wait for user action (Done / File Another)
                  }}
                >
                  Looks Good
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Financial Summary */}
        {authView === 'app' && claims.length > 0 && (
          <section className="mx-auto mt-10 max-w-5xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Financial Summary</h2>
              <div className="text-sm">
                <label className="mr-2 text-slate-600">Show expenses for:</label>
                <select
                  value={finPeriod}
                  onChange={(e) => setFinPeriod(e.target.value as any)}
                  className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                >
                  <option value="all">All Time</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                  <option value="last12">Last 12 Months</option>
                </select>
              </div>
            </div>

            {/* Money Coming Back */}
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-900/10">
              <div className="text-sm font-semibold">💰 MONEY COMING BACK TO YOU</div>
              <div className="mt-2 text-3xl font-bold text-emerald-700">{fmtMoney(financial.awaitingInsured)}</div>
              <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300">Sum of approved claims awaiting reimbursement</div>
            </div>

            {/* Actual Cost */}
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-900/10">
              <div className="text-sm font-semibold">💸 YOUR ACTUAL COST</div>
              <div className="mt-2 text-3xl font-bold text-rose-700">{fmtMoney(financial.outOfPocket)}</div>
              <div className="mt-1 text-xs text-rose-800/80 dark:text-rose-300">Not insured + any denied claims</div>
            </div>

            {/* This Year's Total */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-sm font-semibold">{(() => {
                if (finPeriod === 'all') return '📊 ALL TIME TOTAL'
                if (finPeriod === '2025') return '📊 2025 TOTAL'
                if (finPeriod === '2024') return '📊 2024 TOTAL'
                return "📊 LAST 12 MONTHS"
              })()}</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Spent on all pets</div>
                  <div className="text-2xl font-bold">{fmtMoney(financial.periodSpent)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Reimbursed so far</div>
                  <div className="text-2xl font-bold">{fmtMoney(financial.periodReimbursed)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Net cost to you</div>
                  <div className="text-2xl font-bold">{fmtMoney(financial.periodNet)}</div>
                </div>
              </div>
            </div>

            {/* Per-Pet Breakdown */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-sm font-semibold">🐕 PER-PET BREAKDOWN</div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(financial.perPet).map(([petName, stats]) => {
                  const c = pets.find(p => p.name === petName)
                  const color = c?.color || (c?.species === 'cat' ? '#F97316' : c?.species === 'dog' ? '#3B82F6' : '#6B7280')
                  return (
                    <div key={petName} className="flex items-center justify-between text-sm">
                      <div className="truncate flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        {petName}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{fmtMoney((stats as any).sum)}</div>
                        <div className="text-xs text-slate-500">{(stats as any).count} visits</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Financial Summary (new component) */}
        {authView === 'app' && (
          <section className="mx-auto mt-10 max-w-5xl">
            <FinancialSummary userId={userId} />
          </section>
        )}

        {/* Claims History Dashboard */}
        {authView === 'app' && claims.length > 0 && (
          <section className="mx-auto mt-10 max-w-5xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Claims History</h2>
              <div className="flex items-center gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  <span className="text-slate-500 mr-2">Sort</span>
                  <select value={claimsSort} onChange={(e) => setClaimsSort(e.target.value as any)} className="bg-transparent outline-none">
                    <option value="urgent">Urgency</option>
                    <option value="date_newest">Date (newest)</option>
                    <option value="date_oldest">Date (oldest)</option>
                    <option value="amount_high">Amount (high→low)</option>
                    <option value="amount_low">Amount (low→high)</option>
                    <option value="pet">Pet</option>
                    <option value="status">Status</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="text-xs text-slate-500">Total claims</div>
                <div className="text-lg font-semibold">{claimsSummary.total}</div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="text-xs text-slate-500">Not yet filed</div>
                <div className="text-lg font-semibold">{claimsSummary.notFiledCount} <span className="text-sm text-slate-500">({fmtMoney(claimsSummary.notFiledSum)})</span></div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="text-xs text-slate-500">Filed / pending</div>
                <div className="text-lg font-semibold">{claimsSummary.filedPending}</div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="text-xs text-slate-500">Expiring soon (&lt; 15 days)</div>
                <div className="text-lg font-semibold">{claimsSummary.expiringSoon}</div>
              </div>
            </div>

            {/* Claims list */}
            <div ref={claimsSectionRef} className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full overflow-x-hidden" style={{ overscrollBehaviorX: 'none' }}>
              {sortedClaims.map((c) => {
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
                  if (v === 'insured') return { text: 'Insured', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
                  if (v === 'not_insured') return { text: 'Not Insured', cls: 'bg-slate-100 text-slate-700 border border-slate-300' }
                  return { text: 'Maybe Insured', cls: 'bg-amber-50 text-amber-700 border border-amber-200' }
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
                            {`${pet.name || 'Pet'} • ${((c.visit_title && String(c.visit_title)) || (c.diagnosis && String(c.diagnosis)) || '')}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400 truncate">
                        <span className="mr-1">🏥</span>{c.clinic_name || '—'}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${catBadge.cls}`}>{catBadge.text}</div>
                        <div className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${stBadge.cls}`}>{stBadge.text}</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-slate-500">Service Date</div>
                        <div className="font-medium">{c.service_date || '—'}</div>
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
                        return (
                          <div className="col-span-2 mt-1 text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <span>📤</span>
                            <span>
                              Submitted: {new Date(c.filed_date as any).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )
                      })()}
                      {!isNotInsured ? (
                        <>
                          <div>
                            <div className="text-slate-500">Deadline</div>
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
                            <div className="font-medium whitespace-nowrap overflow-hidden">💰 Self-paid claim</div>
                          </div>
                          <div className="text-right text-slate-400">No deadline tracking</div>
                        </>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-start sm:items-center justify-between gap-2">
                      {isNotInsured ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">⭕ Not insured - No filing required</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          onClick={async () => {
                              try {
                                const today = new Date().toISOString().slice(0,10)
                                const input = prompt('Enter filed date (YYYY-MM-DD):', today) || today
                                const filedDate = input
                              await updateClaim(c.id, { filing_status: 'filed', filed_date: filedDate })
                              // Immediately reflect in local state for snappy UI
                              setClaims(prev => prev.map(cl => cl.id === c.id ? { ...cl, filing_status: 'filed', filed_date: filedDate } : cl))
                              // Brief success feedback and delay to avoid jarring reorder
                              try { alert('✓ Claim marked as submitted') } catch {}
                              await new Promise((r) => setTimeout(r, 700))
                              if (userId) {
                                const updated = await listClaims(userId)
                                setClaims(updated)
                              }
                              } catch (e) { console.error('[mark filed] error', e) }
                            }}
                          >
                          Mark as Submitted
                          </button>
                        <select
                            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          value={(() => {
                            const st = String(c.filing_status || 'not_submitted').toLowerCase()
                            if (st === 'filed') return 'submitted'
                            if (st === 'not_filed') return 'not_submitted'
                            return st
                          })()}
                          onChange={async (e) => {
                              try {
                                const next = e.target.value
                              if (next === 'paid') {
                                  setPaidModalClaim(c)
                                  const preset = (c.total_amount && Number.isFinite(Number(c.total_amount))) ? String(Number(c.total_amount).toFixed(2)) : ''
                                  setPaidAmount(preset)
                                  setPaidDate(new Date().toISOString().split('T')[0])
                                } else {
                                await updateClaim(c.id, { filing_status: next === 'submitted' ? 'filed' : (next === 'not_submitted' ? 'not_filed' : next) })
                                  // Optional feedback and brief delay before refreshing to avoid instant jump
                                  try { alert('✓ Status updated') } catch {}
                                  await new Promise((r) => setTimeout(r, 600))
                                  if (userId) listClaims(userId).then(setClaims)
                                }
                              } catch (er) { console.error('[edit status] error', er) }
                            }}
                          >
                          <option value="not_submitted">Not Submitted</option>
                          <option value="submitted">Submitted</option>
                            <option value="approved">Approved</option>
                            <option value="paid">Paid</option>
                            <option value="denied">Denied</option>
                          </select>
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {c.pdf_path ? (
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
                        ) : (
                          <span className="text-xs text-slate-400">No PDF stored</span>
                        )}
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-800 shrink-0 whitespace-nowrap"
                          onClick={async () => {
                            if (!confirm('Delete this claim?')) return
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
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 whitespace-nowrap"
                          onClick={() => setEditingClaim(c)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {sortedClaims.length === 0 && (
              <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900">
                No claims yet. Process your first vet bill to get started!
              </div>
            )}
          </section>
        )}

        {authView === 'app' && (
          <footer className="mx-auto max-w-3xl text-center py-10 text-xs text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} Pet Claim Helper
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
            <div className="mt-2 text-sm text-rose-800">You haven't selected a pet for this claim yet.</div>
            <div className="mt-1 text-sm text-rose-800">Please go back and click 'Use This Pet' for the pet you want to file a claim for.</div>
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
              <h3 className="text-lg font-semibold">Edit Claim</h3>
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
                <input className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2" value={editServiceDate} onChange={(e) => setEditServiceDate(e.target.value)} />
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
                  alert('Claim updated')
                } catch (e) { console.error('[update claim] error', e); alert('Error updating claim') }
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
                      max={new Date().toISOString().split('T')[0]}
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
                        await updateClaim(paidModalClaim.id, { filing_status: 'paid', reimbursed_amount: amountNum, paid_date: paidIso } as any)
                    if (userId) {
                      const updated = await listClaims(userId)
                      setClaims(updated)
                    }
                    setPaidModalClaim(null)
                    setPaidAmount('')
                        setPaidDate(new Date().toISOString().split('T')[0])
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
      {medQuestionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMedQuestionOpen(false)}>
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold">Medications Prescribed?</div>
            <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">Were any medications prescribed during this vet visit?</div>
            <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button type="button" className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4" onClick={() => {
                setMedQuestionOpen(false)
                if (pendingSuccess) setSuccessModal(pendingSuccess)
              }}>No</button>
              <button type="button" className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4" onClick={async () => {
                try {
                  setMedQuestionOpen(false)
                  // Load active medications for this pet
                  if (userId && selectedPet) {
                    const today = new Date().toISOString().slice(0,10)
                    const { data, error } = await supabase
                      .from('medications')
                      .select('*')
                      .eq('user_id', userId)
                      .eq('pet_id', selectedPet.id)
                      .lte('start_date', today)
                      .or(`end_date.is.null,end_date.gte.${today}`)
                    if (error) throw error
                    setMedicationsForPet(Array.isArray(data) ? data : [])
                  } else {
                    setMedicationsForPet([])
                  }
                  setSelectedMedicationIds([])
                  setMedSelectOpen(true)
                } catch (e) { console.error('[med question -> load meds] error', e); setMedicationsForPet([]); setMedSelectOpen(true) }
              }}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* Medication selection modal */}
      {medSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMedSelectOpen(false)}>
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold">Select Medications Prescribed</div>
            <div className="mt-3 space-y-2 max-h-[50vh] overflow-y-auto">
              {medicationsForPet.length === 0 && (
                <div className="text-sm text-slate-600">No active medications found</div>
              )}
              {medicationsForPet.map((m: any) => (
                <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <input type="checkbox" checked={selectedMedicationIds.includes(m.id)} onChange={(e) => {
                    const checked = e.target.checked
                    setSelectedMedicationIds(prev => checked ? [...prev, m.id] : prev.filter(id => id !== m.id))
                  }} />
                  <div className="min-w-0">
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
                  if (pendingSuccess) setSuccessModal(pendingSuccess)
                } catch (e) { console.error('[med select -> link meds] error', e); setMedSelectOpen(false); if (pendingSuccess) setSuccessModal(pendingSuccess) }
              }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showAddMedication && (
        <AddMedicationForm
          open={showAddMedication}
          onClose={() => setShowAddMedication(false)}
          onSaved={async () => {
            try {
              if (userId && selectedPet) {
                const today = new Date().toISOString().slice(0,10)
                const { data } = await supabase
                  .from('medications')
                  .select('*')
                  .eq('user_id', userId)
                  .eq('pet_id', selectedPet.id)
                  .lte('start_date', today)
                  .or(`end_date.is.null,end_date.gte.${today}`)
                setMedicationsForPet(Array.isArray(data) ? data : [])
              }
            } catch {}
          }}
          userId={userId}
          pets={pets}
          defaultPetId={selectedPet?.id || null}
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
        }}
        userId={userId || ''}
      />
      {successModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSuccessModal(null)}>
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl shadow animate-pulse">✓</div>
              <div className="mt-3 text-lg font-semibold text-emerald-800 dark:text-emerald-200">Claim Saved Successfully!</div>
              <div className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-300/80">Your claim was saved. You can generate the PDF now.</div>
            </div>
            <div className="p-6 text-sm">
              <div className="space-y-1">
                <div><span className="text-slate-500 dark:text-slate-400">Pet:</span> <span className="text-slate-900 dark:text-slate-100 font-semibold">{successModal.petName} ({successModal.species})</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Amount:</span> <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{fmtMoney(successModal.amount || 0)}</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Service Date:</span> <span className="text-slate-900 dark:text-slate-100">{successModal.serviceDate || '—'}</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Insurance:</span> <span className="text-slate-900 dark:text-slate-100">{successModal.insurance || '—'}</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">Filing Deadline:</span> <span className="text-slate-900 dark:text-slate-100">{successModal.deadlineDate || '—'} ({successModal.deadlineDays} days)</span></div>
              </div>
                  <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                <button
                  type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm w-full h-12 sm:w-auto sm:h-auto"
                  onClick={() => {
                    // Reset for another claim
                    setSuccessModal(null)
                    setExtracted(null)
                    setMultiExtracted(null)
                    setSelectedFile(null)
                    setErrorMessage(null)
                    setVisitNotes('')
                    setVisitTitle('')
                    setExpenseCategory('insured')
                    setShowClaims(false)
                  }}
                >
                  File Another Claim
                </button>
                <button
                  type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm w-full h-12 sm:w-auto sm:h-auto"
                  onClick={async () => {
                    // Close modal and clear form; stay on upload page
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
                <button
                  type="button"
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm w-full h-12 sm:w-auto sm:h-auto"
                  onClick={async () => {
                    try {
                      const claimId = successModal?.claimId || null
                      if (!userId || !claimId || !extracted || !selectedPet) {
                        setSuccessModal(null)
                        setShowClaims(true)
                        claimsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                        return
                      }
                      // Refresh claims list now that PDF is attached
                      listClaims(userId).then(setClaims).catch(() => {})
                    } catch (err) {
                      console.error('[view my claim -> generate pdf] error', err)
                    } finally {
                      setSuccessModal(null)
                      setShowClaims(true)
                      claimsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                >
                  View My Claim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AuthForm({ mode, onSwitch }: { mode: 'login' | 'signup'; onSwitch: (m: 'login' | 'signup') => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // Auto-login may require email confirmation based on project settings
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-3">
      {mode === 'signup' ? (
        <div className="text-center text-sm text-slate-700 dark:text-slate-200 mb-2">
          <div className="font-medium">Welcome! Create your account</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">• Save pets • Auto-fill claims • Access anywhere</div>
        </div>
      ) : (
        <div className="text-center text-sm text-slate-700 dark:text-slate-200 mb-2">
          <div className="font-medium">Welcome back!</div>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" required />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" required />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className={[
          'w-full inline-flex items-center justify-center rounded-lg text-white px-4 py-2 text-sm font-medium disabled:opacity-60',
          mode === 'signup' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-700 hover:bg-emerald-800'
        ].join(' ')}
      >
        {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Sign Up'}
      </button>
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
              <label className="block text-sm font-medium mb-1">User ID</label>
              <input
                type="text"
                value={userId || ''}
                disabled
                className="w-full px-3 py-2 border rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
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
    onDefaultPeriodChange: (v: 'all' | '2025' | '2024' | 'last12') => void;
  }) {
    const [loading, setLoading] = useState(false)
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')
    const [address, setAddress] = useState('')
    const [emailReminders, setEmailReminders] = useState(false)
    const [weeklySummaries, setWeeklySummaries] = useState(false)
    const [deadlineAlerts, setDeadlineAlerts] = useState(false)
    const [defaultExpense, setDefaultExpense] = useState<'insured' | 'not_insured' | 'maybe_insured'>('insured')
    const [defaultPeriod, setDefaultPeriod] = useState<'all' | '2025' | '2024' | 'last12'>('all')
    const [insurer, setInsurer] = useState<'Trupanion' | 'Nationwide' | 'Healthy Paws' | 'Fetch' | 'Custom Insurance' | ''>('')
    const [customInsurer, setCustomInsurer] = useState('')
    const [deadlineDays, setDeadlineDays] = useState<number | ''>('')

    useEffect(() => {
      if (!userId) return
      ;(async () => {
        setLoading(true)
        try {
          const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
          if (error) throw error
          if (data) {
            setFullName(data.full_name || '')
            setPhone(data.phone || '')
            setAddress(data.address || '')
            setEmailReminders(!!data.email_reminders)
            setWeeklySummaries(!!data.weekly_summaries)
            setDeadlineAlerts(!!data.deadline_alerts)
            setDefaultExpense((data.default_expense_category as any) || 'insured')
            setDefaultPeriod((data.default_time_period as any) || 'all')
            if (data.insurance_company) {
              if (['Trupanion','Nationwide','Healthy Paws','Fetch'].includes(data.insurance_company)) {
                setInsurer(data.insurance_company)
                setDeadlineDays(Number(data.filing_deadline_days || 90))
              } else {
                setInsurer('Custom Insurance')
                setCustomInsurer(data.insurance_company)
                setDeadlineDays(Number(data.filing_deadline_days || 90))
              }
            }
          }
        } catch (e) { console.error('[settings load] error', e) } finally { setLoading(false) }
      })()
    }, [userId])

    const saveProfile = async () => {
      if (!userId) return
      setLoading(true)
      try {
        const { error } = await supabase.from('profiles').upsert({
          id: userId,
          email: userEmail || '',
          full_name: fullName,
          phone,
          address,
        })
        if (error) throw error
        alert('Profile saved')
      } catch (e) { console.error('[save profile] error', e); alert('Error saving profile') } finally { setLoading(false) }
    }

    const savePreferences = async () => {
      if (!userId) return
      setLoading(true)
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            email_reminders: emailReminders,
            weekly_summaries: weeklySummaries,
            deadline_alerts: deadlineAlerts,
            default_expense_category: defaultExpense,
            default_time_period: defaultPeriod,
            insurance_company: insurer === 'Custom Insurance' ? (customInsurer || null) : insurer || null,
            filing_deadline_days: insurer === 'Custom Insurance' ? (Number(deadlineDays) || null) : 90,
          })
          .eq('id', userId)
        if (error) throw error
        onDefaultExpenseChange(defaultExpense)
        onDefaultPeriodChange(defaultPeriod)
        alert('Preferences saved')
      } catch (e) { console.error('[save prefs] error', e); alert('Error saving preferences') } finally { setLoading(false) }
    }

    return (
      <section className="mx-auto max-w-3xl mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-600 dark:text-slate-300">Close</button>
        </div>

        {/* Profile Information */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-sm font-semibold">Profile Information</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs text-slate-500">Email</label>
              <input value={userEmail || ''} readOnly className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Phone Number</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Address</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-3">
            <button type="button" onClick={saveProfile} disabled={loading} className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm disabled:opacity-60">Save Profile</button>
          </div>
        </div>

        {/* Email Notifications */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-sm font-semibold">Email Notifications</div>
          <div className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={emailReminders} onChange={(e) => setEmailReminders(e.target.checked)} /> Email me deadline reminders</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={weeklySummaries} onChange={(e) => setWeeklySummaries(e.target.checked)} /> Email me weekly summaries</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={deadlineAlerts} onChange={(e) => setDeadlineAlerts(e.target.checked)} /> Email me when claims are due</label>
            <div className="text-xs text-slate-500">Email notification features coming soon</div>
          </div>
        </div>

        {/* Insurance Company Settings */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-sm font-semibold">Insurance Company Settings</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs text-slate-500">Select Insurance</label>
              <select
                value={insurer}
                onChange={(e) => {
                  const v = e.target.value as any
                  setInsurer(v)
                  if (v === 'Custom Insurance') {
                    setDeadlineDays('')
                  } else if (v) {
                    setDeadlineDays(90)
                  }
                }}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2"
              >
                <option value="">—</option>
                <option value="Trupanion">Trupanion (90 days)</option>
                <option value="Nationwide">Nationwide (90 days)</option>
                <option value="Healthy Paws">Healthy Paws (90 days)</option>
                <option value="Fetch">Fetch (90 days)</option>
                <option value="Custom Insurance">Custom Insurance</option>
              </select>
            </div>
            {insurer === 'Custom Insurance' && (
              <>
                <div>
                  <label className="block text-xs text-slate-500">Insurance Company Name</label>
                  <input value={customInsurer} onChange={(e) => setCustomInsurer(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Filing Deadline (days)</label>
                  <input type="number" min={1} value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2" />
                </div>
              </>
            )}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {insurer && insurer !== 'Custom Insurance' && <span>{insurer} - Filing Deadline: 90 days</span>}
            {insurer === 'Custom Insurance' && customInsurer && deadlineDays !== '' && (
              <span>{customInsurer} - Filing Deadline: {deadlineDays} days</span>
            )}
          </div>
          <div className="mt-3">
            <button type="button" onClick={savePreferences} disabled={loading} className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm disabled:opacity-60">Save Insurance Settings</button>
          </div>
        </div>

        {/* Account Preferences */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-sm font-semibold">Account Preferences</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs text-slate-500">Default expense category</label>
              <select value={defaultExpense} onChange={(e) => setDefaultExpense(e.target.value as any)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm">
                <option value="insured">Insured</option>
                <option value="not_insured">Not Insured</option>
                <option value="maybe_insured">Maybe Insured</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500">Default financial period</label>
              <select value={defaultPeriod} onChange={(e) => setDefaultPeriod(e.target.value as any)} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 text-sm">
                <option value="all">All Time</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="last12">Last 12 Months</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <button type="button" onClick={savePreferences} disabled={loading} className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm disabled:opacity-60">Save Preferences</button>
          </div>
        </div>
      </section>
    )
  }

