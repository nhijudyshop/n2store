# Auto-publish Chrome Extension

> Pipeline tự động upload `n2store-extension/` lên Chrome Web Store khi version trong `manifest.json` thay đổi. Tích hợp vào Stop hook — không cần chạy tay.

## Tóm tắt pipeline

```
Edit code extension → bump version trong manifest.json → commit → push
                                                                   ↓
                       .claude/scripts/hooks/stop-auto-commit-push.sh
                                                                   ↓
                       scripts/auto-publish-extension.sh
                       ├─ check version: nếu chưa đổi → exit 0 (silent)
                       ├─ zip n2store-extension/
                       ├─ POST oauth2.googleapis.com/token (refresh_token → access_token)
                       ├─ PUT  upload zip lên Chrome Web Store
                       ├─ POST publish
                       └─ macOS notification + console summary
                                                                   ↓
End users: Chrome auto-pulls update từ Web Store (5-24h)
           → service-worker.js bắn chrome.notifications: "v1.0.9 đã cập nhật"
           → user click → mở link store
```

## Setup lần đầu (5-10 phút)

### Bước 1: Tạo OAuth2 Desktop App credentials

1. Vào [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. **Create credentials** → **OAuth client ID** → Application type: **Desktop app** → Name: `n2store-extension-publisher` → **Create**
3. Pop-up hiện ra `Client ID` + `Client Secret` → copy cả 2

> Nếu chưa có OAuth consent screen: setup user type **External** (Testing mode OK), thêm email của bạn vào Test users.

### Bước 2: Enable Chrome Web Store API

Vào [API Library](https://console.cloud.google.com/apis/library) → search **"Chrome Web Store API"** → **Enable**.

### Bước 3: Lấy refresh_token

```bash
cd /Users/mac/Desktop/n2store
node scripts/cws-get-refresh-token.js <CLIENT_ID> <CLIENT_SECRET>
```

Script sẽ:

- Mở browser cho bạn consent
- Bắt callback ở `http://localhost:8765/callback`
- Đổi auth code → refresh_token
- Print 4 dòng credentials ra terminal

### Bước 4: Paste credentials vào secrets file

Mở `/Users/mac/Desktop/n2store/serect_dont_push.txt` (gitignored), thêm:

```
## Chrome Web Store API (auto-publish n2store-extension)
CWS_CLIENT_ID: <paste client_id>
CWS_CLIENT_SECRET: <paste client_secret>
CWS_REFRESH_TOKEN: <paste refresh_token>
CWS_EXTENSION_ID: dgcicifdlgamleagjangkbbcdgbhmfea
```

### Bước 5: Test

```bash
# Bump version giả lập
bash scripts/auto-publish-extension.sh --dry-run
```

Phải in `DRY RUN — would upload+publish v1.0.8`. Nếu OK → bỏ `--dry-run` để publish thật.

## Cách hoạt động hàng ngày

1. Sửa code extension trong `n2store-extension/`
2. **Bump version** trong `n2store-extension/manifest.json` (vd `1.0.8` → `1.0.9`)
3. Commit + push như bình thường (Stop hook sẽ tự push)
4. Stop hook gọi `auto-publish-extension.sh`:
    - Detect version đổi → zip → upload → publish
    - In console:
        ```
        ✅ N2Store Extension v1.0.9 published
           Store:  https://chromewebstore.google.com/detail/dgcicifdlgamleagjangkbbcdgbhmfea
        ```
    - Bắn macOS notification

## Notification cho end users

`n2store-extension/background/update-notifier.js`:

- Khi Chrome auto-update extension trên máy user → `chrome.runtime.onInstalled` fire với `reason: 'update'`
- Service worker bắn `chrome.notifications`:
    - Title: "N2Store Extension đã cập nhật"
    - Body: "Phiên bản mới: v1.0.9 (từ v1.0.8). Click để xem trên Chrome Web Store."
- User click → mở `chromewebstore.google.com/detail/<extension_id>`

## Troubleshooting

### "No refresh_token returned"

App đã consent rồi → revoke ở [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → chạy lại `cws-get-refresh-token.js`.

### "ITEM_PENDING_REVIEW"

Bình thường — Chrome Web Store có thể review thủ công lần đầu / khi đổi permissions. Script vẫn return success, chỉ là update chưa ra ngay cho users.

### "upload failed (state=NOT_AUTHORIZED)"

- Tài khoản OAuth không phải owner/publisher của extension `dgcicifdlgamleagjangkbbcdgbhmfea` → thêm tài khoản vào **Developer Dashboard → User permissions**.
- Hoặc bật `2-step verification` cho Google account.

### Force publish kể cả version chưa đổi

```bash
bash scripts/auto-publish-extension.sh --force
```

### Skip auto-publish tạm thời

```bash
# Xóa execute bit để stop hook skip
chmod -x scripts/auto-publish-extension.sh
# Bật lại
chmod +x scripts/auto-publish-extension.sh
```

## Files liên quan

| File                                              | Vai trò                                        |
| ------------------------------------------------- | ---------------------------------------------- |
| `scripts/auto-publish-extension.sh`               | Main publish script                            |
| `scripts/cws-get-refresh-token.js`                | One-time OAuth helper                          |
| `.extension-last-published-version`               | Tracker file (gitignored) — version đã publish |
| `n2store-extension/background/update-notifier.js` | In-extension notification                      |
| `.claude/scripts/hooks/stop-auto-commit-push.sh`  | Stop hook gọi auto-publish                     |
| `serect_dont_push.txt`                            | Chứa CWS\_\* credentials (gitignored)          |
