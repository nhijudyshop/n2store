# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-204403-2557fef`
**Session file**: [`./20260625-204403-2557fef.md`](../20260625-204403-2557fef.md)
**Commit**: `2557fef` — feat(so-order/AI): đối chiếu Sổ Order ⇄ Kho SP tính sẵn — AI hết xin data
**Last updated**: 2026-06-25 20:44:03 +07
**Summary**: AI widget so-order: SO.reconcileWithKho() tính sẵn đối chiếu Sổ Order⇄Kho làm accessor đầu — hết xin data

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-kho-sync.js`

## Last 5 commits touching `so-order/`

- `2557fef33` feat(so-order/AI): đối chiếu Sổ Order ⇄ Kho SP tính sẵn — AI hết xin data _(2026-06-25)_
- `308ce60ba` fix(web2): unique theo mã triệt để — default by:'code' + modal/supplier-wallet variant-aware _(2026-06-25)_
- `c9495a30a` auto: session update _(2026-06-25)_
- `6ddc1a83a` fix(web2): auto-heal region từ note (un-gate migration 080) + random NCC bỏ địa danh _(2026-06-25)_
- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-204403-2557fef` cho Claude walk chain theo CLAUDE.md protocol.
