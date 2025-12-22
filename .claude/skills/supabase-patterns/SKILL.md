# Supabase Database Patterns Skill

## Name
Supabase Database Patterns

## Description
Use this skill when working with Supabase queries, database schema changes, RLS policies, or debugging data issues in Pet Claim Helper.

---

## Database Tables

### profiles
User account information
```sql
- id (UUID, PK, references auth.users)
- email (TEXT)
- full_name (TEXT)
- phone (TEXT)
- address (TEXT)
- city (TEXT)
- state (TEXT)
- zip (TEXT)
- signature (TEXT, base64 image)
- created_at (TIMESTAMP)
```

### pets
Pet information
```sql
- id (UUID, PK)
- user_id (UUID, FK → profiles)
- name (TEXT)
- species (TEXT)
- breed (TEXT)
- gender (TEXT)
- date_of_birth (DATE)
- insurance_company (TEXT)
- policy_number (TEXT)
- insurance_email (TEXT)
- healthy_paws_pet_id (TEXT)
- created_at (TIMESTAMP)
```

### vet_bills
Vet bills/claims
```sql
- id (UUID, PK)
- user_id (UUID, FK → profiles)
- pet_id (UUID, FK → pets)
- clinic_name (TEXT)
- service_date (DATE)
- total_amount (DECIMAL)
- diagnosis (TEXT)
- status (TEXT: pending, submitted, paid, denied)
- filing_deadline (DATE)
- pdf_url (TEXT)
- invoice_url (TEXT)
- reimbursement_amount (DECIMAL)
- created_at (TIMESTAMP)
```

### medications
Pet medications with reminders
```sql
- id (UUID, PK)
- pet_id (UUID, FK → pets)
- user_id (UUID, FK → profiles)
- name (TEXT)
- dosage (TEXT)
- frequency (TEXT)
- start_date (DATE)
- end_date (DATE)
- reminder_time (TIME)
- reminder_enabled (BOOLEAN)
- created_at (TIMESTAMP)
```

---

## Common Query Patterns

### Get User's Pets with Insurance
```javascript
const { data: pets } = await supabase
  .from('pets')
  .select('*')
  .eq('user_id', userId)
  .not('insurance_company', 'is', null)
  .order('created_at', { ascending: false });
```

### Get Vet Bills with Pet Info
```javascript
const { data: bills } = await supabase
  .from('vet_bills')
  .select(`
    *,
    pet:pets(name, insurance_company, policy_number)
  `)
  .eq('user_id', userId)
  .order('service_date', { ascending: false });
```

### Get Profile with Full Data
```javascript
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single();
```

---

## Insert Patterns

### Create New Pet
```javascript
const { data, error } = await supabase
  .from('pets')
  .insert({
    user_id: userId,
    name: petName,
    species: 'dog',
    insurance_company: insurerName,
    policy_number: policyNum
  })
  .select()
  .single();
```

### Create Vet Bill
```javascript
const { data, error } = await supabase
  .from('vet_bills')
  .insert({
    user_id: userId,
    pet_id: petId,
    clinic_name: clinicName,
    service_date: serviceDate,
    total_amount: amount,
    status: 'pending'
  })
  .select()
  .single();
```

---

## Update Patterns

### Update Single Field
```javascript
const { error } = await supabase
  .from('pets')
  .update({ breed: 'Golden Retriever' })
  .eq('id', petId);
```

### Update Multiple Fields
```javascript
const { error } = await supabase
  .from('vet_bills')
  .update({
    status: 'submitted',
    filing_deadline: deadline
  })
  .eq('id', billId);
```

### Upsert (Insert or Update)
```javascript
const { error } = await supabase
  .from('profiles')
  .upsert({
    id: userId,
    full_name: name,
    phone: phone
  });
```

---

## Delete Patterns

### Soft Delete (preferred)
Add `deleted_at` column and filter:
```javascript
// Mark as deleted
await supabase
  .from('pets')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', petId);

// Query excludes deleted
const { data } = await supabase
  .from('pets')
  .select('*')
  .is('deleted_at', null);
```

### Hard Delete
```javascript
const { error } = await supabase
  .from('vet_bills')
  .delete()
  .eq('id', billId);
```

---

## RLS (Row Level Security)

All tables use RLS. Users can only access their own data.

### Policy Pattern
```sql
-- Select policy
CREATE POLICY "Users can view own data"
ON pets FOR SELECT
USING (user_id = auth.uid());

-- Insert policy
CREATE POLICY "Users can insert own data"
ON pets FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Update policy
CREATE POLICY "Users can update own data"
ON pets FOR UPDATE
USING (user_id = auth.uid());
```

---

## Error Handling

```javascript
const { data, error } = await supabase
  .from('pets')
  .select('*')
  .eq('user_id', userId);

if (error) {
  console.error('Supabase error:', error.message);
  // Handle specific errors
  if (error.code === 'PGRST116') {
    // No rows returned
  }
  return;
}

// Use data safely
```

---

## Debugging Queries

### Log Full Response
```javascript
const response = await supabase
  .from('pets')
  .select('*')
  .eq('user_id', userId);

console.log('Full response:', JSON.stringify(response, null, 2));
console.log('Data:', response.data);
console.log('Error:', response.error);
console.log('Count:', response.count);
```

### Check RLS Issues
If query returns empty but data exists:
1. Verify user_id matches auth.uid()
2. Check RLS policies in Supabase dashboard
3. Try query in Supabase SQL editor with service role

---

## Common Gotchas

### 1. Forgetting .single()
```javascript
// Returns array (even for one result)
const { data } = await supabase.from('profiles').select('*').eq('id', id);
// data = [{ ... }]

// Returns object
const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
// data = { ... }
```

### 2. Null vs Empty String
```javascript
// Check for null
.is('field', null)

// Check for empty string
.eq('field', '')

// Check for either
.or('field.is.null,field.eq.')
```

### 3. Date Formatting
```javascript
// Supabase expects ISO format
const date = new Date().toISOString().split('T')[0]; // '2025-12-22'
```

### 4. Decimal/Money Fields
```javascript
// Store as string or number
total_amount: parseFloat(amount).toFixed(2)

// Query returns string, convert for math
const total = bills.reduce((sum, b) =>
  sum + parseFloat(b.total_amount || 0), 0
);
```

---

## Schema Changes

### Adding Column
```sql
ALTER TABLE pets ADD COLUMN breed TEXT;
```

### Adding with Default
```sql
ALTER TABLE vet_bills
ADD COLUMN status TEXT DEFAULT 'pending';
```

### Modifying Column
```sql
ALTER TABLE pets
ALTER COLUMN breed SET NOT NULL;
```

**Note:** Larry handles SQL in Supabase dashboard. Code prepares the query, Larry executes.

---

## Backup Queries

### Export User Data
```sql
SELECT * FROM profiles WHERE id = '{user_id}';
SELECT * FROM pets WHERE user_id = '{user_id}';
SELECT * FROM vet_bills WHERE user_id = '{user_id}';
```

### Count Records
```sql
SELECT
  (SELECT COUNT(*) FROM profiles) as profiles,
  (SELECT COUNT(*) FROM pets) as pets,
  (SELECT COUNT(*) FROM vet_bills) as vet_bills;
```
