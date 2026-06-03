# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-203306-cb39039`
**Session file**: [`./20260603-203306-cb39039.md`](../20260603-203306-cb39039.md)
**Commit**: `cb39039` — fix(web2): photo-studio v8 — màn xem ảnh sau chụp + lưu ảnh đúng cách mobile
**Last updated**: 2026-06-03 20:33:06 +07
**Summary**: fix(web2): photo-studio v8 — màn xem ảnh sau chụp + lưu ảnh đúng cách mobile

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-customers-schema.js`
- `render.com/routes/v2/dashboard-kpi.js`
- `render.com/routes/v2/smart-match.js`

## Last 5 commits touching `render.com/`

- `d6ee4135f` fix(web2): backtick trong SQL comment làm vỡ template literal → server require throw. Đổi sang dấu nháy kép _(2026-06-03)_
- `120b773d3` feat(web2): web2*customers thêm fb_id + helpers (getOrCreateWeb2Customer/findByFbId/linkFbId) — nền tảng gộp kho KH (native-orders chưa migrate vì schema phức tạp) *(2026-06-03)\_
- `d9924bcf0` fix(web2): smart-match + dashboard-kpi đọc web2*balance_history (web2Db) thay balance_history (bản copy stale Web 1.0) *(2026-06-03)\_
- `9b4fc5e75` fix(web2): wallet-deposits (ví NCC+KH) đọc web2*balance_history (web2Db) thay balance_history Web 1.0 — 1 nguồn SePay *(2026-06-03)\_
- `e73f9f7f3` feat(web2): rematch-all endpoint (keyset id, xử lý mỗi GD 1 lần) — fix reprocess re-pick recent rows _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-203306-cb39039` cho Claude walk chain theo CLAUDE.md protocol.
