# File Upload Bug Investigation

## Bug Description
After deleting a vet bill card OR editing a pet, the "Upload Vet Bill" button stops working:
- User clicks "Upload Vet Bill (PDF or Photo)"
- User selects a file in Finder
- **NOTHING HAPPENS** - filename doesn't appear
- User must do a hard refresh AND reselect the pet to fix it

---

## Root Cause Analysis

### 1. File Upload Handler Chain

**File Input (Line 1915-1921):**
```tsx
<input
  ref={inputRef}
  type="file"
  accept="image/*,application/pdf"
  onChange={handleChange}  // ← Handler attached
  className="sr-only"
/>
```

**Handler Functions:**
```tsx
// Line 658 - Button triggers file picker
const handlePick = () => inputRef.current?.click()

// Line 702-710 - File input onChange handler
const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
  console.log('[MOBILE DEBUG] ========== handleChange CALLED ==========')
  console.log('[MOBILE DEBUG] e.target.files:', e.target.files)
  processFile(e.target.files?.[0])
}

// Line 670-700 - Processes the selected file
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
  setSelectedFile({ file, objectUrl })  // ← Sets file in state
  setExtracted(null)
  setErrorMessage(null)
}
```

**This chain is intact and should work.**

---

### 2. What Happens When Pet is Edited (Line 573-656)

```tsx
const saveEdit = async () => {
  // ... update pet data locally ...

  if (userId) {
    try {
      await dbUpsertPet(userId, toSave)

      // 🔴 CRITICAL: Refresh pets from database
      const refreshedPets = await dbLoadPets(userId)

      // 🔴 THIS TRIGGERS RE-RENDER
      setPets(refreshedPets)

      // 🔴 Forces financial summary refresh
      setDataRefreshToken((t) => t + 1)
    }
  }

  setEditingPetId(null)
  setEditPet(null)
}
```

**Problem:** `setPets(refreshedPets)` causes a re-render of the entire app.

---

### 3. What Happens When Bill is Deleted (Line 2920-2927)

```tsx
onClick={async () => {
  if (!confirm('Delete this bill?')) return
  try {
    await dbDeleteClaim(c.id)

    // 🔴 THIS TRIGGERS RE-RENDER
    if (userId) listClaims(userId).then(setClaims)
  } catch (e) {
    console.error('[delete claim] error', e)
  }
}}
```

**Problem:** `setClaims(...)` causes a re-render.

---

### 4. The Real Issue: React Re-Render Breaking Input Ref

**Current State Dependencies:**
```tsx
// Line 76
const inputRef = useRef<HTMLInputElement | null>(null)

// Line 83-85
const [pets, setPets] = useState<PetProfile[]>([])
const [selectedPetId, setSelectedPetId] = useState<string | null>(null)
const selectedPet = useMemo(() => pets.find(p => p.id === selectedPetId) ?? null, [pets, selectedPetId])
```

**Upload Section Rendering (Line 1882-1921):**
```tsx
{authView === 'app' && (
  <section className="mx-auto max-w-3xl text-center mt-8 px-2">
    <h2 className="text-2xl font-semibold">Upload Vet Bill</h2>
    <div className="mt-4">
      <div className="...">
        <button onClick={handlePick}>Upload Vet Bill</button>
        <input ref={inputRef} onChange={handleChange} />
      </div>
    </div>
  </section>
)}
```

**No key attribute on the upload section, but:**

---

### 5. Possible Causes

#### **Theory 1: Input Element Getting Unmounted/Remounted**
When `setPets()` is called:
1. React re-renders the component
2. The entire upload section might be recreated
3. The `<input>` element is removed from DOM and recreated
4. The new input element doesn't have the onChange handler properly attached
5. OR the ref gets stale

**Evidence:**
- The inputRef is defined at the component level
- No key on the input element
- The upload section is conditionally rendered: `{authView === 'app' && (...)`
- But authView doesn't change during edit/delete

#### **Theory 2: Event Handler Getting Garbage Collected**
When the component re-renders:
1. New closure created for `handleChange`
2. Old handler might be garbage collected
3. Input element still references old handler (now dead)

**Evidence:**
- `handleChange` is defined as a const in the component
- It should be recreated on every render
- React should update the onChange prop

#### **Theory 3: Input Value Not Resetting**
The file input might keep its internal value:
1. User selects file
2. File is processed
3. Input.value is never reset
4. Next file selection is ignored because value didn't change

**Evidence:**
- No `input.value = ''` reset after processing
- File inputs won't trigger onChange if selecting same file
- But user reports selecting ANY file doesn't work

---

### 6. Most Likely Root Cause

**The input element is being recreated during re-render, but the onChange handler is not properly re-attached.**

**Why?**
Looking at line 1915-1921, the input has:
- `ref={inputRef}` ✅
- `onChange={handleChange}` ✅

But when React re-renders after `setPets()`:
1. The entire `<section>` element is recreated
2. The `<input>` element is unmounted and remounted
3. The ref is reassigned correctly
4. **BUT** the onChange handler might not fire because:
   - The input element is a new DOM node
   - The file chooser dialog might still reference the old (unmounted) input
   - OR the input's internal state is not properly initialized

---

### 7. Why Hard Refresh Fixes It

When user does a hard refresh:
1. Entire app state is reset
2. Component mounts from scratch
3. Input element is created fresh
4. All refs and handlers are properly attached
5. Everything works again

---

### 8. Why Reselecting Pet Fixes It

When user reselects a pet:
1. `setSelectedPetId(pet.id)` is called (line 1696)
2. This triggers a re-render
3. **But this time the upload section is NOT unmounted**
4. The input element stays in the DOM
5. Handlers reconnect properly

**Wait, this doesn't make sense...**

Actually, let me check if there's a key based on selectedPetId anywhere...

---

### 9. Checking for Keys Based on State

Let me search for any keys that might cause unmounting...

**No explicit key found on the upload section.**

---

### 10. Alternative Theory: Focus/Click Handler Issues

**The real issue might be in `handlePick()`:**

```tsx
const handlePick = () => inputRef.current?.click()
```

If `inputRef.current` becomes null after re-render:
1. User clicks "Upload Vet Bill" button
2. `handlePick()` is called
3. `inputRef.current` is null
4. Nothing happens

**But why would inputRef.current be null?**
- The ref should be reassigned during re-render
- Unless the input element is unmounted and not remounted

---

## Conclusion

**Most likely cause:** The file input element is being unmounted and remounted during the re-render triggered by `setPets()` or `setClaims()`, causing the onChange handler to become detached or the ref to become stale.

**Evidence needed:**
1. Add console.log to check if `inputRef.current` is null when button is clicked
2. Add console.log to `handleChange` to see if it's ever called
3. Check if the input element's ID changes after re-render

**Potential fixes:**
1. **Add a key to prevent unmounting**: Give the upload section a stable key
2. **Reset input value after processing**: Add `e.target.value = ''` in handleChange
3. **Use useCallback for handlers**: Memoize handleChange to prevent recreation
4. **Force ref reassignment**: Add a useEffect to reassign the ref after pets change
