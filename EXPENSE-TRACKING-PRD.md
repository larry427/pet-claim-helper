# Pet Expense Tracking PRD
## "QuickBooks for Dogs"

**Version:** 1.0 MVP
**Date:** January 2026
**Status:** Approved

---

## Executive Summary

A comprehensive pet expense tracking feature that helps users track ALL pet-related spending (food, supplies, grooming, training) alongside their existing vet bill/insurance claim tracking. Users can snap a photo of any receipt, have AI extract the details, and see a unified view of their total pet costs.

**Tagline:** "QuickBooks for Dogs"

---

## Goals & Success Metrics

### Primary Goals
1. **Tax documentation** - Help users track deductible pet expenses (service animals, business pets)
2. **Personal budgeting** - Understand and control pet spending with clear insights
3. **Complete cost visibility** - See true out-of-pocket spending after insurance

### Success Metrics (MVP)
- Users add 5+ expenses in first month
- 60%+ of expenses added via receipt photo (vs manual)
- Dashboard widget engagement (clicks to full page)

---

## User Stories

1. **As a pet owner**, I want to photograph a Petco receipt so I can track my spending without manual data entry
2. **As a pet owner**, I want to see my year-to-date pet expenses so I can budget appropriately
3. **As a pet owner**, I want my vet bills to automatically appear in my expense tracking so I have one unified view
4. **As a pet owner**, I want to see my out-of-pocket vet costs (after insurance reimbursement) so I know my true medical spending

---

## Feature Specification

### 1. Expense Categories (Fixed)

| Category | Description | Icon |
|----------|-------------|------|
| Food & Treats | Kibble, wet food, treats, supplements | 🍖 |
| Supplies & Gear | Beds, toys, leashes, crates, bowls | 🛒 |
| Grooming | Haircuts, nail trims, baths, grooming supplies | ✂️ |
| Training & Boarding | Classes, daycare, boarding, pet sitters | 🏠 |
| Vet / Medical | Auto-populated from claims (net cost only) | 🏥 |
| Other | Catch-all with required notes field | 📦 |

### 2. Data Model

#### `pet_expenses` Table

```sql
CREATE TABLE pet_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Core fields
  amount DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'food_treats', 'supplies_gear', 'grooming',
    'training_boarding', 'vet_medical', 'other'
  )),
  expense_date DATE NOT NULL,

  -- Optional fields
  vendor TEXT,                    -- Extracted or entered vendor name
  description TEXT,               -- User notes (required for 'other' category)
  receipt_url TEXT,               -- Supabase Storage URL for receipt image

  -- Linked claim (for vet_medical category)
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,

  -- AI extraction metadata
  ocr_extracted BOOLEAN DEFAULT FALSE,
  ocr_confidence DECIMAL(3,2),    -- 0.00 to 1.00

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_pet_expenses_user_date ON pet_expenses(user_id, expense_date DESC);
CREATE INDEX idx_pet_expenses_user_category ON pet_expenses(user_id, category);
CREATE INDEX idx_pet_expenses_user_year ON pet_expenses(user_id, date_trunc('year', expense_date));
```

### 3. Receipt OCR Flow

**Service:** OpenAI Vision (GPT-4o)

**Flow:**
```
[Camera] → [Upload to Supabase Storage] → [Send to GPT-4o Vision] → [Extract Data] → [Review Screen] → [Save]
```

**Extraction Prompt:**
```
Analyze this receipt image and extract:
1. Total amount (number only, e.g., 45.99)
2. Vendor/store name
3. Date (YYYY-MM-DD format)

Return JSON: {"amount": number, "vendor": string, "date": string}
If any field cannot be determined, use null.
```

**Fallback Behavior:**
- Pre-fill extracted fields (even partial)
- Highlight low-confidence fields in yellow
- User corrects/confirms all fields before saving

**Cost Estimate:** ~$0.01-0.03 per receipt (GPT-4o vision pricing)

### 4. Vet Bill Integration

**Behavior:**
- When a claim is marked as "reimbursed," auto-create expense entry
- Amount = `claim_amount - reimbursement_amount` (net out-of-pocket)
- Category = `vet_medical`
- `claim_id` linked for reference
- User can edit/delete like any other expense

**Example:**
| Claim | Bill Amount | Reimbursed | Expense Created |
|-------|-------------|------------|-----------------|
| Bear's X-ray | $450 | $360 | $90 (vet_medical) |

### 5. UI Components

#### 5.1 Dashboard Widget

**Location:** Home dashboard (existing)
**Size:** Card (same height as other dashboard cards)

**Content:**
```
┌─────────────────────────────────┐
│ 🐾 Pet Expenses                 │
│                                 │
│ This Month:        $347.52      │
│ Year to Date:    $2,841.00      │
│                                 │
│ [View All →]                    │
└─────────────────────────────────┘
```

#### 5.2 Expenses Page

**URL:** `/expenses`

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Pet Expenses                    [+ Add]     │
│                                             │
│ Year to Date: $2,841.00                     │
│ ┌─────────────────────────────────────────┐ │
│ │ Food & Treats      $1,200.00   ████████ │ │
│ │ Vet / Medical        $890.00   █████    │ │
│ │ Supplies & Gear      $420.00   ███      │ │
│ │ Grooming             $180.00   █        │ │
│ │ Training & Boarding  $120.00   █        │ │
│ │ Other                 $31.00   ▏        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Recent Expenses                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Jan 18  Petco           Food    $67.42  │ │
│ │ Jan 15  Rover           Board  $120.00  │ │
│ │ Jan 12  PetSmart        Suppl   $34.99  │ │
│ │ Jan 10  [Vet] Bear X-ray Med    $90.00  │ │
│ │ ...                                     │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

    ┌───┐
    │ + │  ← Floating Action Button (FAB)
    └───┘
```

#### 5.3 Add Expense Modal

**Trigger:** FAB or "+ Add" button

**Options:**
```
┌─────────────────────────────────┐
│ Add Expense                  X  │
│                                 │
│ ┌─────────────┐ ┌─────────────┐ │
│ │   📷        │ │   ✏️        │ │
│ │ Scan        │ │ Manual      │ │
│ │ Receipt     │ │ Entry       │ │
│ └─────────────┘ └─────────────┘ │
└─────────────────────────────────┘
```

#### 5.4 Receipt Review Screen

**After OCR extraction:**
```
┌─────────────────────────────────┐
│ Review Expense               X  │
│                                 │
│ [Receipt Image Thumbnail]       │
│                                 │
│ Amount *        ┌─────────────┐ │
│                 │ $67.42      │ │ ← Pre-filled, editable
│                 └─────────────┘ │
│                                 │
│ Vendor          ┌─────────────┐ │
│                 │ Petco       │ │ ← Pre-filled, editable
│                 └─────────────┘ │
│                                 │
│ Date *          ┌─────────────┐ │
│                 │ 2026-01-18  │ │ ← Pre-filled, editable
│                 └─────────────┘ │
│                                 │
│ Category *      ┌─────────────┐ │
│                 │ Food & Tre ▼│ │ ← User selects
│                 └─────────────┘ │
│                                 │
│ Notes           ┌─────────────┐ │
│                 │             │ │
│                 └─────────────┘ │
│                                 │
│        [Cancel]  [Save Expense] │
└─────────────────────────────────┘
```

#### 5.5 Manual Entry Form

Same as Review Screen but all fields empty.

### 6. Technical Implementation

#### 6.1 New API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses` | List expenses (with filters) |
| POST | `/api/expenses` | Create expense |
| PUT | `/api/expenses/:id` | Update expense |
| DELETE | `/api/expenses/:id` | Delete expense |
| POST | `/api/expenses/ocr` | Process receipt image |
| GET | `/api/expenses/summary` | Get category totals |

#### 6.2 OCR Endpoint Details

**POST `/api/expenses/ocr`**

Request:
```json
{
  "image_base64": "data:image/jpeg;base64,..."
}
```

Response:
```json
{
  "success": true,
  "extracted": {
    "amount": 67.42,
    "vendor": "Petco",
    "date": "2026-01-18"
  },
  "confidence": 0.92,
  "receipt_url": "https://supabase.../receipts/abc123.jpg"
}
```

#### 6.3 Storage

- **Bucket:** `receipts` (Supabase Storage)
- **Path:** `{user_id}/{year}/{filename}`
- **Retention:** Permanent (user can delete via expense deletion)

### 7. Performance Considerations

- **Dashboard widget:** Single query with aggregation, cached for 5 minutes
- **Expense list:** Paginated (20 per page), lazy load on scroll
- **Category totals:** Computed server-side, not client-side aggregation
- **Receipt images:** Thumbnails for list view, full-size on click

### 8. Mobile-First Design

- FAB positioned for easy thumb access (bottom-right)
- Camera opens directly (not file picker) on mobile
- Large touch targets for category selection
- Swipe-to-delete on expense rows (with confirmation)

---

## Rollout Plan

### Phase 1: Beta (Week 1-2)
- Deploy to beta testers only (feature flag)
- Monitor OCR accuracy and costs
- Gather feedback on UX flow

### Phase 2: General Availability (Week 3)
- Enable for all users
- Announce via in-app notification
- Monitor adoption metrics

### Phase 3: Iteration (Week 4+)
- Address feedback
- Consider: CSV export, charts, per-pet tracking

---

## Out of Scope (MVP)

- Per-pet expense tracking (household level only)
- Recurring expense automation
- CSV/PDF export
- Visual charts (pie, bar, trends)
- Bank/credit card import
- Custom categories (beyond "Other")
- Multi-currency support

---

## Open Questions

1. ~~Should we auto-categorize based on vendor (e.g., Petco → Food)?~~ **Decision: No, generic extraction only**
2. Should we notify users when their monthly spending exceeds a threshold?
3. ~~Should vet expenses show the original claim link for reference?~~ **Decision: Yes, link to original claim**

---

## Approval

**Please review this PRD and confirm:**

- [ ] Scope is correct for MVP
- [ ] Data model meets needs
- [ ] UI flow makes sense
- [ ] Ready to begin implementation

---

*Document prepared based on requirements interview conducted January 2026*
