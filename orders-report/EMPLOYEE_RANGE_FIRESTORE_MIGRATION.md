# EMPLOYEE RANGE MIGRATION: RTDB → FIRESTORE

## Migration Plan Overview

**Scope:** Chỉ migrate employee ranges, giữ nguyên orders data ở Realtime Database

**Timeline:** Phased rollout với backward compatibility

---

## Phase 1: Setup Firestore Schema

### Collection Structure

```
employeeRanges/ (collection)
├── {autoId} (document)
│   ├── employeeId: string
│   ├── employeeName: string
│   ├── start: number
│   ├── end: number
│   ├── campaignId: string | null
│   ├── campaignName: string | null
│   ├── isGeneral: boolean
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp
```

### Indexes Required

```
Collection: employeeRanges
- Composite index: campaignId ASC, start ASC
- Composite index: isGeneral ASC, start ASC
```

---

## Phase 2: Data Migration Strategy

### Current RTDB Structure

```
settings/
├── employee_ranges/ (array-like object)
│   ├── 0: { id, name, start, end }
│   └── 1: { id, name, start, end }
└── employee_ranges_by_campaign/
    └── {campaignName}/
        ├── 0: { id, name, start, end }
        └── 1: { id, name, start, end }
```

### Migration Script Logic

1. Read all from `settings/employee_ranges` → Save to Firestore with `isGeneral: true`
2. Read all from `settings/employee_ranges_by_campaign/{campaignName}` → Save to Firestore with `campaignId`, `campaignName`, `isGeneral: false`
3. Keep RTDB data intact (no deletion) for rollback safety

---

## Phase 3: Code Refactoring

### Files to Update

1. **tab1-orders.js**
   - `loadEmployeeRangesForCampaign()` - Use Firestore query
   - `applyEmployeeRanges()` - Use Firestore batch write
   - `syncEmployeeRanges()` - Use Firestore onSnapshot

2. **tab-overview.html**
   - `loadEmployeeRanges()` - Use Firestore query
   - Remove `normalizeEmployeeRanges()` (no longer needed!)

### API Changes

#### OLD (RTDB):
```javascript
// Load general
database.ref('settings/employee_ranges').once('value')

// Load campaign-specific
database.ref('settings/employee_ranges_by_campaign/${safeName}').once('value')

// Save
database.ref('settings/employee_ranges').set(ranges)
```

#### NEW (Firestore):
```javascript
// Load general
firestore.collection('employeeRanges')
  .where('isGeneral', '==', true)
  .orderBy('start')
  .get()

// Load campaign-specific
firestore.collection('employeeRanges')
  .where('campaignId', '==', campaignId)
  .orderBy('start')
  .get()

// Save (batch write)
const batch = firestore.batch()
ranges.forEach(range => {
  const ref = firestore.collection('employeeRanges').doc()
  batch.set(ref, range)
})
await batch.commit()
```

---

## Phase 4: Backward Compatibility

### Dual-Write Strategy (Optional)

For safe transition, we can write to both RTDB and Firestore temporarily:

```javascript
async function applyEmployeeRanges(ranges, campaignId) {
  // Write to Firestore (primary)
  await saveToFirestore(ranges, campaignId)

  // Write to RTDB (backup, can remove later)
  await saveToRTDB(ranges, campaignId)
}
```

---

## Phase 5: Testing Checklist

- [ ] Verify Firestore indexes created
- [ ] Test migration script with sample data
- [ ] Test load general employee ranges
- [ ] Test load campaign-specific ranges
- [ ] Test save new ranges
- [ ] Test update existing ranges
- [ ] Test delete ranges
- [ ] Test realtime sync (onSnapshot)
- [ ] Test with campaigns containing special characters
- [ ] Test fallback (campaign-specific → general)
- [ ] Verify statistics calculation works correctly
- [ ] Load test with multiple concurrent users

---

## Phase 6: Rollback Plan

If issues occur:

1. **Quick Rollback:** Revert code to use RTDB (RTDB data still intact)
2. **Data Sync:** If Firestore has newer data, sync back to RTDB
3. **Firestore Cleanup:** Can delete Firestore collection if needed

---

## Benefits After Migration

### For Developers
- ✅ No more `normalizeEmployeeRanges()` - data is always array
- ✅ No more campaign name sanitization issues
- ✅ Better query capabilities
- ✅ Auto-generated IDs (no index conflicts)

### For System
- ✅ Better performance with indexes
- ✅ Easier to add filters (by employee, by date range, etc.)
- ✅ Better offline support
- ✅ Compound queries for future features

### For Data Integrity
- ✅ Schema validation via Firestore rules
- ✅ Timestamps auto-managed
- ✅ Atomic batch operations

---

## Cost Consideration

**Current RTDB Cost:** Charged by bandwidth + storage
**Future Firestore Cost:** Charged by reads/writes/deletes

**Estimated Usage:**
- Employee ranges: ~10-50 documents per campaign
- Reads: ~100/day (when users open reports)
- Writes: ~10/day (when admins update ranges)
- Storage: Minimal (<1MB)

**Monthly Cost:** ~$0.01-0.10 (negligible)

---

## Next Steps

1. Run migration script to copy data
2. Update code to use Firestore
3. Test thoroughly
4. Deploy
5. Monitor for 1 week
6. Remove RTDB dual-write if stable
