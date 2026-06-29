# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-091641-b95677b`
**Session file**: [`./20260629-091641-b95677b.md`](../20260629-091641-b95677b.md)
**Commit**: `b95677b` — auto: session update
**Last updated**: 2026-06-29 09:16:41 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-ai-assistant.js`

## Last 5 commits touching `web2/`

- `b95677bbf` auto: session update _(2026-06-29)_
- `9fd3316f6` feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control _(2026-06-29)_
- `8b49f216f` fix(web2/ai-assistant,login): phiên hết hạn → thông báo rõ + redirect chuẩn _(2026-06-29)_
- `da9564b40` auto: session update _(2026-06-29)_
- `f789f1642` feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-091641-b95677b` cho Claude walk chain theo CLAUDE.md protocol.
