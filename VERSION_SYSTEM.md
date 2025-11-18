# Version System Documentation

## Overview

Auto-increment version system that forces users to logout and re-login when a new version is deployed.

## How it works

1. **Version File**: `orders-report/version.js` contains current version and build number
2. **Version Checker**: Compares local version with Firebase version on page load
3. **Auto-Logout**: If version mismatch detected → clear storage → redirect to login

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

### Version file structure:

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
User loads page
    ↓
Load version.js (local version)
    ↓
Load version-checker.js
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

- `orders-report/version.js` - Version information
- `orders-report/version-checker.js` - Version check logic
- `scripts/increment-version.js` - Auto-increment script
- `scripts/bump-version.sh` - Helper bash script

## Firebase Structure

```
/app_version
  ├─ version: "1.0.0"
  ├─ build: 123
  ├─ timestamp: "2025-11-18T..."
  └─ branch: "main"
```

## Notes

- Version is checked on every page load
- Version listener detects changes in real-time
- 1.5 second delay before redirect to show notification
- Version file is automatically staged on increment
