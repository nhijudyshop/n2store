# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260610-193213-d698bc2`
**Session file**: [`./20260610-193213-d698bc2.md`](../20260610-193213-d698bc2.md)
**Commit**: `d698bc2` — fix(web2): đổi label QR modal 'Partner Id' → 'Mã KH (Web 2.0)' tránh nhầm TPOS
**Last updated**: 2026-06-10 19:32:13 +07
**Summary**: fix(web2): đổi label QR modal 'Partner Id' → 'Mã KH (Web 2.0)' tránh nhầm TPOS

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/index.html`
- `web2/shared/web2-qr-modal.js`

## Last 5 commits touching `web2/`

- `d698bc234` fix(web2): đổi label QR modal 'Partner Id' → 'Mã KH (Web 2.0)' tránh nhầm TPOS _(2026-06-10)_
- `1f55c58c5` feat(web2): tem mã SP — phóng to QR/tên/mã/biến thể/giá lần nữa (font ×2.0, QR 0.52) _(2026-06-09)_
- `ecf62e02f` feat(web2): tem mã SP — phóng to toàn bộ giao diện (font ×1.75, QR to, tên 3 dòng auto-fit) _(2026-06-09)_
- `c7267d350` auto: session update _(2026-06-09)_
- `0c901e12b` auto: session update _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260610-193213-d698bc2` cho Claude walk chain theo CLAUDE.md protocol.
