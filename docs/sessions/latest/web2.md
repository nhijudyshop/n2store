# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-152203-7648b85`
**Session file**: [`./20260620-152203-7648b85.md`](../20260620-152203-7648b85.md)
**Commit**: `7648b85` — auto: session update
**Last updated**: 2026-06-20 15:22:03 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/shared/web2-zalo.js`
- `web2/shared/zalo-chat/chat-view.js`

## Last 5 commits touching `web2/`

- `cbbcf0141` feat(web2/zalo): chip hien thi TK Zalo dang dung de nhan (tag TK chinh / canh bao TK phu) - dung chung engine chat _(2026-06-20)_
- `b93a2f2cb` feat(web2/chat-modal): cot trai hien TAT CA hoi thoai + pill ten page moi dong _(2026-06-20)_
- `8a33f8210` feat(web2/zalo): them account bang phien chat.zalo.me (cookie) - khong can QR; them My Njd live OK _(2026-06-20)_
- `43c92f7fc` feat(web2/jt-tracking): chat KH bam SDT -> modal 3-cot 'Chat khach hang' giong native-orders _(2026-06-20)_
- `6104e5699` fix(web2): dong not 16 muc audit con lai (MEDIUM/LOW) — money/msg-guard/frontend; toan bo 121 issue da fix _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-152203-7648b85` cho Claude walk chain theo CLAUDE.md protocol.
