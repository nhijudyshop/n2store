# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-083256-8b49f21`
**Session file**: [`./20260629-083256-8b49f21.md`](../20260629-083256-8b49f21.md)
**Commit**: `8b49f21` — fix(web2/ai-assistant,login): phiên hết hạn → thông báo rõ + redirect chuẩn
**Last updated**: 2026-06-29 08:32:56 +07
**Summary**: fix widget AI 'Phiên Web 2.0 hết hạn': redirect chuẩn handleAuthExpired + notice rõ ở login (?expired=1)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `8b49f216f` fix(web2/ai-assistant,login): phiên hết hạn → thông báo rõ + redirect chuẩn _(2026-06-29)_
- `044a47dad` chore(session): RESUME:20260629-082833-da9564b _(2026-06-29)_
- `429c09caa` feat(native-orders): badge "⚠ thiếu N tem" khi đơn gán 1 phần (serial < SL) _(2026-06-29)_
- `435b09da4` chore(session): RESUME:20260629-073740-f789f16 _(2026-06-29)_
- `f789f1642` feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-083256-8b49f21` cho Claude walk chain theo CLAUDE.md protocol.
