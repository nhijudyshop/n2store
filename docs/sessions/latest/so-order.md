# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-184631-03107ca`
**Session file**: [`./20260625-184631-03107ca.md`](../20260625-184631-03107ca.md)
**Commit**: `03107ca` — fix(web2): SSE audit — KPI employee-ranges publish + assignments/returns PII/zalo debounce
**Last updated**: 2026-06-25 18:46:31 +07
**Summary**: Fix regression so-order \_rowToKhoMatch (xóa/sửa lô vỡ) + vá 16 gap audit SSE (6 MED/10 LOW)

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-bulk-edit.js`
- `so-order/js/so-order-delete.js`
- `so-order/js/so-order-inline-edit.js`
- `so-order/js/so-order-settings.js`

## Last 5 commits touching `so-order/`

- `c9495a30a` auto: session update _(2026-06-25)_
- `6ddc1a83a` fix(web2): auto-heal region từ note (un-gate migration 080) + random NCC bỏ địa danh _(2026-06-25)_
- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_
- `dfde62633` auto: session update _(2026-06-25)_
- `66a2f707d` fix(web2): split-PBH cancel restocks ALL splits + 5 frontend silent-failure surfaces _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-184631-03107ca` cho Claude walk chain theo CLAUDE.md protocol.
