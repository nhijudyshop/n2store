# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-163838-0433154`
**Session file**: [`./20260609-163838-0433154.md`](../20260609-163838-0433154.md)
**Commit**: `0433154` — feat(web2): mã PBH vào giữa QR (Web2QR.centerLabel, EC H) — vẫn quét được
**Last updated**: 2026-06-09 16:38:38 +07
**Summary**: feat(web2): mã PBH vào giữa QR (Web2QR.centerLabel, EC H) — vẫn quét được

## Files changed in this commit (`web2/`)

- `web2/shared/web2-bill-service.js`
- `web2/shared/web2-qr.js`

## Last 5 commits touching `web2/`

- `04331544d` feat(web2): mã PBH vào giữa QR (Web2QR.centerLabel, EC H) — vẫn quét được _(2026-06-09)_
- `b72e5a85e` auto: session update _(2026-06-09)_
- `74098cab5` auto: session update _(2026-06-09)_
- `100ef0323` fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview _(2026-06-09)_
- `e7bf6117d` feat(web2): tem mã SP — mã SP xuống dưới QR, canh giữa, rộng = QR _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-163838-0433154` cho Claude walk chain theo CLAUDE.md protocol.
