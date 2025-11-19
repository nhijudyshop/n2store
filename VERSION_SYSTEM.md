# Version System Documentation

## Overview

Auto-increment version system that forces users to logout and re-login when a new version is deployed.

**✨ Centralized in navigation-modern.js** - Version checker is loaded on ALL pages automatically!

## How it works

1. **Version in Navigation**: `js/navigation-modern.js` contains current version and build number
2. **Auto-loaded Everywhere**: Since navigation-modern.js is loaded on all pages, version check runs everywhere
3. **Version Checker**: Compares local version with Firebase version on page load
4. **Auto-Logout**: If version mismatch detected → clear storage → redirect to login

## Usage

### Before committing changes:

```bash
# Increment version automatically
node scripts/increment-version.js

# Or use the helper script
./scripts/bump-version.sh

# Then commit normally
git add .
git commit -m "Your commit message"
git push
```

### Version structure in navigation-modern.js:

```javascript
window.APP_VERSION = {
    version: '1.0.0',      // Semantic version
    build: 123,            // Auto-incremented build number
    timestamp: '...',      // ISO timestamp of build
    branch: 'main'         // Git branch name
};
```

## Flow Diagram

```
User loads ANY page
    ↓
Load navigation-modern.js (includes APP_VERSION)
    ↓
VersionChecker initializes automatically
    ↓
Check Firebase app_version
    ↓
Version match? ─── YES ──→ Continue normally
    │
    NO
    ↓
Show notification "New version available"
    ↓
Clear localStorage
    ↓
Clear sessionStorage
    ↓
Redirect to: https://nhijudyshop.github.io/n2store/index.html
```

## Manual Version Publish

To force all users to logout immediately:

```javascript
// In browser console
window.versionChecker.forceVersionUpdate();
```

This will update the version in Firebase and all connected users will be logged out.

## Files

- `js/navigation-modern.js` - **Contains APP_VERSION and VersionChecker** (loaded on all pages!)
- `scripts/increment-version.js` - Auto-increment script (updates navigation-modern.js)
- `scripts/bump-version.sh` - Helper bash script

## Firebase Structure

```
/app_version
  ├─ version: "1.0.0"
  ├─ build: 123
  ├─ timestamp: "2025-11-18T..."
  └─ branch: "main"
```

## Advantages of Centralized Approach

✅ **No need to add version scripts to each HTML page**
✅ **Automatic version check on ALL pages** (live, livestream, orders-report, etc.)
✅ **Single source of truth** - version defined once in navigation-modern.js
✅ **Easier maintenance** - update one file instead of many
✅ **Always in sync** - no risk of forgetting to add version check to new pages

## Notes

- Version is checked on every page load (navigation-modern.js loads everywhere)
- Version listener detects changes in real-time
- 2 second initialization delay to ensure Firebase is ready
- 1.5 second delay before redirect to show notification
- Version file (navigation-modern.js) is automatically staged on increment
