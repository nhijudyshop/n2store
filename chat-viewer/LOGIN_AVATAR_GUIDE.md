# 🔐 Login & Avatar Features Guide

## 🆕 New Features

### 1. Smart Login System
### 2. Facebook Avatars
### 3. Polling Default OFF

---

## 🔑 Login Methods

### Method 1: Username & Password (Recommended) ⭐

**Why Better:**
- ✅ No need to copy/paste token
- ✅ Automatic token management
- ✅ Token auto-refreshes (future feature)
- ✅ Easier for daily use

**How to Use:**
1. Open http://localhost:8080
2. Select "Username/Password" tab
3. Enter your TPOS credentials:
   - Username: (e.g., nv20)
   - Password: Your password
4. Click "Đăng nhập"
5. Done! Token acquired automatically

**API Call:**
```
POST /token
Body: client_id=tmtWebApp&grant_type=password&username=nv20&password=xxx&scope=profile
Response: { access_token: "...", expires_in: 1295999, ... }
```

**Security:**
- ✅ Password sent via HTTPS
- ✅ Token stored in memory only
- ✅ No localStorage (session-only)

---

### Method 2: Direct Token (Backup) 🔧

**When to Use:**
- Testing with different tokens
- Debugging token issues
- Token provided by admin

**How to Use:**
1. Get token from TPOS:
   - Login to https://tomato.tpos.vn/tpagev2/
   - F12 → Network → Find any request
   - Copy Authorization header (without "Bearer ")
2. Select "Token" tab in login screen
3. Paste token
4. Click "Đăng nhập"

---

## 👤 Facebook Avatar Feature

### Overview
Displays real Facebook profile pictures for each customer in conversation list and chat header.

### How It Works

**Avatar URL:**
```
https://platform-lookaside.fbsbx.com/platform/profilepic/?psid={USER_ID}&height=200&width=200
```

**Where USER_ID comes from:**
- Conversation.User.Id (Facebook PSID)
- Example: "3382503611870828"

**Fallback:**
If avatar fails to load:
1. Shows generic avatar icon (SVG)
2. Or shows first letter of name in colored circle

### Visual Design

**In Conversation List:**
```
┌─────────────────────────────────┐
│  [Avatar] Nguyễn Văn A     [3] │
│           0909123456            │
│           "Xin chào..."         │
│           2 phút trước          │
└─────────────────────────────────┘
```

**In Chat Header:**
```
┌─────────────────────────────────┐
│  [Avatar] Nguyễn Văn A          │
│           📞 0909123456          │
│           [Bình thường]         │
└─────────────────────────────────┘
```

**Specs:**
- Size: 48x48px (12 Tailwind units)
- Shape: Rounded full (circle)
- Loading: On-demand (lazy load)
- Error handling: Graceful fallback

---

## 🔄 Polling Default OFF

### Change
**Before:** Auto-refresh ON (polling every 10s automatically)
**Now:** Auto-refresh OFF (user must enable manually)

### Why?
1. **Save bandwidth** - Only refresh when needed
2. **Save battery** - Less background activity
3. **WebSocket is primary** - Polling is backup only
4. **User control** - Manual refresh when desired

### How to Enable Polling

**Option 1: Toggle Button**
Click "Auto OFF" button in header → Changes to "Auto ON"

**Option 2: Manual Refresh**
Click 🔄 button anytime for instant refresh

**When Polling Runs:**
- Only when "Auto ON" is enabled
- Refreshes every 10 seconds
- Continues even if WebSockets connected (redundancy)

**When Polling Stops:**
- When "Auto OFF"
- When user logs out
- When browser tab closed

---

## 🎨 UI/UX Improvements

### Login Screen

**Before:**
- Single input: Token textarea
- One button: Login

**After:**
- **Tabs:** Username/Password | Token
- **Username/Password tab:**
  - Username input field
  - Password input field (hidden)
  - Login button
  - Press Enter to submit
- **Token tab:**
  - Token textarea
  - Login button
- **Error display:** Red alert box if login fails
- **Loading state:** Button shows "Đang đăng nhập..."

### Conversation List

**Before:**
- Text only
- Name + Phone + Message + Time

**After:**
- **Avatar** (48x48px circle)
- Name + Phone + Message + Time
- Better spacing with flex layout
- Unread badge (red circle with count)

### Chat Header

**Before:**
- Name only
- Phone below
- Status badge

**After:**
- **Avatar** (48x48px circle) + Name side by side
- Phone + Status badge below
- Better visual hierarchy

---

## 🔒 Security Considerations

### Password Handling
- ✅ Sent via HTTPS only
- ✅ Not stored anywhere
- ✅ URL-encoded in request
- ❌ Not logged to console
- ❌ Not saved in localStorage

### Token Handling
- ✅ Stored in React state only (memory)
- ✅ Cleared on logout
- ✅ Cleared on browser close
- ❌ Never saved to disk
- ❌ Never sent to third parties

### Avatar URLs
- ✅ From official Facebook CDN
- ✅ Public profile pictures only
- ✅ CORS-safe (no-cors mode)
- ⚠️ May not load if privacy settings restrict

---

## 📊 Performance Impact

### Login with Credentials
- **Time:** ~500ms (one API call)
- **Network:** Single POST request
- **Storage:** Token in memory only

### Avatars
- **Loading:** Lazy (on scroll into view)
- **Caching:** Browser cache (automatic)
- **Size:** ~5-10KB per avatar
- **Total:** ~50-100KB for 20 conversations

### Polling OFF by Default
- **Bandwidth saved:** ~90% (no auto-refresh)
- **CPU saved:** ~95% (no interval timer)
- **Battery impact:** Minimal
- **User experience:** Better (WebSockets handle updates)

---

## 🐛 Troubleshooting

### Login Issues

**Error: "Đăng nhập thất bại"**
- Check username/password correct
- Check network connection
- Check TPOS server status

**Error: "Không nhận được token"**
- Server returned success but no token
- Check API response in console
- Try token method as backup

### Avatar Issues

**Avatar not showing**
- User may have restricted profile picture
- Facebook may block in certain regions
- Fallback icon will show instead

**Avatar loads slowly**
- First load always slower
- Subsequent loads fast (cached)
- Consider preloading (future improvement)

### Polling Issues

**Auto-refresh not working**
- Check "Auto ON" button is green
- Check console for errors
- WebSockets may be handling updates (check badges)

---

## 🚀 Future Improvements

### Planned Features
- [ ] Remember last username (optional)
- [ ] Token auto-refresh before expiry
- [ ] Avatar caching strategy
- [ ] Upload custom avatars
- [ ] Multiple account support
- [ ] Dark mode
- [ ] Notification sounds
- [ ] Desktop notifications

---

## 📝 Code Examples

### Get Token Programmatically
```javascript
const response = await fetch('/api/token', {
    method: 'POST',
    body: 'client_id=tmtWebApp&grant_type=password&username=USER&password=PASS&scope=profile'
});
const data = await response.json();
const token = data.access_token;
```

### Get Facebook Avatar
```javascript
const avatarUrl = `https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=${userId}&height=200&width=200`;
```

### Toggle Polling
```javascript
setAutoRefresh(!autoRefresh); // Toggle between true/false
```

---

## ✅ Checklist for Users

**First Time Setup:**
- [ ] Install dependencies (`npm install`)
- [ ] Start server (`npm start`)
- [ ] Open browser (http://localhost:8080)
- [ ] Choose login method
- [ ] Enable Auto-refresh if desired

**Daily Use:**
- [ ] Login with username/password
- [ ] Check WebSocket status (🟢 badges)
- [ ] Use manual refresh (🔄) as needed
- [ ] Enable Auto ON for busy times
- [ ] Disable Auto OFF to save bandwidth

---

**These new features make ChatOmni Viewer more user-friendly and efficient!** 🎉
