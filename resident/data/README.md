# Resident clone — mock data

> Folder này được **gitignore** (`resident/data/*.json`) vì chứa PII của chủ tài khoản.

## Regenerate

```bash
# 1. Login vào resident.vn → lưu state (cookies + localStorage)
node scripts/resident-save-auth.js

# 2. Crawl tất cả route + capture API JSON
node scripts/resident-crawl-v3.js

# 3. Build mock data cho clone (copy + rename file vào folder này)
node scripts/resident-build-data.js
```

Sau bước 3, folder sẽ có ~49 file `*.json` — clone tại `resident/index.html`
sẽ load từ đây.

## Naming convention

`get-v1-<path-with-dashes>.json` — VD `get-v1-apartment.json`,
`get-v2-room.json`, `get-v1-dashboard-real-estate-report.json`.

Endpoint mapping đầy đủ: xem [_catalog.json](_catalog.json) sau khi build.
