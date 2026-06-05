# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-120152-6502f39`
**Session file**: [`./20260605-120152-6502f39.md`](../20260605-120152-6502f39.md)
**Commit**: `6502f39` — feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb_id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids)
**Last updated**: 2026-06-05 12:01:52 +07
**Summary**: feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb_id (TPOS trước, kho KH lấp ch...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6502f392f` feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb*id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids) *(2026-06-05)\_
- `ff2d4e6ac` chore(session): RESUME:20260605-115435-21fe221 _(2026-06-05)_
- `21fe22150` docs(dev-log): ten SP toi da 2 dong _(2026-06-05)_
- `eaf2580c7` chore(session): RESUME:20260605-115107-91e84e9 _(2026-06-05)_
- `a6f0e3e7d` feat(native-orders): gửi tin nhắn template qua JOB server-side đa-account Pancake + extension fallback (refresh-safe, SSE progress) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-120152-6502f39` cho Claude walk chain theo CLAUDE.md protocol.
