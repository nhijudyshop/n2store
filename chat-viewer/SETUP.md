# 📦 ChatOmni Viewer - Complete Setup Guide

## 🎯 Mục đích
Web app để xem tin nhắn chat từ hệ thống ChatOmni của TPOS một cách tiện lợi.

---

## ⚡ Quick Start (Recommended)

### Windows
```bash
# Double-click file này:
run.bat
```

### Mac/Linux
```bash
# Chạy trong Terminal:
chmod +x run.sh
./run.sh
```

Script sẽ tự động:
1. ✅ Kiểm tra Node.js
2. ✅ Cài đặt dependencies (nếu chưa có)
3. ✅ Khởi động server
4. ✅ Mở browser tự động

---

## 📋 Manual Installation

### Step 1: Install Node.js
Download và cài đặt từ: https://nodejs.org/

**Khuyến nghị:** Chọn bản LTS (Long Term Support)

Verify installation:
```bash
node --version   # Should show: v18.x.x or higher
npm --version    # Should show: 9.x.x or higher
```

### Step 2: Install Dependencies
```bash
npm install
```

Packages được cài:
- `express` - Web server framework
- `cors` - CORS middleware
- `axios` - HTTP client

### Step 3: Start Server
```bash
npm start
```

Expected output:
```
✨ ChatOmni Viewer - Server Started
🚀 Server running at: http://localhost:8080
```

### Step 4: Open Browser
Navigate to: **http://localhost:8080**

---

## 🔑 Getting Bearer Token

### Method 1: From Browser DevTools
1. Login to: https://tomato.tpos.vn/tpagev2/
2. Press `F12` to open DevTools
3. Go to **Network** tab
4. Reload page (`Ctrl+R` or `Cmd+R`)
5. Click any request to `tomato.tpos.vn`
6. Find **Authorization** header
7. Copy value after `Bearer ` (exclude "Bearer " prefix)

### Method 2: From Console
```javascript
// Paste in browser console:
console.log(localStorage.getItem('auth_token'));
```

---

## 🎨 Features

- ✅ **Conversations List** - See all chats with unread counts
- ✅ **Message Viewer** - Read text messages and images
- ✅ **Customer Info** - Name, phone, address, status
- ✅ **Auto Refresh** - New messages every 10 seconds
- ✅ **Manual Refresh** - Click button to refresh immediately
- ✅ **Responsive Design** - Works on desktop and mobile
- ✅ **CORS Bypass** - Built-in proxy server

---

## 📁 Project Structure

```
chatomni-viewer/
├── package.json          # npm configuration & dependencies
├── server.js            # Express server (CORS proxy)
├── chat-viewer.html     # Frontend UI (React in browser)
├── run.bat              # Windows launcher
├── run.sh               # Mac/Linux launcher
├── README.md            # User documentation
├── INSTALL.md           # Quick install guide
├── SETUP.md             # This file (complete guide)
└── .gitignore           # Git ignore rules
```

---

## 🔧 Configuration

### Change Port
```bash
# Mac/Linux
PORT=3000 npm start

# Windows
set PORT=3000
npm start
```

### Environment Variables
Create `.env` file (optional):
```env
PORT=8080
NODE_ENV=development
```

---

## 🐛 Troubleshooting

### Issue: "npm: command not found"
**Solution:** Install Node.js from https://nodejs.org/

### Issue: "Cannot find module 'express'"
**Solution:** Run `npm install` first

### Issue: "Port 8080 already in use"
**Solution:** Use different port:
```bash
PORT=3000 npm start
```

### Issue: "Failed to fetch conversations"
**Causes:**
1. Server not running → Run `npm start`
2. Invalid token → Get new token
3. Network error → Check internet connection

**Debug:**
- Check browser console (F12 > Console)
- Check server logs in terminal

### Issue: "npm install" fails
**Solution:**
```bash
# Clear cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

---

## 🔒 Security Notes

⚠️ **Important:**
- Token gives **full access** to your account
- **NEVER** share token with others
- Token **expires** after some time
- Run server **only on localhost**
- Don't deploy to public server

---

## 🚀 Advanced Usage

### Run in Background (Mac/Linux)
```bash
nohup npm start &
```

### Stop Background Server
```bash
pkill -f "node server.js"
```

### View Logs
```bash
npm start | tee server.log
```

---

## 📊 Performance

- **Memory Usage:** ~50-100MB
- **CPU Usage:** Minimal (< 5%)
- **Network:** Only API calls (no constant polling if auto-refresh off)
- **Storage:** ~5MB (node_modules)

---

## 🆘 Getting Help

1. Check **QUICK_START.txt** for fast reference
2. Read **README.md** for user guide
3. Check **INSTALL.md** for installation steps
4. Review server logs in terminal
5. Check browser console for errors

---

## 📝 Notes

- This is a **viewer-only** tool (no sending messages yet)
- Real-time via polling (10s intervals)
- Images load on-demand
- Supports multiple simultaneous users on same machine

---

## ✅ Checklist

Before asking for help:
- [ ] Node.js installed? (`node --version`)
- [ ] Dependencies installed? (`npm install`)
- [ ] Server running? (`npm start`)
- [ ] Browser at http://localhost:8080?
- [ ] Valid token entered?
- [ ] Check console for errors?

---

**Happy Chatting!** 🎉

For more info, contact your system administrator.
