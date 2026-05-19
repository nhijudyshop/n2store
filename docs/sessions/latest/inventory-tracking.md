# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-091856-3c5d5c1`
**Session file**: [`./20260519-091856-3c5d5c1.md`](../20260519-091856-3c5d5c1.md)
**Commit**: `3c5d5c1` — feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write
**Last updated**: 2026-05-19 09:18:56 +07
**Summary**: feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modal-convert-po.css`
- `inventory-tracking/js/modal-convert-po.js`

## Last 5 commits touching `inventory-tracking/`

- `2a63aac7` fix(inventory-tracking/modal-convert-po): dropdown gợi ý SP trải rộng hết bảng, không cắt tên dài _(2026-05-18)_
- `025598ea` feat(inventory↔po): badge inventory products đã được đưa qua PO Draft + chip đếm _(2026-05-07)_
- `cb2bcc24` feat(inventory/convert-po): iPad SL readability + persistent suggest dropdown + Đồng bộ giá _(2026-05-07)_
- `a8096494` fix(inv-modal): strip leading [CODE] khỏi tên SP suggestion từ kho TPOS _(2026-05-03)_
- `67131c0a` feat(inv+po): lock variant/mã + badge TPOS cho item chọn từ kho, dropdown fixed-position _(2026-05-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-091856-3c5d5c1` cho Claude walk chain theo CLAUDE.md protocol.
