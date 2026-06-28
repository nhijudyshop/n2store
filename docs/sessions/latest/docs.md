# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-152108-56631c6`
**Session file**: [`./20260628-152108-56631c6.md`](../20260628-152108-56631c6.md)
**Commit**: `56631c6` — fix(so-order): dialog xoá vĩnh viễn thùng rác hiện cảnh báo (body→message)
**Last updated**: 2026-06-28 15:21:08 +07
**Summary**: fix(so-order): dialog xoá vĩnh viễn thùng rác hiện cảnh báo (body→message)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `56631c690` fix(so-order): dialog xoá vĩnh viễn thùng rác hiện cảnh báo (body→message) _(2026-06-28)_
- `19624c0e7` fix(so-order): tab địa danh (activeTabId) per-device — máy khác không nhảy tab theo _(2026-06-28)_
- `a653fdb24` chore(session): RESUME:20260628-145932-ca6df46 _(2026-06-28)_
- `ca6df464a` feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live-chat/dashboard) _(2026-06-28)_
- `88aeedf1c` fix(so-order): in tem sau nhận hàng ra giá 0 — lấy giá bán dòng order/Kho SP (fallback theo code) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-152108-56631c6` cho Claude walk chain theo CLAUDE.md protocol.
