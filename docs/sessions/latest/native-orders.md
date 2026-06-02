# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-161622-79f3710`
**Session file**: [`./20260602-161622-79f3710.md`](../20260602-161622-79f3710.md)
**Commit**: `79f3710` — feat(native-orders): gửi tin UI-first — hiện ngay, chạy nền, lỗi thì bật lại text (giữ extension-trước)
**Last updated**: 2026-06-02 16:16:22 +07
**Summary**: feat(native-orders): gửi tin UI-first — hiện ngay, chạy nền, lỗi thì bật lại text (giữ extension-t...

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `79f371068` feat(native-orders): gửi tin UI-first — hiện ngay, chạy nền, lỗi thì bật lại text (giữ extension-trước) _(2026-06-02)_
- `6c30ffcb2` fix(native-orders): customer 360 modal — đọc đúng shape từ /api/web2/customer-orders _(2026-06-02)_
- `373ffc716` fix(native-orders): cột STT show campaignStt (1..n per campaign) thay vì displayStt (global seq) _(2026-06-02)_
- `2395cacb3` auto: session update _(2026-06-02)_
- `f5a7c3139` feat(native-orders): bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-161622-79f3710` cho Claude walk chain theo CLAUDE.md protocol.
