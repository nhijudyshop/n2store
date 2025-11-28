# 📘 N2Store Chat - Deployment Guide

Complete guide to deploy the new PostgreSQL-based chat system.

## ✅ What's Been Built

### **1. Backend Server** ✅
- **Location:** `render.com/`
- **Tech:** Node.js + Express + PostgreSQL + SSE
- **Status:** Code ready, needs database setup

### **2. Frontend Client** ✅
- **Location:** `js/chat-client.js`
- **Features:** Complete API client with SSE realtime
- **Status:** Ready to use

### **3. Cloudflare Worker** ✅
- **Location:** `cloudflare-worker/worker.js`
- **Purpose:** CORS proxy
- **Status:** Updated with correct Render URL

### **4. Frontend UI** ⏳
- **Location:** `chat/chat.js`
- **Status:** NEEDS REBUILD (currently in offline mode)

---

## 🚀 Deployment Steps

### **STEP 1: Setup PostgreSQL on Render**

#### 1.1 Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **PostgreSQL**
3. Settings:
   - **Name:** `n2store-chat-db`
   - **Database:** `n2store_chat`
   - **User:** `n2store_user`
   - **Region:** **Singapore** (same as web service)
   - **Plan:** **Free** (or Starter $7/month for better performance)

4. Click **Create Database**
5. Wait for provisioning (~2 minutes)

#### 1.2 Get Database URL

1. Go to your database → **Info** tab
2. Copy **Internal Database URL**
   ```
   postgresql://n2store_user:xxxxx@xxxx.postgres.render.com/n2store_chat
   ```

#### 1.3 Initialize Database Schema

1. Go to your database → **Shell** tab
2. Copy entire contents of `render.com/db/schema.sql`
3. Paste into shell
4. Click **Run** or press Enter
5. Verify tables created:
   ```sql
   \dt
   ```
   You should see: `users`, `conversations`, `conversation_participants`, `messages`

### **STEP 2: Connect Database to Web Service**

#### 2.1 Link to Existing Render Service

1. Go to your Render web service: `n2store-fallback` (or `n2store-api-fallback`)
2. Go to **Environment** tab
3. Add environment variable:
   - **Key:** `DATABASE_URL`
   - **Value:** Paste the Internal Database URL from Step 1.2
4. Click **Save Changes**

#### 2.2 Trigger Redeploy

1. Render will auto-redeploy when you push code to GitHub
2. Or manually: Go to web service → **Manual Deploy** → **Deploy latest commit**
3. Wait for deployment to complete (~3-5 minutes)

#### 2.3 Verify Deployment

1. Check logs for:
   ```
   ✅ [CHAT-DB] Connected at: 2025-11-28T...
   ```

2. Test health endpoint:
   ```bash
   curl https://n2store-fallback.onrender.com/health
   ```

3. Test chat API:
   ```bash
   curl -X POST https://n2store-fallback.onrender.com/api/chat/sync-user \
     -H "Content-Type: application/json" \
     -d '{"userId": "test_user_123", "username": "testuser"}'
   ```

   Expected response:
   ```json
   {
     "success": true,
     "user": {
       "userId": "test_user_123",
       "username": "testuser",
       ...
     }
   }
   ```

### **STEP 3: Deploy Cloudflare Worker**

#### 3.1 Login to Cloudflare

```bash
npx wrangler login
```

#### 3.2 Deploy Worker

```bash
cd cloudflare-worker
npx wrangler deploy worker.js
```

Or via Cloudflare Dashboard:
1. Go to **Workers & Pages**
2. Find your worker (e.g., `chatomni-proxy`)
3. Click **Quick Edit**
4. Paste contents of `cloudflare-worker/worker.js`
5. Click **Save and Deploy**

#### 3.3 Verify Worker

Test chat proxy:
```bash
curl https://chatomni-proxy.nhijudyshop.workers.dev/api/chat/users?limit=10 \
  -H "X-User-Id: test_user_123"
```

Should return `{"success": true, "users": [], "count": 0}` (empty at first)

### **STEP 4: Frontend Integration** ⏳

**NEXT:** Rebuild `chat/chat.js` UI to use new chat-client.js

Current status:
- ✅ `chat-client.js` - Ready
- ⏳ `chat.js` - Needs rebuild

---

## 📊 Architecture Overview

```
Frontend (chat/index.html)
    ↓
chat-client.js (API calls + SSE)
    ↓
Cloudflare Worker (CORS proxy)
    ↓
Render Server (render.com/server.js)
    ├── REST API endpoints
    ├── SSE realtime stream
    └── PostgreSQL Database
```

---

## 🧪 Testing Checklist

After deployment:

- [ ] **Database Connected:**
  - Check Render logs for `✅ [CHAT-DB] Connected`

- [ ] **API Working:**
  - Test `POST /api/chat/sync-user`
  - Test `GET /api/chat/users`

- [ ] **SSE Working:**
  - Open `https://n2store-fallback.onrender.com/api/chat/stream?userId=test123` in browser
  - Should see `event: connected` message

- [ ] **Worker Proxying:**
  - Test via worker URL
  - Verify CORS headers present

---

## 🔍 Troubleshooting

### Database connection failed

**Error:** `❌ [CHAT-DB] Connection failed`

**Fix:**
1. Verify `DATABASE_URL` is set in Render environment
2. Check database is in same region as web service
3. Try using **Internal Database URL** (not External)

### SSE not connecting

**Error:** Browser can't connect to `/api/chat/stream`

**Fix:**
1. Check userId is passed in query: `?userId=xxx`
2. Verify Render service is running (check logs)
3. Test directly without Cloudflare Worker first

### API returns 404

**Error:** Chat endpoints return 404

**Fix:**
1. Verify routes are mounted in `server.js`
2. Check latest code is deployed (check commit hash)
3. Manually trigger redeploy on Render

### Worker CORS errors

**Error:** `Access-Control-Allow-Origin` error

**Fix:**
1. Verify `X-User-Id` is in allowed headers (line 71)
2. Redeploy worker after changes
3. Clear browser cache

---

## 📝 Environment Variables Needed

On **Render Web Service:**

```env
# Required
DATABASE_URL=postgresql://... (auto-filled by Render)
NODE_ENV=production
PORT=3000

# Optional (for Firebase chat - old system)
FIREBASE_PROJECT_ID=n2shop-69e37
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

---

## 🎯 What's Next?

1. **Deploy backend** (Steps 1-3 above)
2. **Rebuild chat.js UI** (will be done in next commit)
3. **Test end-to-end**
4. **Monitor and debug**

---

## 📞 Support

If you encounter issues:
1. Check Render logs
2. Test each layer separately (database → server → worker → frontend)
3. Use browser DevTools → Network tab to debug
4. Check PostgreSQL Shell for data

---

**Last Updated:** 2025-11-28
**Branch:** `claude/fix-chat-navigation-01QjqxyEcgRpKkCF7CLWQ8ji`
