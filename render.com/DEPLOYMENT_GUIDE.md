# 🚀 Render.com Deployment Guide

Complete guide to deploy N2Store backend to Render.com with PostgreSQL database.

---

## 📋 Prerequisites

- GitHub account with n2store repository
- Render.com account (free tier available)
- Admin access to nhijudyshop organization

---

## 🗄️ Part 1: PostgreSQL Database Setup

### Step 1: Create PostgreSQL Database

1. **Login to Render.com**
   - Visit: https://dashboard.render.com
   - Sign in with GitHub

2. **Create New PostgreSQL**
   - Click **"New +"** → **"PostgreSQL"**
   - Or visit: https://dashboard.render.com/new/database

3. **Configure Database**
   ```
   Name: n2store-db
   Database: n2store
   User: n2store_user
   Region: Singapore (closest to Vietnam)
   PostgreSQL Version: 15 (or latest)
   Plan: Free (or Starter $7/month for better performance)
   ```

4. **Create Database**
   - Click **"Create Database"**
   - Wait ~2-3 minutes for provisioning

5. **Get Connection Details**
   - Go to database dashboard
   - Copy **Internal Database URL** (starts with `postgres://`)
   - Format: `postgres://user:password@host:port/database`

### Step 2: Run Database Migrations

#### Option A: Using Render Dashboard SQL Console

1. Open database in Render Dashboard
2. Go to **"Console"** tab
3. Copy entire content of `/render.com/migrations/create_customers_table.sql`
4. Paste into console
5. Click **"Execute"**
6. Verify: Should see "CREATE TABLE", "CREATE INDEX" messages

#### Option B: Using psql Command Line

```bash
# Export DATABASE_URL
export DATABASE_URL="your_internal_database_url_here"

# Run migrations
psql $DATABASE_URL < render.com/migrations/create_customers_table.sql

# Verify
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_name = 'customers'"
```

### Step 3: Verify Database Setup

```bash
# Using verification script
cd render.com
npm install pg
node migrations/verify-customers-migration.js "$DATABASE_URL"

# Expected output:
# ✅ Table 'customers' exists
# ✅ All required columns exist (14 total)
# ✅ Found 8 indexes
# ✅ CRUD operations working
```

---

## 🖥️ Part 2: Web Service Deployment

### Step 1: Create Web Service

1. **Create New Web Service**
   - Click **"New +"** → **"Web Service"**
   - Or visit: https://dashboard.render.com/create?type=web

2. **Connect GitHub Repository**
   - Select **"Build and deploy from a Git repository"**
   - Click **"Connect GitHub"**
   - Authorize Render.com to access nhijudyshop organization
   - Select repository: **nhijudyshop/n2store**

3. **Configure Web Service**
   ```
   Name: n2shop-api
   Region: Singapore
   Branch: main (or claude/optimize-customer-search-014hvVf5i4V8qy6gBLHkG7DE)
   Root Directory: render.com
   Runtime: Node
   Build Command: npm install
   Start Command: node server.js
   Plan: Free (or Starter $7/month)
   ```

### Step 2: Environment Variables

Add these environment variables:

| Key | Value | Description |
|-----|-------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `DATABASE_URL` | `[Internal Database URL]` | PostgreSQL connection (from Step 1.5) |
| `PORT` | `3000` | Server port (auto-set by Render) |
| `SEPAY_API_KEY` | `[Your Sepay API Key]` | Optional: Sepay webhook auth |

**How to add:**
1. Scroll to **"Environment"** section
2. Click **"Add Environment Variable"**
3. Enter Key and Value
4. Click **"Add"**

### Step 3: Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone repository
   - Run `npm install`
   - Start server with `node server.js`
   - Assign URL: `https://n2shop-api.onrender.com`

3. **Monitor Deployment**
   - Go to **"Logs"** tab
   - Wait for: `🚀 N2Store API Fallback Server`
   - Should see: `✅ [CHAT-DB] Connected at: [timestamp]`

### Step 4: Verify API

```bash
# Check health endpoint
curl https://n2shop-api.onrender.com/health

# Expected response:
# {
#   "status": "ok",
#   "message": "N2Store API Fallback Server is running",
#   "timestamp": "2025-12-06T08:00:00.000Z",
#   "uptime": 123
# }

# Test customers endpoint
curl https://n2shop-api.onrender.com/api/customers/stats

# Expected response:
# {
#   "success": true,
#   "data": {
#     "total": 0,
#     "normal": 0,
#     ...
#   }
# }
```

---

## 📊 Part 3: Data Migration

Once backend is deployed, migrate data from Firebase to PostgreSQL.

### Step 1: Install Dependencies

```bash
cd render.com
npm install firebase-admin pg dotenv
```

### Step 2: Configure Firebase Admin

Create `.env` file:
```env
DATABASE_URL=your_render_postgres_url
NODE_ENV=production
```

### Step 3: Test Migration (Dry Run)

```bash
# Test with 100 records
node migrations/migrate-firebase-to-postgres.js --dry-run --limit=100

# Expected output:
# 🔍 DRY RUN (no data will be inserted)
# ✅ PostgreSQL connection OK
# ✅ Firebase connection OK
# 📊 Found: 80000 customers
# [DRY-RUN] Would insert 100 customers
```

### Step 4: Run Full Migration

```bash
# Migrate all customers
node migrations/migrate-firebase-to-postgres.js

# Expected output:
# ✅ MIGRATION COMPLETE
# Total:    80000
# Success:  80000 ✅
# Failed:   0 ❌
# Duration: ~10 minutes
```

### Step 5: Verify Migration

```bash
# Verify data
node migrations/verify-customers-migration.js

# Check count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM customers"

# Check sample data
psql $DATABASE_URL -c "SELECT id, phone, name, status FROM customers LIMIT 10"
```

---

## 🎯 Part 4: Frontend Activation

### Step 1: Test Backend First

Open browser console on: https://nhijudyshop.github.io/n2store/customer-management/index.html

```javascript
// Check if API is available
await checkAPIHealth()
// Should return: true

// Test search
await API.searchCustomers('0123', 10)
// Should return: {success: true, data: [...], count: X}
```

### Step 2: Enable PostgreSQL API

In browser console:
```javascript
enablePostgresAPI()
// Output: ✅ PostgreSQL API enabled - reload page to take effect

location.reload()
// Page reloads and uses PostgreSQL API
```

### Step 3: Verify Performance

```javascript
// Search performance test
const start = Date.now()
await API.searchCustomers('0123')
console.log(`Search time: ${Date.now() - start}ms`)
// Expected: < 100ms (vs 300-1000ms with Firebase)

// Stats performance test
const start2 = Date.now()
await API.getStats()
console.log(`Stats time: ${Date.now() - start2}ms`)
// Expected: < 150ms (vs 3-5s with Firebase)
```

---

## 🔧 Troubleshooting

### Issue 1: Database Connection Failed

**Error**: `❌ [CHAT-DB] Connection failed`

**Solution**:
1. Check DATABASE_URL is correct (Internal URL, not External)
2. Verify database is running in Render Dashboard
3. Check IP whitelist (Render uses dynamic IPs)

```bash
# Test connection
psql $DATABASE_URL -c "SELECT NOW()"
```

### Issue 2: Build Failed

**Error**: `npm ERR! missing script: start`

**Solution**:
1. Check `render.com/package.json` has dependencies
2. Verify "Root Directory" is set to `render.com`
3. Check "Start Command" is `node server.js`

### Issue 3: CORS Error

**Error**: `No 'Access-Control-Allow-Origin' header`

**Solution**: Already handled in `server.js:19-24`
```javascript
app.use(cors({
    origin: '*',  // ✅ Allows all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Issue 4: 404 Not Found

**Error**: `GET /api/customers 404`

**Solution**:
1. Check deployment logs for errors
2. Verify route is mounted in `server.js:217`
3. Restart service in Render Dashboard

```bash
# Test locally first
cd render.com
npm install
node server.js
# Visit: http://localhost:3000/health
```

### Issue 5: Slow Cold Start

**Problem**: First request takes 30-60s

**Explanation**: Render Free tier spins down after inactivity

**Solutions**:
- **Option A**: Upgrade to Starter plan ($7/month) - no spin down
- **Option B**: Use cron job to keep alive:
  ```bash
  # Add to Render.com cron job (every 5 minutes)
  curl https://n2shop-api.onrender.com/health
  ```
- **Option C**: Accept 30-60s delay on first request (subsequent requests are fast)

---

## 📊 Monitoring

### Render Dashboard

1. **Logs**: Real-time server logs
   - View errors, requests, database queries
   - Filter by log level

2. **Metrics**: Performance graphs
   - CPU usage
   - Memory usage
   - Request count
   - Response time

3. **Events**: Deployment history
   - Build status
   - Deploy times
   - Errors

### Database Metrics

1. **Connections**: Active connections
2. **Storage**: Disk usage
3. **Queries**: Slow queries log

### Custom Monitoring

Add to `server.js`:
```javascript
// Request counter
let requestCount = 0;

app.use((req, res, next) => {
    requestCount++;
    console.log(`[STATS] Total requests: ${requestCount}`);
    next();
});

// Health endpoint with metrics
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requests: requestCount
    });
});
```

---

## 💰 Cost Breakdown

### Free Tier (Current)
- **Web Service**: Free (spins down after 15min inactivity)
- **PostgreSQL**: Free (256MB RAM, 1GB storage, 90 days backup)
- **Total**: $0/month

### Recommended for Production
- **Web Service**: Starter ($7/month)
  - No spin down
  - Always on
  - Faster response
- **PostgreSQL**: Starter ($7/month)
  - 1GB RAM
  - 10GB storage
  - 7 days backup
- **Total**: $14/month

### Comparison with Firebase
- **Firebase**: $50-100/month (80k customers, frequent searches)
- **Render**: $14/month
- **Savings**: $36-86/month ($432-1032/year)

---

## 🚀 Next Steps

After successful deployment:

1. ✅ **Monitor for 1 week**
   - Check error logs
   - Verify performance
   - Monitor costs

2. ✅ **Gradual Rollout** (Optional)
   - 10% users use PostgreSQL API
   - 50% after 3 days
   - 100% after 1 week

3. ✅ **Remove Firebase Dependencies** (After 1 month)
   - Keep Firebase auth only
   - Remove Firestore customer queries
   - Reduce Firebase costs

4. ✅ **Enable PostgreSQL Globally**
   ```javascript
   // In api-config.js, change default:
   const USE_POSTGRES_API = true; // Instead of localStorage check
   ```

---

## 📝 Checklist

### Pre-Deployment
- [ ] GitHub repository access
- [ ] Render.com account created
- [ ] Database migration scripts ready
- [ ] Environment variables prepared

### Database Setup
- [ ] PostgreSQL database created
- [ ] Migrations executed
- [ ] Indexes created
- [ ] Database verified

### Backend Deployment
- [ ] Web service created
- [ ] Repository connected
- [ ] Environment variables set
- [ ] Service deployed successfully
- [ ] Health endpoint returns 200 OK

### Data Migration
- [ ] Migration script tested (dry-run)
- [ ] Full migration completed
- [ ] Data verified in PostgreSQL
- [ ] Sample queries tested

### Frontend Activation
- [ ] API health check passes
- [ ] Search tested and working
- [ ] Performance verified (< 100ms)
- [ ] PostgreSQL API enabled

### Monitoring
- [ ] Error logs monitored
- [ ] Performance metrics tracked
- [ ] User feedback collected

---

## 📚 Resources

- [Render Documentation](https://render.com/docs)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Node.js pg Module](https://node-postgres.com/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

---

## 🆘 Support

If you encounter issues:

1. **Check Logs**: Render Dashboard → Logs tab
2. **Verify Config**: Environment variables, build/start commands
3. **Test Locally**: Run `node server.js` on local machine
4. **Database**: Check PostgreSQL connection and migrations
5. **Contact**: Render support (support@render.com)

---

**Last Updated**: 2025-12-06
**Status**: Ready for deployment
**Estimated Time**: 30-60 minutes
