import { jsPDF } from 'jspdf'
import type { ExtractedBill, PetProfile } from '../types'

function formatDateForFilename(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

function titleCaseSpecies(species: string | undefined): string {
  if (!species) return 'N/A'
  const s = species.toLowerCase()
  return s === 'dog' ? 'Dog' : s === 'cat' ? 'Cat' : species
}

// Currency helpers
function parseAmount(input: string | undefined): number {
  const n = parseFloat(String(input || '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
function formatCurrencyFromString(input: string | undefined): string {
  return `$${parseAmount(input).toFixed(2)}`
}
function formatCurrency(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

export function generateClaimPdf(extracted: ExtractedBill, pet: PetProfile | null): { filename: string; blob: Blob } {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  const marginX = 56
  const rightX = 556
  const usableWidth = rightX - marginX
  let y = 64

  const addHeader = (title: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(title, marginX, y)
    y += 18
    doc.setDrawColor(64)
    doc.setLineWidth(1)
    doc.line(marginX, y + 10, rightX, y + 10)
    y += 24
  }

  const addLabelValue = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(label, marginX, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(value || '—', marginX + 160, y)
    y += 18
  }

  const addSectionTitle = (label: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(label, marginX, y)
    y += 14
  }

  // Header
  addHeader('Pet Insurance Claim Form')

  // Insurance Section
  addSectionTitle('Insurance Information')
  addLabelValue('Company', pet?.insuranceCompany || 'N/A')
  addLabelValue('Policy Number', pet?.policyNumber || 'N/A')
  addLabelValue('Invoice Number', extracted.invoiceNumber || 'N/A')
  y += 8

  // Owner Section (placeholder for now)
  addSectionTitle('Pet Owner Information')
  addLabelValue('Owner Name', pet?.ownerName || 'N/A')
  addLabelValue('Address', pet?.ownerAddress || 'N/A')
  addLabelValue('Phone', pet?.ownerPhone || 'N/A')
  y += 8

  // Pet Section
  addSectionTitle('Pet Information')
  addLabelValue('Pet Name', extracted.petName || (pet?.name || 'N/A'))
  addLabelValue('Species', titleCaseSpecies(pet?.species))
  y += 8

  // Clinic Section
  addSectionTitle('Veterinary Clinic')
  addLabelValue('Clinic Name', extracted.clinicName || 'N/A')
  addLabelValue('Clinic Address', extracted.clinicAddress || 'N/A')
  y += 8

  // Service Section
  addSectionTitle('Service Details')
  addLabelValue('Date of Service', extracted.dateOfService || formatDateForFilename(new Date().toISOString()))
  addLabelValue('Diagnosis / Reason', extracted.diagnosis || 'N/A')
  y += 8

  // Charges Table
  addSectionTitle('Itemized Charges')
  const descColWidth = Math.floor(usableWidth * 0.7)
  const amtColWidth = usableWidth - descColWidth
  const descX = marginX
  const amtRightX = rightX
  const lineHeight = 14

  doc.setFont('helvetica', 'bold')
  doc.text('Description', descX, y)
  doc.text('Amount', amtRightX, y, { align: 'right' })
  y += 14
  doc.setDrawColor(200)
  doc.line(marginX, y, rightX, y)
  y += 10

  extracted.lineItems.forEach((item) => {
    const desc = item.description || '—'
    const amt = formatCurrencyFromString(item.amount)

    // Description wraps
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    const wrappedDesc = doc.splitTextToSize(desc, descColWidth)

    // Amount monospace, right-aligned
    doc.setFont('courier', 'normal')
    doc.text(amt, amtRightX, y, { align: 'right' })

    // Draw description lines
    doc.setFont('helvetica', 'normal')
    wrappedDesc.forEach((line, idx) => {
      doc.text(line, descX, y + idx * lineHeight)
    })

    y += Math.max(lineHeight, wrappedDesc.length * lineHeight)
    y += 2 // row gap
  })

  if (extracted.lineItems.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.text('No items', descX, y)
    y += 16
  }

  y += 6
  doc.setDrawColor(64)
  doc.line(marginX, y, rightX, y)
  y += 14

  // Total row
  doc.setFont('helvetica', 'bold')
  doc.text('Total', descX, y)
  doc.setFont('courier', 'bold')
  doc.text(formatCurrency(parseAmount(extracted.totalAmount)), amtRightX, y, { align: 'right' })
  y += 24

  // Footer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  // Filing deadline disclaimer block
  const disclaimerY = 742
  doc.setTextColor(40)
  doc.setFont('helvetica', 'bold')
  doc.text('Filing Deadline Reminder', marginX, disclaimerY)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80)
  doc.setFontSize(9)
  const reminder = 'Most pet insurance requires claims to be filed within 60–180 days of service. This is a general reminder only. Always verify your specific deadline with your insurance provider.'
  const wrapped = doc.splitTextToSize(reminder, rightX - marginX)
  doc.text(wrapped, marginX, disclaimerY + 14)
  doc.setTextColor(120)
  doc.text('Generated by Pet Claim Helper - petclaimhelper.com', marginX, 760)

  const datePart = formatDateForFilename(extracted.dateOfService || new Date().toISOString())
  const safePet = (extracted.petName || pet?.name || 'Pet').replace(/[^a-z0-9_\- ]/gi, '').replace(/\s+/g, '_')
  const safeCompany = (pet?.insuranceCompany || 'Insurance').replace(/[^a-z0-9_\- ]/gi, '').replace(/\s+/g, '_')
  const filename = `${safePet}_${safeCompany}_claim_${datePart}.pdf`

  const blob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' })
  return { filename, blob }
}

export function generateClaimPdfForPet(partial: {
  clinicName: string
  clinicAddress: string
  dateOfService: string
  diagnosis: string
  petName: string
  lineItems: { description: string; amount: string }[]
  subtotal: string
  invoiceNumber?: string
}, pet: PetProfile | null): { filename: string; blob: Blob } {
  const base: ExtractedBill = {
    clinicName: partial.clinicName,
    clinicAddress: partial.clinicAddress,
    petName: partial.petName,
    dateOfService: partial.dateOfService,
    totalAmount: partial.subtotal,
    diagnosis: partial.diagnosis,
    lineItems: partial.lineItems,
    invoiceNumber: partial.invoiceNumber,
  }
  return generateClaimPdf(base, pet)
}


