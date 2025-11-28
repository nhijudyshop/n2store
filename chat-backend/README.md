# N2Store Chat Backend

Simple realtime chat server built with Node.js, Express, PostgreSQL, and Server-Sent Events (SSE).

## 🚀 Features

- ✅ Real-time messaging via Server-Sent Events (SSE)
- ✅ Direct (1-on-1) and group conversations
- ✅ Online/offline user status
- ✅ Unread message counts
- ✅ Message history with pagination
- ✅ PostgreSQL for data persistence
- ✅ CORS enabled for frontend integration

## 📋 Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database

## 🛠️ Local Development

### 1. Install dependencies
```bash
cd chat-backend
npm install
```

### 2. Setup environment variables
```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:
```
DATABASE_URL=postgresql://localhost:5432/n2store_chat
```

### 3. Initialize database
```bash
# Connect to PostgreSQL and run:
psql -U postgres -d n2store_chat -f db/schema.sql
```

### 4. Start server
```bash
npm run dev
```

Server will run on `http://localhost:3000`

## 🌐 Deploy to Render

### Step 1: Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New** → **PostgreSQL**
3. Settings:
   - Name: `n2store-chat-db`
   - Database: `n2store_chat`
   - User: `n2store`
   - Region: Choose closest to your users
   - Plan: **Free** (or Starter $7/month)
4. Click **Create Database**
5. Wait for database to provision
6. Copy the **Internal Database URL** (starts with `postgresql://`)

### Step 2: Initialize Database Schema

1. Go to your database → **Shell** tab
2. Paste contents of `db/schema.sql`
3. Click **Run**

### Step 3: Create Web Service

1. Click **New** → **Web Service**
2. Connect your GitHub repository
3. Settings:
   - Name: `n2store-chat-api`
   - Region: Same as database
   - Branch: `claude/fix-chat-navigation-01QjqxyEcgRpKkCF7CLWQ8ji` (or main)
   - Root Directory: `chat-backend`
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free** (or Starter $7/month)

4. **Environment Variables**:
   - Add `DATABASE_URL`: Paste the Internal Database URL from Step 1
   - Add `NODE_ENV`: `production`

5. Click **Create Web Service**

### Step 4: Get Server URL

After deployment completes, copy your server URL:
```
https://n2store-chat-api.onrender.com
```

## 📡 API Endpoints

### Authentication
```
POST /api/chat/sync-user
Body: { userId, username, displayName }
```

### Users
```
GET  /api/chat/users?online=true&limit=50
GET  /api/chat/users/:userId
```

### Conversations
```
GET  /api/chat/conversations?limit=50
Headers: x-user-id
POST /api/chat/conversations
Body: { participants[], type, groupName }
```

### Messages
```
GET  /api/chat/messages/:conversationId?limit=50
Headers: x-user-id
POST /api/chat/messages
Body: { conversationId, text, type }
POST /api/chat/messages/read
Body: { conversationId }
```

### Realtime Stream (SSE)
```
GET  /api/chat/stream
Headers: x-user-id
```

## 🔒 Authentication

This server uses simple header-based auth (`x-user-id`). The frontend passes the authenticated user ID from N2Store's existing auth system.

**Important**: In production, add proper JWT or session validation.

## 📊 Database Schema

- **users**: User profiles and online status
- **conversations**: Chat rooms (direct or group)
- **conversation_participants**: Many-to-many relationship
- **messages**: Chat messages with timestamps

See `db/schema.sql` for full schema.

## 🐛 Troubleshooting

### Database connection failed
- Check `DATABASE_URL` is correct
- Ensure database is running
- Check firewall/network settings

### SSE not working
- Ensure browser supports Server-Sent Events
- Check CORS settings
- Verify `x-user-id` header is sent

### Messages not real-time
- Check SSE connection is active
- Verify user is connected to `/api/chat/stream`
- Check server logs for errors

## 📝 License

MIT
