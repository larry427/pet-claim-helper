# Food Tracking V1 - Setup Instructions

## Core Value
**"Know what you're spending. Know when to reorder. Never run out."**

## Overview
Simplified food tracking: one entry per pet, focused on cost visibility and reorder alerts.

## Step 1: Run SQL in Supabase Dashboard

The SQL schema is available in `FOOD_TRACKING_V1_SCHEMA.sql`.

**Key changes from previous version:**
- Dropped `food_items` and `feeding_plans` tables
- Created simpler `food_entries` table (one per pet)
- Hardcoded conversion factors (no longer stored in DB)

## Step 2: Access the Feature

1. Log in as `larry@uglydogadventures.com`
2. Click the "🍖 Food" button in the top navigation
3. Start tracking food costs!

## Features

### Add Food Form
1. **Select Pet** - Only pets without food entries shown
2. **Food Name** - e.g., "Purina Pro Plan 30lb"
3. **Food Type** - Dropdown:
   - Dry kibble (4 cups/lb)
   - Wet food (2 cups/lb)
   - Freeze-dried (9 cups/lb)
4. **Bag Size** - Number + unit (lbs or oz)
5. **Cost** - Purchase price ($)
6. **Cups Per Day** - How much pet eats
7. **Start Date** - When bag was opened (defaults to today)

**Preview shows:**
- Days per bag
- Cost per day, month, year

### Dashboard - Per Pet Card

Each pet's card displays:

**Status Section (color-coded):**
- 🟢 Green: >14 days left - "Good Stock"
- 🟡 Yellow: 7-14 days left - "Reorder Soon"
- 🔴 Red: <7 days left - "Reorder Now"
- Big prominent "X days left" display
- Reorder date with 5-day buffer

**Cost Breakdown:**
- Per Day
- Per Week
- Per Month (highlighted in emerald)
- Per Year

**Details:**
- Pet photo + name
- Food name
- Cups/day, days per bag, food type
- Edit/Delete buttons

### Household Summary

- **Alert Banner** - Shows count of pets needing reorder (yellow/red status)
- **Total Monthly Cost** - Gradient emerald card at bottom

## Calculations (Hardcoded)

```javascript
CUPS_PER_LB = {
  dry: 4,
  wet: 2,
  'freeze-dried': 9
}

total_cups = bag_size_lbs × CUPS_PER_LB[food_type]
days_per_bag = total_cups ÷ cups_per_day
cost_per_day = bag_cost ÷ days_per_bag
cost_per_week = cost_per_day × 7
cost_per_month = cost_per_day × 30
cost_per_year = cost_per_day × 365

days_left = days_per_bag - (today - start_date)
reorder_date = today + days_left - 5  // 5-day buffer
```

## Database Schema

### food_entries

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| pet_id | UUID | FK to pets, UNIQUE constraint |
| food_name | TEXT | e.g., "Purina Pro Plan 30lb" |
| food_type | TEXT | 'dry', 'wet', 'freeze-dried' |
| bag_size_lbs | DECIMAL(10,2) | Size in pounds |
| bag_cost | DECIMAL(10,2) | Purchase cost |
| cups_per_day | DECIMAL(5,2) | Daily consumption |
| start_date | DATE | When bag was opened |
| created_at | TIMESTAMP | Created timestamp |

**Key constraints:**
- One food entry per pet (UNIQUE on pet_id)
- RLS policies ensure users only see their pets' food

## UI Design

- Dark mode support
- Emerald green accents for costs
- Color-coded status lights (🟢🟡🔴)
- Responsive 2-column grid
- Edit/delete with icon buttons
- Live preview in add/edit modals
- Beautiful gradient cards

## Feature Flag

Only visible to `larry@uglydogadventures.com`.

To expand access, update feature flag checks in `src/App.tsx`:
- Line ~1564: Navigation button
- Line ~1605: View rendering

## Files

### Components
- `src/components/FoodTrackingDashboard.tsx` - Main dashboard
- `src/components/AddFoodEntryModal.tsx` - Add food entry form
- `src/components/EditFoodEntryModal.tsx` - Edit existing entry

### Documentation
- `FOOD_TRACKING_V1_SCHEMA.sql` - Database schema
- `FOOD_TRACKING_SETUP.md` - This file

## Migration from Previous Version

If you had the old food tracking system:

1. Run the SQL in `FOOD_TRACKING_V1_SCHEMA.sql` (drops old tables)
2. Data will be lost - this is a clean slate
3. Re-add food entries using the new simplified form

## Future Enhancements

1. Batch update (opened new bag)
2. Purchase history tracking
3. Price trends and analytics
4. Multi-pet households sharing food
5. SMS/email reorder reminders
6. Amazon Subscribe & Save integration
