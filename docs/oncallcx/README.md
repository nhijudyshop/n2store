# OnCallCX Portal Integration

Tích hợp portal `pbx-ucaas.oncallcx.vn` vào N2Store để đọc CDR + nghe/tải ghi âm trực tiếp.

## Kiến trúc

```
Browser (phone-management/index.html)
   │
   │  fetch /api/oncall/portal/* (CORS: nhijudyshop.github.io)
   ▼
Cloudflare Worker (chatomni-proxy)
   │  proxy /api/oncall/* → render
   ▼
Render.com (n2store-fallback)
   │  oncall-sip-proxy.js route
   │  ↓
   │  services/oncall-portal-client.js (HTTP-only)
   ▼
pbx-ucaas.oncallcx.vn (PrimeFaces JSF)
```

## Files

- `render.com/services/oncall-portal-client.js` — HTTP-only client (login, scrape tables, download recording)
- `render.com/routes/oncall-sip-proxy.js` — Thêm 6 routes `/portal/*`
- `phone-management/js/phone-management.js` — `loadOncallCdrs`, `playPortalRecording`, `downloadPortalRecording`
- `phone-management/index.html` — Subtab "OnCallCX Portal" trong tab Ghi âm
- `scripts/oncallcx-*.js` — Utility scripts (crawl, debug, test)

## Deploy

### 1. Set env vars trên Render

```bash
# Service: n2store-fallback (srv-d4e5pd3gk3sc73bgv600)
ONCALL_USERNAME=carmelledung@gmail.com
ONCALL_PASSWORD=<password from serect_dont_push.txt line 26>
```

Có thể dùng Render dashboard hoặc API:
```bash
curl -X PUT "https://api.render.com/v1/services/srv-d4e5pd3gk3sc73bgv600/env-vars/ONCALL_USERNAME" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value":"carmelledung@gmail.com"}'
```

### 2. Deploy render

Git push → Render auto-deploy. Hoặc manual redeploy trên dashboard.

### 3. Verify

```bash
# Test endpoints
curl https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall/portal/calls
curl https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall/portal/extensions
curl https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall/portal/recording/<rowKey>
```

Mở `phone-management/index.html` → Tab Ghi âm → OnCallCX Portal subtab. Bảng phải hiện 25 cuộc gọi gần nhất với nút Play/Download cho những cuộc có recording.

## API Endpoints

| Method | Path | Mô tả | Cache |
|--------|------|-------|-------|
| GET | `/api/oncall/portal/calls?page=1` | List CDR (25 rows/page) | 15s |
| GET | `/api/oncall/portal/extensions` | Extensions table | 60s |
| GET | `/api/oncall/portal/live-calls` | Active calls ngay lúc này | none |
| GET | `/api/oncall/portal/public-numbers` | DID routing | 120s |
| GET | `/api/oncall/portal/dashboard` | Phone status | 30s |
| GET | `/api/oncall/portal/recording/:rowKey` | Stream WAV (inline) | 1h |
| GET | `/api/oncall/portal/recording/:rowKey?download=1` | Tải WAV (attachment) | 1h |

Response format:
```json
{ "success": true, "cached": false, "calls": [...], "headers": [...] }
```

## Session Management

- Client login lần đầu → cache `ANAUTH` cookie + JSESSIONID + ViewState
- Tự re-login nếu session > 40 min hoặc redirect về login page
- Shared giữa các requests qua singleton `getPortalClient()`
- Không có race condition vì Node single-threaded

## Troubleshooting

### "ONCALL_USERNAME / ONCALL_PASSWORD env vars required"
→ Chưa set env trên Render. Xem phần Deploy.

### "Login failed: no ANAUTH cookie"
→ Sai credentials, hoặc portal đổi form layout. Chạy `node scripts/capture-oncallcx-login.js` local để debug.

### "Download URL not found in response"
→ Portal đổi AJAX response format. Chạy `node scripts/oncallcx-capture-download-flow.js` để capture lại flow, so sánh với `docs/oncallcx/download-flow-trace.json`.

### Recording bị 404 hoặc 0 byte
→ rowKey hết hạn (portal ViewState 30 min). Client tự re-login retry 1 lần; nếu vẫn fail, refresh bảng CDR để lấy ViewState mới.

## Scripts

```bash
# Crawl toàn bộ pages
node scripts/oncallcx-full-crawl.js

# Test client
node scripts/test-oncall-portal-client.js

# Download hàng loạt recordings
HEADLESS=1 MAX=20 node scripts/oncallcx-download-recordings.js

# Capture login request (debug)
node scripts/capture-oncallcx-login.js

# Capture download flow
node scripts/oncallcx-capture-download-flow.js
```

## Portal Map

Xem chi tiết tại [portal-map.md](portal-map.md).
