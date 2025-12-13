# Version System Documentation

## Overview

**Timestamp-based** version system that forces users to logout and re-login when a new version is deployed.

**✨ Centralized in navigation-modern.js** - Version checker is loaded on ALL pages automatically!

**🚀 Fully Automated** - Git pre-commit hook automatically updates version on every commit!

## How it works

1. **Version in Navigation**: `js/navigation-modern.js` contains version timestamp
2. **Auto-loaded Everywhere**: Since navigation-modern.js is loaded on all pages, version check runs everywhere
3. **Version Checker**: Compares local timestamp with Firebase timestamp on page load
4. **Auto-Logout**: If Firebase timestamp > local timestamp → clear storage → redirect to login

## Usage

### ✨ NO MANUAL STEPS REQUIRED!

Just commit and push as normal:

```bash
git add .
git commit -m "Your commit message"  # ← Automatic version update!
git push
```

**That's it!** The pre-commit hook automatically:
- Increments build number
- Updates timestamp to current time
- Stages the updated navigation-modern.js

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

### Developer Side:
```
Developer makes code changes
    ↓
git add .
    ↓
git commit -m "message"
    ↓
Pre-commit hook runs automatically
    ↓
Version timestamp updated
    ↓
Build number incremented
    ↓
navigation-modern.js staged
    ↓
Commit created with new version
    ↓
git push
    ↓
User loads page → sees new version → auto logout
```

### User Side:
```
User loads ANY page
    ↓
Load navigation-modern.js (includes APP_VERSION)
    ↓
VersionChecker initializes automatically
    ↓
Check Firebase app_version timestamp
    ↓
Firebase timestamp > Local timestamp?
    ├─ NO  → Continue normally
    └─ YES → Force logout
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

## Advantages

### Centralized Version Management:
✅ **No need to add version scripts to each HTML page**
✅ **Automatic version check on ALL pages** (live, livestream, orders-report, etc.)
✅ **Single source of truth** - version defined once in navigation-modern.js
✅ **Easier maintenance** - update one file instead of many
✅ **Always in sync** - no risk of forgetting to add version check to new pages

### Fully Automated Workflow:
✅ **Zero manual steps** - just commit and push as normal
✅ **No commands to remember** - pre-commit hook does everything
✅ **Timestamp-based comparison** - newer version always wins
✅ **Can't forget to update version** - hook runs automatically
✅ **Build number tracking** - easy to see how many versions deployed

## Notes

- **Comparison logic**: Uses timestamp (Firebase timestamp > local timestamp → logout)
- **Build number**: Auto-incremented for tracking, but not used for comparison
- Version is checked on every page load (navigation-modern.js loads everywhere)
- Version listener detects changes in real-time
- 2 second initialization delay to ensure Firebase is ready
- 1.5 second delay before redirect to show notification
- Pre-commit hook automatically stages navigation-modern.js

## Troubleshooting

### Pre-commit hook not running?
```bash
# Check if hook is executable
ls -la .git/hooks/pre-commit

# If not executable, fix it:
chmod +x .git/hooks/pre-commit
```

### Want to skip version update for a specific commit?
```bash
# Use --no-verify flag
git commit --no-verify -m "docs: Update README (no version bump needed)"
```
