/**
 * Copy expenses from one user account to another
 *
 * Usage:
 *   node scripts/copy-expenses-between-accounts.js --preview
 *   node scripts/copy-expenses-between-accounts.js --execute
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SOURCE_EMAIL = 'uglydogadventures@gmail.com'
const DEST_EMAIL = 'larrysecrets@gmail.com'

async function main() {
  const mode = process.argv[2]

  if (!mode || (mode !== '--preview' && mode !== '--execute')) {
    console.log('Usage:')
    console.log('  node scripts/copy-expenses-between-accounts.js --preview')
    console.log('  node scripts/copy-expenses-between-accounts.js --execute')
    process.exit(1)
  }

  console.log('\n=== EXPENSE MIGRATION TOOL ===\n')

  // Step 1: Find user IDs
  console.log('Step 1: Finding user accounts...\n')

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers()

  if (usersError) {
    console.error('Error fetching users:', usersError)
    process.exit(1)
  }

  const sourceUser = users.users.find(u => u.email === SOURCE_EMAIL)
  const destUser = users.users.find(u => u.email === DEST_EMAIL)

  if (!sourceUser) {
    console.error(`Source user not found: ${SOURCE_EMAIL}`)
    process.exit(1)
  }

  if (!destUser) {
    console.error(`Destination user not found: ${DEST_EMAIL}`)
    process.exit(1)
  }

  console.log(`SOURCE: ${SOURCE_EMAIL}`)
  console.log(`  User ID: ${sourceUser.id}`)
  console.log(`  Created: ${sourceUser.created_at}`)

  console.log(`\nDESTINATION: ${DEST_EMAIL}`)
  console.log(`  User ID: ${destUser.id}`)
  console.log(`  Created: ${destUser.created_at}`)

  // Step 2: Query expenses from source account
  console.log('\n---\nStep 2: Querying source expenses...\n')

  const { data: expenses, error: expensesError } = await supabase
    .from('pet_expenses')
    .select('*')
    .eq('user_id', sourceUser.id)
    .order('expense_date', { ascending: true })

  if (expensesError) {
    console.error('Error fetching expenses:', expensesError)
    process.exit(1)
  }

  if (!expenses || expenses.length === 0) {
    console.log('No expenses found in source account.')
    process.exit(0)
  }

  // Calculate stats
  const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const categories = {}
  expenses.forEach(e => {
    categories[e.category] = (categories[e.category] || 0) + 1
  })

  const dates = expenses.map(e => e.expense_date).sort()
  const dateRange = `${dates[0]} to ${dates[dates.length - 1]}`

  console.log(`Found ${expenses.length} expenses:`)
  console.log(`  Date range: ${dateRange}`)
  console.log(`  Total amount: $${totalAmount.toFixed(2)}`)
  console.log(`  Categories:`)
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`    - ${cat}: ${count}`)
  })

  // Show sample expenses
  console.log('\nSample expenses (first 5):')
  expenses.slice(0, 5).forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.expense_date} | $${Number(e.amount).toFixed(2)} | ${e.category} | ${e.vendor || 'No vendor'} | ${e.description || 'No description'}`)
  })

  if (expenses.length > 5) {
    console.log(`  ... and ${expenses.length - 5} more`)
  }

  // Check for existing expenses in destination
  console.log('\n---\nStep 3: Checking destination account...\n')

  const { data: existingExpenses, error: existingError } = await supabase
    .from('pet_expenses')
    .select('id')
    .eq('user_id', destUser.id)

  if (existingError) {
    console.error('Error checking destination:', existingError)
    process.exit(1)
  }

  console.log(`Destination account has ${existingExpenses?.length || 0} existing expenses`)

  if (mode === '--preview') {
    console.log('\n===================================')
    console.log('PREVIEW MODE - No changes made')
    console.log('Run with --execute to copy expenses')
    console.log('===================================\n')
    process.exit(0)
  }

  // Step 4: Execute the copy
  console.log('\n---\nStep 4: Copying expenses...\n')

  const toInsert = expenses.map(e => ({
    user_id: destUser.id,
    amount: e.amount,
    category: e.category,
    expense_date: e.expense_date,
    vendor: e.vendor,
    description: e.description,
    receipt_url: e.receipt_url,
    // Note: claim_id is NOT copied - claims are different between accounts
    ocr_extracted: e.ocr_extracted,
    ocr_confidence: e.ocr_confidence,
    created_at: e.created_at,
    updated_at: e.updated_at
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('pet_expenses')
    .insert(toInsert)
    .select()

  if (insertError) {
    console.error('Error inserting expenses:', insertError)
    process.exit(1)
  }

  console.log(`SUCCESS! Copied ${inserted.length} expenses to ${DEST_EMAIL}`)
  console.log('\n===================================')
  console.log('MIGRATION COMPLETE')
  console.log('===================================\n')
}

main().catch(console.error)
