# Plan: Tối ưu Load Tin nhắn trong Chat Modal

> **Ngày tạo:** 2026-04-22
> **Module:** `orders-report/` — Chat Modal (Tab1)
> **Vấn đề:** "Đang tải tin nhắn..." chậm hoặc không load được, xảy ra liên tục với nhiều khách
> **Status:** 📋 Draft — chờ user confirm từng phase trước khi implement

---

## 1. Vấn đề hiện tại

Khi user click vào 1 đơn → mở chat modal → spinner "Đang tải tin nhắn..." hiện mãi hoặc load rất chậm. Triệu chứng:
- Xảy ra với **nhiều khách khác nhau** (không phải lỗi dữ liệu riêng lẻ)
- **Liên tục**, không phải intermittent
- Panel phải "Chưa có sản phẩm trong đơn" load được → không phải modal hỏng toàn bộ

## 2. Root cause — từ Audit

Audit đã xác định **6 bottleneck xếp theo impact**:

| # | Bottleneck | Impact | File:line |
|---|-----------|--------|-----------|
| 1 | **Zero timeout/AbortController** trên tất cả 10 `fetch()` calls | Spinner treo vô hạn khi Pancake/Render hang | Toàn bộ chain |
| 2 | **Render.com cold start** trên PATH B (page switch) | 10–30s cold penalty lần đầu sau 15min idle | `tab1-chat-core.js:539-557` |
| 3 | **PAT regen fallback qua Render** + loop sequential multi-account | 800–3000ms mỗi lần PAT expire | `pancake-token-manager.js:1252` |
| 4 | **3 sequential Render calls** trong PATH B (không parallel) | +500-1500ms (dù có thể parallel 2/3) | `tab1-chat-core.js:539, 544, 554` |
| 5 | **inboxMapByPSID stale** → luôn trigger API fallback với đơn mới | +300-1500ms mỗi chat mở đơn mới | `pancake-data-manager.js:120` |
| 6 | **Background enrichment fetch** cho thread_id missing | +1 round-trip Pancake mỗi open | `tab1-chat-core.js:697` |

**Silent error swallow nguy hiểm nhất:** `fetchMessages` line 511 trả về `{ messages: [] }` khi PAT fail → caller render empty array → **spinner không bị replace → treo vô hạn**.

## 3. Solution Overview

6 phases ưu tiên từ **quick win** đến **architectural change**:

```
Phase 1 ─ Timeout/Abort      (1 ngày, quick win — fix ngay "treo vô hạn")
Phase 2 ─ Shared PAT Cache   (2-3 ngày, ⭐ highest value — user-proposed)
Phase 3 ─ Parallel lookups   (0.5 ngày, parallelize 2/3 Render calls)
Phase 4 ─ Proactive PAT cron (1 ngày, refresh trước expire → 0 cold regen)
Phase 5 ─ Error surface fix  (0.5 ngày, spinner không silent)
Phase 6 ─ Cache warming      (1 ngày, preload inboxMap top customers)
```

**Total estimate:** 6–8 ngày làm việc.

---

## Phase 1 — Timeout & Abort Controller

**Goal:** Không bao giờ có spinner "Đang tải vô hạn". Mọi request hang ≤10s sẽ bị hủy + hiện error.

### Changes

**File `orders-report/js/utils/fetch-with-timeout.js` (NEW):**
```js
export async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}
```

**Patch tất cả fetch trong:**
- `pancake-data-manager.js` — `fetchMessages`, `fetchConversationsByCustomerFbId`, `fetchConversationsByCustomerIdMultiPage` (8s timeout)
- `pancake-token-manager.js` — `_tryGenerateWithToken`, Render `/api/pancake-accounts` (10s timeout)
- `tab1-chat-core.js:539-557` — 3 Render lookups trong PATH B (6s each, cold start sẽ fail lần đầu rồi retry warm)

**Stale-check sau MỖI fetch (không chỉ sau `conv` resolution):**
```js
if (_isStale()) { ctrl.abort(); return; }
```

### AbortController propagation

Truyền `signal` từ `openChatModal` xuống tất cả fetch trong chain → khi user click đơn khác, cancel TẤT CẢ requests đang pending (không chỉ ignore results).

### Acceptance

- [ ] Tắt WiFi → mở chat → sau 10s hiện "Không tải được tin nhắn, thử lại" (không spinner vô hạn)
- [ ] Mở chat A → ngay lập tức click chat B → chat A không consume network (verify Network tab aborted)
- [ ] Render slow 20s → chat vẫn fallback qua Pancake direct (nếu có) hoặc hiện error rõ ràng

---

## Phase 2 — Shared PAT Cache trên Render DB ⭐

**User-proposed.** Giải quyết trực tiếp bottleneck #3: mỗi máy khỏi phải regen PAT riêng.

### Kiến trúc

```
┌─────────────┐       ┌──────────────────────┐       ┌─────────────┐
│  Machine A  │───┐   │  Render DB           │   ┌───│  Machine B  │
│             │   │   │  pat_cache table     │   │   │             │
│ regen PAT   │──→├──→│  page_id | pat | ttl │──→├──│  get PAT    │
│ save Render │   │   │  (AES-256 encrypted) │   │   │  (no regen!)│
└─────────────┘   │   └──────────────────────┘   │   └─────────────┘
                  │                               │
                  └───── realtime WS push ────────┘
```

### Backend (Render)

**Schema — PostgreSQL table `pat_cache`:**
```sql
CREATE TABLE pat_cache (
    page_id TEXT PRIMARY KEY,
    pat_encrypted TEXT NOT NULL,     -- AES-256-GCM ciphertext
    iv TEXT NOT NULL,                 -- AES IV (base64)
    generated_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,  -- Pancake PAT ~60 ngày
    generated_by TEXT,                -- user email/machine id
    regen_lock_until TIMESTAMPTZ,     -- distributed lock (5s TTL)
    last_used_at TIMESTAMPTZ
);
CREATE INDEX idx_pat_expires ON pat_cache(expires_at);
```

**Endpoints mới (`render.com/routes/pat-cache.js`):**

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/pat-cache/:pageId` | — | `{ pat, expires_at }` hoặc `404` |
| `PUT` | `/api/pat-cache/:pageId` | `{ pat, expires_at, user }` | `200` ok |
| `POST` | `/api/pat-cache/:pageId/lock` | — | `{ acquired: true/false, lock_until }` |
| `DELETE` | `/api/pat-cache/:pageId` | — | xóa (force regen) |

**Encryption:**
- Master key: `PAT_ENCRYPTION_KEY` env var (32 bytes, gen bằng `openssl rand -hex 32`)
- Algorithm: AES-256-GCM (authenticated encryption)
- IV random mỗi encrypt (stored cùng ciphertext)
- Decrypt chỉ trên Render server — client KHÔNG giữ master key

**Distributed lock logic:**
```js
// POST /api/pat-cache/:pageId/lock
// Atomic UPDATE ... WHERE regen_lock_until < NOW()
const result = await db.query(`
  UPDATE pat_cache SET regen_lock_until = NOW() + INTERVAL '5 seconds'
  WHERE page_id = $1 AND (regen_lock_until IS NULL OR regen_lock_until < NOW())
  RETURNING regen_lock_until
`, [pageId]);
return { acquired: result.rowCount > 0 };
```

### Frontend (orders-report)

**Modify `pancake-token-manager.js`:**
```js
async getPageAccessToken(pageId) {
    // 1. In-memory cache
    if (this.pageAccessTokens[pageId]) return this.pageAccessTokens[pageId];

    // 2. NEW: Try Render shared cache
    try {
        const res = await fetchWithTimeout(`${RENDER_URL}/api/pat-cache/${pageId}`, {}, 3000);
        if (res.ok) {
            const { pat, expires_at } = await res.json();
            if (new Date(expires_at) > Date.now() + 60000) {  // 60s buffer
                this.pageAccessTokens[pageId] = pat;
                this._saveToIndexedDB();
                return pat;
            }
        }
    } catch (_) { /* fallback to regen */ }

    // 3. Acquire distributed lock → regen → push back
    const lock = await this._tryAcquireRegenLock(pageId);
    if (!lock.acquired) {
        // Another machine is regenerating — poll Render for 3s
        return await this._pollRenderPAT(pageId, 3000);
    }

    const pat = await this.generatePageAccessToken(pageId);
    if (pat) {
        await this._pushPATToRender(pageId, pat);
    }
    return pat;
}
```

**Realtime broadcast (optional, nice-to-have):**
- Sau khi PUT Render → Render push qua WebSocket → tất cả clients khác refresh local cache ngay (không cần đợi next chat open)
- Dùng existing WS infrastructure trong `render.com/server.js`

### Security

- ✅ PAT encrypted at rest trên Render DB
- ✅ Endpoint `/api/pat-cache/*` require auth header (hiện tại Render đã có `X-API-Key` middleware? Check cần kỹ)
- ✅ Rate limit PUT: max 10/min/page để tránh spam regen
- ✅ Audit log: `generated_by` field → biết ai regen khi nào
- ⚠️ HTTPS only (Render force-ssl)

### Acceptance

- [ ] Máy mới: mở chat lần đầu → PAT lấy từ Render → không gọi `generate_page_access_token`
- [ ] 2 máy cùng regen đồng thời → chỉ 1 máy thực sự regen, máy kia đợi và dùng chung
- [ ] PAT expired → 1 máy regen → máy khác refresh cache qua WS push (nếu làm)
- [ ] Render DB decrypt đúng PAT đã encrypt

### Migration

- Deploy Phase 2 không breaking: nếu Render endpoint 404 → code fallback về flow cũ (generate local)
- Backfill: không cần, các máy sẽ tự push PAT lên Render lần regen đầu tiên

---

## Phase 3 — Parallel Lookups PATH B

**Goal:** Giảm PATH B (explicit page switch) từ 3 sequential Render calls → 2 parallel + 1 dependent.

### Current (sequential, tab1-chat-core.js:535-562)

```
[fb-global-id?psid=]   ──→ 500ms
[customers/by-phone]   ──→ 500ms (chỉ dùng nếu step 1 miss)
[fb-global-id/by-global]──→ 500ms (depend step 2)
Total: 1500ms warm, 20s+ cold
```

### Proposed (parallel where safe)

```
Parallel(
    [fb-global-id?psid=],         ──┐
    [customers/by-phone]          ──┤→ Promise.all → pick first-found globalId
)                                    │
└── if globalId → [fb-global-id/by-global] ──→ targetFbId
Total: 500ms warm + 500ms = 1000ms (33% faster)
```

### Code change

```js
const [cacheData, custData] = await Promise.all([
    fetchWithTimeout(`${renderUrl}/api/fb-global-id?pageId=${srcPageId}&psid=${psid}`, {}, 6000)
        .then(r => r.json()).catch(() => null),
    customerPhone
        ? fetchWithTimeout(`${renderUrl}/api/v2/customers/by-phone/${encodeURIComponent(customerPhone)}`, {}, 6000)
            .then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
]);

let globalId = cacheData?.found ? cacheData.globalUserId : (custData?.global_id || null);
let targetFbId = custData?.pancake_data?.page_fb_ids?.[pageId] || null;

if (!targetFbId && globalId) {
    const targetData = await fetchWithTimeout(
        `${renderUrl}/api/fb-global-id/by-global?globalUserId=${globalId}&pageId=${pageId}`,
        {}, 6000
    ).then(r => r.json()).catch(() => null);
    if (targetData?.found) targetFbId = targetData.psid;
}
```

### Acceptance

- [ ] PATH B warm path giảm từ 1500ms → 1000ms (đo qua Performance API)
- [ ] Không regression với PATH B cold start (cả 2 parallel fail → fallback name search vẫn chạy)

---

## Phase 4 — Proactive PAT Refresh Cron

**Goal:** Không máy nào dính cold PAT regen. Refresh tất cả PATs trước expire 7 ngày.

### Implementation

**File `render.com/cron/refresh-pats.js` (NEW):**
```js
// Chạy mỗi 1h
cron.schedule('0 * * * *', async () => {
    const expiringSoon = await db.query(`
        SELECT page_id FROM pat_cache
        WHERE expires_at < NOW() + INTERVAL '7 days'
    `);

    for (const { page_id } of expiringSoon.rows) {
        try {
            const newPat = await generatePATViaPancakeAPI(page_id);
            await savePATEncrypted(page_id, newPat);
            console.log(`[CRON] Refreshed PAT for ${page_id}`);
        } catch (e) {
            console.error(`[CRON] Refresh failed for ${page_id}:`, e);
            // Alert via webhook/email
        }
    }
});
```

### Monitoring

- Slack/Discord webhook khi cron fail
- Dashboard Render: PAT cache hit rate, expires_at distribution

### Acceptance

- [ ] Không có PAT nào expire trước khi cron refresh (alert nếu expires_at < NOW())
- [ ] Cold regen rate giảm về gần 0 (từ 100%)

---

## Phase 5 — Error Surface Fix

**Goal:** Spinner KHÔNG BAO GIỜ treo silent. Mọi failure path phải replace spinner bằng error state có action.

### Changes

**`pancake-data-manager.js:511` (fetchMessages catch):**
```js
// OLD: return { messages: [] };  // silent!
// NEW:
catch (e) {
    console.error('[PDM] fetchMessages error:', e);
    throw new ChatLoadError('MESSAGES_FETCH_FAILED', {
        pageId, conversationId, cause: e
    });
}
```

**`tab1-chat-core.js:_loadMessages` catch:**
```js
try {
    await _loadMessages(...);
} catch (e) {
    messagesEl.innerHTML = `
        <div class="chat-error-state">
            <p>❌ ${e.code === 'PAT_FAILED' ? 'Hết phiên đăng nhập Pancake' : 'Không tải được tin nhắn'}</p>
            <button onclick="window.openChatModal(...)">🔄 Thử lại</button>
            <small>${e.cause?.message || ''}</small>
        </div>
    `;
}
```

### Error taxonomy

| Code | Nguyên nhân | UX |
|------|-------------|-----|
| `PAT_FAILED` | Generate/fetch PAT lỗi | "Hết phiên Pancake — vui lòng refresh" |
| `CONV_NOT_FOUND` | Không tìm thấy conversation | "Không có chat với khách này" |
| `MESSAGES_FETCH_FAILED` | Pancake API lỗi | "Lỗi mạng — Thử lại" |
| `TIMEOUT` | Abort sau 10s | "Mạng chậm — Thử lại" |

### Acceptance

- [ ] Tắt WiFi → mở chat → hiện error + nút "Thử lại" (không spinner vô hạn)
- [ ] PAT fail → hiện "Hết phiên Pancake" + nút reload, không silent empty
- [ ] Mọi catch block có `console.error` rõ ràng (không `catch {}`)

---

## Phase 6 — Cache Warming (inboxMap Preload)

**Goal:** Khi user lọc đơn, preload `inboxMapByPSID` cho top N đơn hiển thị → open chat **instant** (cache hit).

### Implementation

**`tab1-table.js` sau khi render table:**
```js
async function warmChatCacheForVisibleOrders() {
    const visibleOrders = getVisibleOrders().slice(0, 20);  // top 20
    const pageIds = [...new Set(visibleOrders.map(o => o.channelId))];

    for (const pageId of pageIds) {
        // Chỉ warm nếu chưa có trong cache
        if (pdm.inboxMapByPSID.size < 1000) {  // avoid mem bloat
            pdm.fetchConversations(pageId, { limit: 50, bg: true });  // fire-and-forget
        }
    }
}
```

### Trade-off

- ✅ Chat open instant cho top 20 đơn
- ⚠️ Thêm background network load khi render table
- → Chỉ fire khi idle (dùng `requestIdleCallback`)

### Acceptance

- [ ] Top 20 đơn trên table: mở chat < 200ms (cache hit)
- [ ] Đơn ngoài top 20: fallback flow cũ, không regression

---

## 4. Risks & Rollback

### Phase 1 (Timeout)
- **Risk:** Timeout quá ngắn → abort hợp lệ requests khi mạng yếu
- **Mitigation:** Configurable per endpoint, log tỷ lệ abort để tune
- **Rollback:** Feature flag `CHAT_USE_TIMEOUT=false` → revert

### Phase 2 (Shared PAT)
- **Risk:** Render DB compromise → leak tất cả PATs
- **Mitigation:** AES-256-GCM encryption + rotate master key quarterly
- **Risk:** Race condition → 2 máy regen khác nhau → conflict
- **Mitigation:** Distributed lock via atomic SQL UPDATE
- **Rollback:** Feature flag `CHAT_USE_SHARED_PAT=false` → fallback local cache

### Phase 3 (Parallel)
- **Risk:** Parallel fail → lost context
- **Mitigation:** Each branch has its own catch + fallback chain
- **Rollback:** Git revert single commit

### Phase 4 (Cron)
- **Risk:** Cron fail silently → PATs expire
- **Mitigation:** Alert webhook + monitoring dashboard
- **Rollback:** Disable cron job, PATs sẽ expire tự nhiên rồi máy regen khi cần

### Phase 5 (Error surface)
- **Risk:** User sợ khi thấy error (vs spinner im lặng)
- **Mitigation:** UX friendly messages + clear action (Thử lại)
- **Rollback:** Không, đây là UX fix cần thiết

### Phase 6 (Preload)
- **Risk:** Thêm bandwidth cho đơn user không click
- **Mitigation:** `requestIdleCallback` + limit top 20 + check memory
- **Rollback:** Feature flag `CHAT_PRELOAD_CACHE=false`

## 5. Metrics & Success Criteria

### Before (baseline — cần đo trước khi implement)
- [ ] Median time: openChatModal → messages rendered (ms)
- [ ] P95 time (worst case)
- [ ] % requests hang > 10s
- [ ] Cache hit rate: `_messagesCache`, `_pageConvCache`, `inboxMapByPSID`
- [ ] PAT regen rate per hour

### After (target)
| Metric | Baseline | Target | Phase |
|--------|----------|--------|-------|
| Median load time | unknown | < 500ms | 1+3+6 |
| P95 load time | unknown | < 2000ms | 1+2+4 |
| % hang > 10s | unknown | **0%** | 1 |
| PAT regen / hour | unknown | < 1 (only on expire) | 2+4 |
| Silent spinner treo | frequent | **never** | 1+5 |

### Instrumentation (cần thêm)

**File `orders-report/js/tab1/tab1-chat-metrics.js` (NEW):**
```js
window.ChatMetrics = {
    startLoad(orderId) {
        this._start = performance.now();
        this._orderId = orderId;
    },
    endLoad(success, errorCode) {
        const duration = performance.now() - this._start;
        // POST to Render /api/metrics/chat-load
        navigator.sendBeacon(`${RENDER}/api/metrics/chat-load`, JSON.stringify({
            orderId: this._orderId,
            duration,
            success,
            errorCode,
            timestamp: Date.now()
        }));
    }
};
```

## 6. Implementation Order

Recommended sequence (mỗi phase 1 commit/PR riêng):

```
Day 1-2: Phase 1 (timeout) + Phase 5 (error surface)  ← Quick wins, ship ngay
Day 3:   Instrumentation + baseline metrics collection
Day 4-5: Phase 2 backend (Render DB schema + endpoints + encryption)
Day 6:   Phase 2 frontend (PAT manager integration)
Day 7:   Phase 3 (parallel lookups) + Phase 4 (cron)
Day 8:   Phase 6 (cache warming) + final metrics comparison
```

## 7. Open Questions (cần user confirm)

- [ ] **Phase 2 Realtime broadcast** (WS push khi PAT update) — làm luôn hay để Phase 2.5 riêng?
- [ ] **Phase 6 Preload** — top 20 hay configurable? Chỉ khi idle hay luôn luôn?
- [ ] **Encryption key rotation** — quarterly manual hay auto?
- [ ] **Metrics backend** — ghi vào Render DB hay external (Grafana Cloud, Plausible, etc.)?
- [ ] **Feature flags** — dùng env var trên Render + hardcode client, hay build feature flag service?

---

## 8. Related Files

### To modify
- `orders-report/js/tab1/tab1-chat-core.js` — main loading flow
- `orders-report/js/managers/pancake-data-manager.js` — API calls
- `orders-report/js/managers/pancake-token-manager.js` — PAT handling

### To create
- `orders-report/js/utils/fetch-with-timeout.js` — timeout utility
- `orders-report/js/tab1/tab1-chat-metrics.js` — instrumentation
- `render.com/routes/pat-cache.js` — Render endpoints
- `render.com/cron/refresh-pats.js` — cron job
- `render.com/migrations/XXX_pat_cache.sql` — DB schema

### Reference
- `docs/architecture/DATA-SYNCHRONIZATION.md` — sync pattern
- `docs/render/render.md` — Render API conventions
- `docs/cloudflare/cloudflare.md` — CF worker for Pancake proxy
