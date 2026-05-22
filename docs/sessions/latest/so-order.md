# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-093528-0c84e2f`
**Session file**: [`./20260522-093528-0c84e2f.md`](../20260522-093528-0c84e2f.md)
**Commit**: `0c84e2f` — feat(web2): áp dụng TPOS theme chuẩn cho 11 trang Web 2.0
**Last updated**: 2026-05-22 09:35:28 +07
**Summary**: feat(web2): áp dụng TPOS theme chuẩn cho 11 trang Web 2.0

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `0c84e2f9b` feat(web2): áp dụng TPOS theme chuẩn cho 11 trang Web 2.0 _(2026-05-22)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `7b2eadd23` fix(web2/sidebar): preload web2-auth.js ở 19 trang load tpos-sidebar trực tiếp _(2026-05-19)_
- `95dc85bfb` chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0' _(2026-05-19)_
- `3c5d5c105` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-093528-0c84e2f` cho Claude walk chain theo CLAUDE.md protocol.
