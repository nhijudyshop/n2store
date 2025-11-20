# Bearer Token Persistence Issue - Fixed

## 🔍 Problem Description

Bearer token (`bearer_token_data`) was being re-fetched on **EVERY page refresh**, causing:
- Unnecessary API calls to `/api/token`
- Slow page load
- Potential rate limiting issues

## 🐛 Root Causes

### Issue #1: Auth System Clearing ALL localStorage

**Files affected:**
- `auth.js` (loaded in ALL tabs + main.html)
- `main.html` (logout handler)

**Problem:**
```javascript
// BEFORE - Cleared EVERYTHING including tokens!
clearAuth() {
    sessionStorage.clear();  // ❌ Cleared bearer_token_data
    localStorage.clear();    // ❌ Cleared bearer_token_data
}
```

**When it happened:**
1. **Every tab loads auth.js** (tab1-orders.html, tab2-statistics.html, tab3-product-assignment.html, tab-upload-tpos.html, main.html)
2. **On page load**, auth.js checks `authManager.isAuthenticated()`
3. **If session expired** or user not logged in → calls `clearAuth()`
4. **Result:** `bearer_token_data` deleted → token re-fetch required

### Issue #2: Token Manager saveToStorage() Bug

**File:** `token-manager.js`

**Problem:**
```javascript
// BEFORE - Assumed token always has expires_in
async saveToStorage(tokenData) {
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);
    // ❌ If tokenData from Firebase → expires_in = undefined → NaN!
}
```

**When it happened:**
1. Load token from Firebase (has `expires_at`, no `expires_in`)
2. Try to save to localStorage via `saveToStorage()`
3. Calculate `expiresAt = Date.now() + (undefined * 1000)` → `NaN`
4. Token marked as invalid
5. Fetch new token

### Issue #3: Race Condition

**Problem:**
- API calls made BEFORE `init()` completes
- Token not yet loaded from localStorage
- Unnecessary token fetch

## ✅ Solutions Applied

### Fix #1: Preserve Tokens in Auth System

**Files modified:**
- `auth.js` (5 functions)
- `main.html` (logout handler)
- `quick-fix-console.js` (warning added)

**Solution:**
```javascript
// AFTER - Only clear auth data, preserve tokens
clearAuth() {
    sessionStorage.removeItem('loginindex_auth');  // ✅ Specific key
    localStorage.removeItem('loginindex_auth');    // ✅ Specific key
    // bearer_token_data preserved!
}
```

**Applied to:**
- `AuthManager.clearAuth()`
- `AuthManager.logout()`
- `clearAuthState()`
- `clearLegacyAuth()`
- `handleLogout()`
- `main.html` logout button handler

### Fix #2: Handle Both Token Formats

**File:** `token-manager.js`

**Solution:**
```javascript
async saveToStorage(tokenData) {
    let expiresAt;

    // Handle existing tokens (from Firebase/localStorage)
    if (tokenData.expires_at) {
        expiresAt = tokenData.expires_at;  // ✅ Use as-is
    }
    // Handle new tokens (from API)
    else if (tokenData.expires_in) {
        expiresAt = Date.now() + (tokenData.expires_in * 1000);  // ✅ Calculate
    }

    // Save with correct expires_at
    localStorage.setItem(this.storageKey, JSON.stringify({
        access_token: tokenData.access_token,
        expires_at: expiresAt,
        // ... other fields
    }));
}
```

### Fix #3: Initialization Promise Pattern

**File:** `token-manager.js`

**Solution:**
```javascript
class TokenManager {
    constructor() {
        this.isInitialized = false;
        this.initPromise = null;
        // ...
    }

    async getToken() {
        // Wait for init to complete
        if (!this.isInitialized && this.initPromise) {
            await this.initPromise;
        }

        // Now safely check token
        if (this.isTokenValid()) {
            return this.token;  // ✅ From localStorage
        }

        return await this.fetchNewToken();
    }
}
```

### Fix #4: Optimize Init Flow

**File:** `token-manager.js`

**Solution:**
```javascript
async init() {
    // 1. Try localStorage FIRST (fastest)
    this.loadFromStorage();
    if (this.isTokenValid()) {
        return;  // ✅ Done - no Firebase fetch
    }

    // 2. Fallback to Firebase
    const firebaseToken = await this.getTokenFromFirebase();
    if (firebaseToken) {
        // Direct sync - no saveToStorage() complexity
        localStorage.setItem(this.storageKey, JSON.stringify(firebaseToken));
        return;
    }

    // 3. Lazy fetch - only when actually needed
}
```

## 📊 Files Modified Summary

| File | Changes | Lines |
|------|---------|-------|
| `auth.js` | 5 functions - use removeItem() instead of clear() | ~20 |
| `main.html` | Logout handler - preserve tokens | ~5 |
| `token-manager.js` | saveToStorage() + init() + promise pattern | ~50 |
| `quick-fix-console.js` | Warning added to clearAllData() | ~2 |

## 🎯 Results

### Before Fix:
```
Page Load → auth.js runs → clearAuth() → localStorage.clear()
→ bearer_token_data DELETED → fetch new token
→ Every refresh = New token fetch ❌
```

### After Fix:
```
Page Load → auth.js runs → clearAuth() → localStorage.removeItem('loginindex_auth')
→ bearer_token_data PRESERVED → reuse existing token
→ Only fetch when expired or invalid ✅
```

## 📝 Token Lifecycle

1. **First Visit (No Token)**
   - `init()` finds no token in localStorage
   - Checks Firebase (no token)
   - Waits for first API call
   - Fetches token and saves to both localStorage + Firebase

2. **Subsequent Visits (Valid Token)**
   - `init()` loads from localStorage (instant!)
   - Validates token (check expires_at)
   - Reuses token ✅
   - No API fetch needed

3. **Token Expiry**
   - API call returns 401
   - `authenticatedFetch()` detects 401
   - Clears old token
   - Fetches new token
   - Saves to localStorage + Firebase

4. **Logout**
   - User clicks logout
   - Only `loginindex_auth` removed
   - `bearer_token_data` preserved
   - Next login reuses token if still valid

## ⚠️ Important Notes

### Auth Check Locations
All these files load `auth.js` and will check authentication:
- ✅ `main.html`
- ✅ `tab1-orders.html`
- ✅ `tab2-statistics.html`
- ✅ `tab3-product-assignment.html`
- ✅ `tab-upload-tpos.html`

**⚠️ WARNING:** If you add `localStorage.clear()` or `sessionStorage.clear()` in ANY of these files, tokens will be deleted!

### Safe Storage Operations

**❌ NEVER DO THIS:**
```javascript
localStorage.clear();          // Deletes EVERYTHING including tokens
sessionStorage.clear();        // Deletes auth data
```

**✅ ALWAYS DO THIS:**
```javascript
localStorage.removeItem('loginindex_auth');  // Only remove auth
sessionStorage.removeItem('loginindex_auth'); // Preserve tokens
```

### Debug Commands

The `quick-fix-console.js` provides debug commands:

**Safe (preserves tokens):**
- Check localStorage: `console.log(localStorage.getItem('bearer_token_data'))`
- Check token expiry: `window.tokenManager.getTokenInfo()`

**Dangerous (deletes tokens):**
- `clearAllData()` - Has warning prompt now

## 🔍 How to Verify Fix

### Check localStorage:
```javascript
// In browser console
localStorage.getItem('bearer_token_data')
// Should return: {"access_token":"...", "expires_at":1234567890}
```

### Check token manager:
```javascript
window.tokenManager.getTokenInfo()
// Should return: { hasToken: true, isValid: true, expiresAt: "...", ... }
```

### Monitor network:
1. Open DevTools → Network tab
2. Refresh page
3. Search for `/api/token`
4. **Should be 0 requests** if token is valid ✅

## 🚀 Performance Impact

**Before:**
- Every page load: 1 token fetch (~200-500ms)
- 10 page loads = 10 token fetches

**After:**
- First load: 1 token fetch
- Next 9 loads: 0 token fetches
- **90% reduction in token API calls** ✅

---

**Last Updated:** 2025-11-20
**Status:** ✅ FIXED
**Verified:** All tabs tested
