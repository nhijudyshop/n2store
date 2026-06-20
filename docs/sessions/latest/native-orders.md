# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-195827-8bc94ed`
**Session file**: [`./20260620-195827-8bc94ed.md`](../20260620-195827-8bc94ed.md)
**Commit**: `8bc94ed` — feat(live-chat): picker livestream chọn chiến dịch cha HOẶC bài live (multi-select); fix(native-orders): 401 chiến dịch cha thiếu x-web2-token
**Last updated**: 2026-06-20 19:58:27 +07
**Summary**: live-chat picker chiến dịch cha/bài live + fix native-orders 401

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-filters-campaigns.js`

## Last 5 commits touching `native-orders/`

- `8bc94ed16` feat(live-chat): picker livestream chọn chiến dịch cha HOẶC bài live (multi-select); fix(native-orders): 401 chiến dịch cha thiếu x-web2-token _(2026-06-20)_
- `3e3021e45` feat(native-orders): Đơn Inbox 'Gán FB khác' — gán lại Facebook đúng nếu auto-dò nhầm _(2026-06-20)_
- `b16d82b83` auto: session update _(2026-06-20)_
- `3f8e516a5` auto: session update _(2026-06-20)_
- `eea4776d5` feat(web2/zalo): chip nhom bao 'Can dang nhap TK trong nhom' khi khong gui duoc (TK nhom xoa/chua ket noi) _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-195827-8bc94ed` cho Claude walk chain theo CLAUDE.md protocol.
