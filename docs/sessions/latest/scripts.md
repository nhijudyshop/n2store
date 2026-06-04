# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-103722-f27b575`
**Session file**: [`./20260604-103722-f27b575.md`](../20260604-103722-f27b575.md)
**Commit**: `f27b575` — chore(web2): scripts wipe+reseed data ảo (mã SP đúng Web2ProductCode) + verify
**Last updated**: 2026-06-04 10:37:22 +07
**Summary**: chore(web2): scripts wipe+reseed data ảo (mã SP đúng Web2ProductCode) + verify

## Files changed in this commit (`scripts/`)

- `scripts/web2-seed-fake-data.js`
- `scripts/web2-wipe-so-order.js`

## Last 5 commits touching `scripts/`

- `f27b57581` chore(web2): scripts wipe+reseed data ảo (mã SP đúng Web2ProductCode) + verify _(2026-06-04)_
- `cd029da6d` fix(web2): generic /api/web2 route shadow dedicated → data 3 trang load lại _(2026-06-04)_
- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_
- `b2e8d4c20` chore(web2): xóa trang sale-online-facebook + dừng cron sync 15min _(2026-06-01)_
- `a92e02dd1` chore(web2): xóa 57 trang TPOS-clone stub không dùng + dọn sidebar/nav _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-103722-f27b575` cho Claude walk chain theo CLAUDE.md protocol.
