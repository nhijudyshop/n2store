# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-171430-832f2f6`
**Session file**: [`./20260520-171430-832f2f6.md`](../20260520-171430-832f2f6.md)
**Commit**: `832f2f6` — fix(web2/native-orders): in bill — STT merge "26 + 30" + bỏ trễ 250ms
**Last updated**: 2026-05-20 17:14:30 +07
**Summary**: fix(web2/native-orders): in bill — STT merge "26 + 30" + bỏ trễ 250ms

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `832f2f6f` fix(web2/native-orders): in bill — STT merge "26 + 30" + bỏ trễ 250ms _(2026-05-20)_
- `6fe48527` feat(web2/PBH): split-PBH (tách đơn) — 1 native-order → nhiều PBH với STT 24-2, 24-3... _(2026-05-20)_
- `ea49f58f` feat(web2): 2-way state sync native-orders ↔ PBH + nút Huỷ đơn + bỏ Xác nhận PBH _(2026-05-20)_
- `830ff74f` feat(web2/purchase-refund): custom UI dashboard với state machine actions _(2026-05-20)_
- `0599b1dd` feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-171430-832f2f6` cho Claude walk chain theo CLAUDE.md protocol.
