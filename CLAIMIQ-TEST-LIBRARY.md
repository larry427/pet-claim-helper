# Pet Claim IQ — Test Library

**Last updated:** February 9, 2026
**Purpose:** Regression testing reference. Every test case has verified expected results. Run these after any prompt or code changes to catch regressions.

---

## Test Case 1: Angel + Healthy Paws (Wellness Visit)

**Status:** ✅ PASSING
**Date verified:** Feb 9, 2026
**Bill format:** PDF

### Inputs
- **Pet:** Angel, Tortoiseshell, Feline, Spayed Female, DOB 09/04/2021
- **Vet bill:** Newport Animal Hospital, 8/23/2024, $264.06
- **Policy:** Healthy Paws (Westchester Fire Insurance Company)
- **Declarations:** Bo/Hope declarations page (Angel not listed — AI must work from policy alone)
- **Deductible:** $1,000 (Bo/Hope's — Angel has no specific dec page uploaded)
- **Reimbursement:** 80%
- **Math order:** Coinsurance-first (per Section V.9)

### Expected Line-by-Line Results

| # | Item | Amount | Status | Reason |
|---|------|--------|--------|--------|
| 1 | Exam | $78.00 | ❌ EXCLUDED | Section II.1.a: Veterinary examination fees |
| 2 | FVRCP Vaccine - 3 Year | $34.32 | ❌ EXCLUDED | Section II.3.b: Preventive healthcare including vaccinations |
| 3 | Rabies Vaccine - 3 Year | $34.32 | ❌ EXCLUDED | Section II.3.b: Preventive healthcare including vaccinations |
| 4 | Fluorescein Stain | $45.76 | ✅ COVERED | Section V.31.b: Laboratory and diagnostic tests |
| 5 | Neo/Poly/Dex Drops 5ml | $39.55 | ✅ COVERED | Section V.31.c: Medication |
| 6 | Nail Trim | $25.12 | ❌ EXCLUDED | Section II.3.b: Preventive healthcare including nail trim |
| 7 | Medical Waste Disposal | $6.99 | ❌ EXCLUDED | Not specified in policy as covered |

### Expected Summary
- **Total bill:** $264.06
- **Excluded:** $178.75 (note: $178.73 acceptable due to rounding)
- **Covered:** $85.31
- **× 80%:** $68.25
- **Should File:** Yes (applies toward deductible)

### Key Validations
- Fluorescein Stain correctly classified as diagnostic test, not preventive
- Medical Waste Disposal excluded (not in Section V.31 covered treatments list)
- Nail Trim excluded under preventive care, not just "not covered"

---

## Test Case 2: Angel + Pumpkin (Cross-Carrier)

**Status:** ✅ PASSING
**Date verified:** Feb 8, 2026
**Bill format:** PDF

### Inputs
- **Pet:** Angel (same bill as Test Case 1)
- **Policy:** Pumpkin (Policy period 11/30/2025 - 11/30/2026)
- **Deductible:** $500
- **Reimbursement:** 90%

### Expected Line-by-Line Results

| # | Item | Amount | Status | Reason |
|---|------|--------|--------|--------|
| 1 | Exam | $78.00 | ❌ EXCLUDED | Exam/consultation fees excluded |
| 2 | FVRCP Vaccine - 3 Year | $34.32 | ❌ EXCLUDED | Preventive/wellness care excluded |
| 3 | Rabies Vaccine - 3 Year | $34.32 | ❌ EXCLUDED | Preventive/wellness care excluded |
| 4 | Fluorescein Stain | $45.76 | ✅ COVERED | Diagnostic test |
| 5 | Neo/Poly/Dex Drops 5ml | $39.55 | ✅ COVERED | Medication |
| 6 | Nail Trim | $25.12 | ❌ EXCLUDED | Grooming/preventive care |
| 7 | Medical Waste Disposal | $6.99 | ❌ EXCLUDED | Administrative/not covered |

### Expected Summary
- **Total bill:** $264.06
- **Excluded:** $178.75
- **Covered:** $85.31
- **× 90%:** $76.78 (Pumpkin is 90%, not 80%)
- **Math order:** Deductible-first (standard for Pumpkin)

### Key Validations
- Same bill, different carrier = different reimbursement rate
- AI reads Pumpkin policy language (different exclusion section references)
- Cross-carrier accuracy: same coverage decisions, different math

---

## Test Case 3: Bo/Hope Pre-Op Blood Panels + Healthy Paws

**Status:** ✅ PASSING
**Date verified:** Feb 9, 2026
**Bill format:** PDF

### Inputs
- **Pets:** Bo and Hope (7-month-old puppies)
- **Vet bill:** East Chapman Veterinary Center, 9/23/2025, $231.52
- **Items:** Two pre-op blood panels ($115.76 each) for spay/neuter surgeries scheduled next day
- **Policy:** Healthy Paws
- **Deductible:** $1,000

### Expected Line-by-Line Results

| # | Item | Amount | Status | Reason |
|---|------|--------|--------|--------|
| 1 | Pre-op Blood Panel (Bo) | $115.76 | ❌ EXCLUDED | Section II.3.b: Preventive care / pre-op for excluded surgery |
| 2 | Pre-op Blood Panel (Hope) | $115.76 | ❌ EXCLUDED | Section II.3.b: Preventive care / pre-op for excluded surgery |

### Expected Summary
- **Total bill:** $231.52
- **Excluded:** $231.52
- **Covered:** $0.00
- **Should File:** No / "Consider your options" — all items excluded

### Key Validations
- Pre-op bloodwork inherits coverage status of underlying surgery (spay/neuter = excluded)
- Contextual coverage rules: young pet age + "pre-op" + no illness = spay/neuter context
- shouldFile = false when totalCovered is $0

### Known Limitation
- AI may group both pets as one visit instead of splitting by pet
- Each pet has a separate $1,000 deductible — multi-pet splitting not yet implemented

---

## Test Case 4: Neo Illness Visit + Healthy Paws (EOB-Verified)

**Status:** ✅ PASSING
**Date verified:** Feb 9, 2026
**Bill format:** Photo (JPEG)
**Ground truth:** Actual Healthy Paws EOB available for verification

### Inputs
- **Pet:** Neo, Cane Corso, Female, DOB 02/28/2025
- **Vet bill:** East Chapman Veterinary Center, 1/27/2026, $706.66 (photo of printed invoice)
- **Reason for visit:** Vomiting/diarrhea (illness)
- **Policy:** Healthy Paws
- **Declarations:** Pet Health Policy Changes document (Policy Change #3, Pet Policy ID 1400806-4)
- **Deductible:** $500 (from policy change doc, NOT $1,000 from Bo/Hope dec page)
- **Reimbursement:** 80%
- **Math order:** Coinsurance-first

### Expected Line-by-Line Results

| # | Item | Actual Amount | Status | Reason |
|---|------|---------------|--------|--------|
| 1 | Examination & Consultation | $58.00 | ❌ EXCLUDED | Section II.1.a: Veterinary examination fees |
| 2 | Radiographic Xray - Up to 10 Views | $312.52 | ✅ COVERED | Section V.31.a: X-rays |
| 3 | Radiologist - Xray Consultation STAT | $186.00 | ✅ COVERED | Section V.31.b: Laboratory and diagnostic tests |
| 4 | Cerenia (Maropitant) 10 mg/ml Injection | $50.02 | ✅ COVERED | Section V.31.c: Medication |
| 5 | Cerenia (Maropitant) 24mg Tablets | $32.34 | ✅ COVERED | Section V.31.c: Medication |
| 6 | Metronidazole 250mg Tablet | $15.50 | ✅ COVERED | Section V.31.c: Medication |
| 7 | Subcutaneous Fluid Treatment | $52.28 | ✅ COVERED | Section V.31.h: Nursing care |
| 8 | Fluid - Lactated Ringers, per cc | $0.00 | ✅ COVERED | Section V.31.e: Supplies |

### Expected Summary
- **Total bill:** $706.66
- **Excluded:** $58.00
- **Covered:** $648.66
- **× 80% (coinsurance-first):** $518.93
- **Minus $500 deductible:** $18.93
- **Should File:** "Yes — filing this claim meets your $500.00 annual deductible and you'll receive an estimated $18.93 reimbursement."

### EOB Ground Truth (Healthy Paws Actual Payment)
- Invoice: $706.66
- Not Covered: $58.00 (Exam only)
- Total Covered: $648.66
- × 80%: $518.93
- Deductible applied: -$500.00
- **Total Reimbursement: $18.93**
- Remaining deductible: $0.00

### Key Validations
- Radiologist consultation classified as DIAGNOSTIC, not exam fee (Rule 10)
- Deductible pulled from policy change doc ($500), not original dec page ($1,000)
- Math order: coinsurance-first per Section V.9 definition
- Calculator intermediate steps show correct flow: Covered → ×80% → -deductible
- Should You File text reflects correct deductible and reimbursement amounts
- Penny-perfect match to actual EOB

### Known Limitations (Line Item OCR from Photos)
- Cerenia Injection may read as ~$50.32 or $35.00 instead of $50.02
- Metronidazole may read as ~$30.00-$32.34 instead of $15.50
- These are OCR column-confusion issues from photo bills; totals remain correct
- PDF bills don't have this issue

---

## Test Case 5: Angel Regression Test (Post All Fixes)

**Status:** ✅ PASSING
**Date verified:** Feb 9, 2026

### Purpose
Verify that adding these rules didn't break existing accuracy:
- Contextual coverage rules (pre-op/post-op)
- Policy change document handling
- Radiologist classification rule
- Carrier-specific math order
- Line item OCR accuracy rule

### Result
All 7 line items correct. No regressions. Same results as Test Case 1.

---

## Prompt Rules Changelog

Track every rule added to the analysisPrompt so we know what to check if regressions occur.

| Date | Commit | Rule Added | Test Case |
|------|--------|-----------|-----------|
| Feb 9 | 9cf2fc88 | Contextual coverage rules 6-9 (pre-op/post-op inherit surgery status) | TC3 |
| Feb 9 | a684c38f | shouldFile logic for $0 covered scenarios | TC3 |
| Feb 9 | 4fe678cc | Policy change document handling (per-pet deductible extraction) | TC4 |
| Feb 9 | d3653d98 | Radiologist reads = diagnostic tests, not exam fees (Rule 10) | TC4 |
| Feb 9 | ca3562f4 | Carrier-specific math order (coinsurance-first vs deductible-first) | TC4 |
| Feb 9 | 5620eead | Line item amount extraction accuracy (use Total column, validate sum) | TC4 |

---

## Frontend Fixes Changelog

| Date | Commit | Fix | Impact |
|------|--------|-----|--------|
| Feb 9 | dc6b815 | Pre-existing conditions disclaimer on results page | UX |
| Feb 9 | baf884a | Sample analysis section on landing page | UX |
| Feb 9 | e275507 | Sample analysis collapsible by default | UX |
| Feb 9 | df701ed | Math order support in calculator | TC4 accuracy |
| Feb 9 | 7627246 | Default deductible to 0, trigger initial calc | TC4 UX |
| Feb 9 | ba79177 | Correct intermediate steps for coinsurance-first | TC4 UX |
| Feb 9 | a129517 | shouldFile text updates from calculator dynamically | TC4 UX |
| Feb 9 | (pet-claim-iq) | File upload X button fix | Bug fix |

---

## How to Run Regression Tests

1. Go to claimiq.petclaimhelper.com
2. For each test case, upload the specified documents
3. Compare results against the Expected tables above
4. Check: line item coverage decisions, amounts, totals, math, shouldFile text
5. If ANY test case fails, identify which prompt rule or code change caused it before making fixes

### Test Priority Order
1. **TC4 (Neo + Healthy Paws)** — Most complex, validates the most rules
2. **TC1 (Angel + Healthy Paws)** — Baseline regression check
3. **TC3 (Bo/Hope pre-op)** — Validates contextual rules
4. **TC2 (Angel + Pumpkin)** — Cross-carrier validation

---

## Future Test Cases Needed

- [ ] Trinity's vet bill (new pet, different visit type)
- [ ] Partially-met deductible scenario (e.g., $300 of $500 already used)
- [ ] Spot insurance policy
- [ ] ASPCA policy
- [ ] Multi-page vet bill
- [ ] Emergency/hospital visit with high-dollar items
- [ ] Dental injury claim (covered under Healthy Paws II.3.d exception)
- [ ] Deductible-first carrier to verify standard math path
- [ ] Bill with quantity > 1 items (e.g., 3 doses of medication)
