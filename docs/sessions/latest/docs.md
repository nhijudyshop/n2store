# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-102830-15668b5`
**Session file**: [`./20260627-102830-15668b5.md`](../20260627-102830-15668b5.md)
**Commit**: `15668b5` — docs(dev-log): audit 5 bug user + fix AI tên chiến dịch/lag/zalo cookie/hardening
**Last updated**: 2026-06-27 10:28:30 +07
**Summary**: Audit 5 bug user: 3 fixed sẵn (ai-hub/chat-jump/native-split) + fix AI tên chiến dịch + lag firebase + zalo cookie bootstrap + msgTs hardening; regression 124 assertions GREEN; browser smoke 0 errors

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `15668b516` docs(dev-log): audit 5 bug user + fix AI tên chiến dịch/lag/zalo cookie/hardening _(2026-06-27)_
- `17307ceba` chore(session): RESUME:20260627-094945-41294a1 _(2026-06-27)_
- `41294a16b` fix(web2 sepay R4 MEDIUM): CHECK constraint thiếu pending*no_order → gate marker fail → retry storm *(2026-06-27)\_
- `2ae11f8df` chore(session): RESUME:20260627-092838-1a667cc _(2026-06-27)_
- `1a667cc17` docs(web2 flow R4): verify báo cáo kho (29 assertions) + revenue + công thức lương — 0 bug code _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-102830-15668b5` cho Claude walk chain theo CLAUDE.md protocol.
