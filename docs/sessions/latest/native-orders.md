# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-190046-f3f7741`
**Session file**: [`./20260602-190046-f3f7741.md`](../20260602-190046-f3f7741.md)
**Commit**: `f3f7741` — feat(web2): hiển thị số dư ví KH khắp nơi + tìm 5-10 số đuôi SĐT + ẩn Tổng tiền vào
**Last updated**: 2026-06-02 19:00:46 +07
**Summary**: feat(web2): hiển thị số dư ví KH khắp nơi + tìm 5-10 số đuôi SĐT + ẩn Tổng tiền vào

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `f3f77419b` feat(web2): hiển thị số dư ví KH khắp nơi + tìm 5-10 số đuôi SĐT + ẩn Tổng tiền vào _(2026-06-02)_
- `e28a6a3c2` feat(native-orders): Pancake upload fallback cho anh — gui anh duoc ca khi khong co extension _(2026-06-02)_
- `6089734e3` feat(native-orders): dong bo gui attachment (anh/audio/video/tep) qua extension — parity tpos-pancake _(2026-06-02)_
- `79f371068` feat(native-orders): gửi tin UI-first — hiện ngay, chạy nền, lỗi thì bật lại text (giữ extension-trước) _(2026-06-02)_
- `6c30ffcb2` fix(native-orders): customer 360 modal — đọc đúng shape từ /api/web2/customer-orders _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-190046-f3f7741` cho Claude walk chain theo CLAUDE.md protocol.
