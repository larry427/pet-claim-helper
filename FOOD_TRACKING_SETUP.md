# Food Tracking Feature - Setup Instructions

## Overview
Feature-flagged food tracking dashboard for `larry@uglydogadventures.com` only.

## Step 1: Run SQL in Supabase Dashboard

Copy and paste this entire SQL block into the Supabase SQL Editor:

```sql
-- Create food_items table
CREATE TABLE food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  cost DECIMAL(10, 2) NOT NULL,
  purchase_date DATE NOT NULL,
  source TEXT CHECK (source IN ('subscription', 'online', 'store')),
  total_servings INTEGER NOT NULL,
  serving_unit TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create feeding_plans table
CREATE TABLE feeding_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  servings_per_meal DECIMAL(5, 2) NOT NULL,
  meals_per_day INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies for food_items
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own food items"
ON food_items FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own food items"
ON food_items FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own food items"
ON food_items FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own food items"
ON food_items FOR DELETE
USING (user_id = auth.uid());

-- RLS policies for feeding_plans
ALTER TABLE feeding_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feeding plans"
ON feeding_plans FOR SELECT
USING (
  pet_id IN (
    SELECT id FROM pets WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own feeding plans"
ON feeding_plans FOR INSERT
WITH CHECK (
  pet_id IN (
    SELECT id FROM pets WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own feeding plans"
ON feeding_plans FOR UPDATE
USING (
  pet_id IN (
    SELECT id FROM pets WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own feeding plans"
ON feeding_plans FOR DELETE
USING (
  pet_id IN (
    SELECT id FROM pets WHERE user_id = auth.uid()
  )
);

-- Indexes for performance
CREATE INDEX idx_food_items_user_id ON food_items(user_id);
CREATE INDEX idx_feeding_plans_pet_id ON feeding_plans(pet_id);
CREATE INDEX idx_feeding_plans_food_item_id ON feeding_plans(food_item_id);
```

## Step 2: Access the Feature

1. Log in as `larry@uglydogadventures.com`
2. Click the "🍖 Food" button in the top navigation
3. Start tracking food costs!

## Features

### Dashboard
- Beautiful pet-by-pet breakdown cards
- Cost per meal, day, and month
- Days of food remaining
- Reorder alerts (5-day buffer)
- Household total at bottom

### Add Food Flow
1. Click "Add Food" button
2. Enter food details:
   - Name (required)
   - Brand (optional)
   - Cost (required)
   - Purchase date (required)
   - Source: subscription/online/store (required)
   - Total servings (required)
   - Serving unit: scoop/cup/can/portion (required)
3. Click "Next: Assign to Pet"
4. Select which pet eats this food
5. Enter feeding schedule:
   - Servings per meal
   - Meals per day
6. Click "Create Feeding Plan"

### Dashboard Cards Show
- Pet photo + name
- Food brand and name
- Cost per meal ($X.XX)
- Cost per day ($X.XX)
- Cost per month ($X.XX) - highlighted in green
- Days of food remaining
- Reorder date with 5-day buffer
- Red alert if ≤5 days remaining
- Feeding details (e.g., "2 scoops × 2 meals/day")

### Household Total
- Gradient emerald card at bottom
- Shows total monthly food budget across all pets

## UI Design

Following PCH's existing design patterns:
- Dark mode support
- Emerald green accent color
- Rounded corners and shadows
- Hover effects and transitions
- Responsive grid layout
- Beautiful gradient cards
- Icon usage (🍖, 🐕, 🐈, ⚠️, 📅)

## Feature Flag

Only visible to `larry@uglydogadventures.com`. To expand:
1. Update feature flag check in `src/App.tsx` line 1563 and 1605
2. Change from `userEmail === 'larry@uglydogadventures.com'` to your logic

## Files Created

- `src/components/FoodTrackingDashboard.tsx` - Main dashboard
- `src/components/AddFoodModal.tsx` - Add food item modal
- `src/components/AssignFoodModal.tsx` - Assign food to pet modal
- `src/App.tsx` - Integration and feature flag

## Database Schema

### food_items
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to profiles |
| name | TEXT | Food name (e.g., "Purina Pro Plan 30lb") |
| brand | TEXT | Brand (nullable) |
| cost | DECIMAL(10,2) | Purchase cost |
| purchase_date | DATE | When purchased |
| source | TEXT | subscription/online/store |
| total_servings | INTEGER | Total servings in bag/container |
| serving_unit | TEXT | scoop/cup/can/portion |
| created_at | TIMESTAMP | Created timestamp |

### feeding_plans
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| pet_id | UUID | FK to pets |
| food_item_id | UUID | FK to food_items |
| servings_per_meal | DECIMAL(5,2) | How many servings per meal |
| meals_per_day | INTEGER | How many meals per day |
| created_at | TIMESTAMP | Created timestamp |

## Future Enhancements

1. Edit/delete food items and feeding plans
2. Food consumption tracking (mark when you open a new bag)
3. Automatic reorder reminders via SMS
4. Price history and trends
5. Cost comparison across brands
6. Integration with Amazon Subscribe & Save
7. Nutrition tracking
8. Multi-pet food sharing
