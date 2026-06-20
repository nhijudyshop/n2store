# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-145341-b93a2f2`
**Session file**: [`./20260620-145341-b93a2f2.md`](../20260620-145341-b93a2f2.md)
**Commit**: `b93a2f2` — feat(web2/chat-modal): cot trai hien TAT CA hoi thoai + pill ten page moi dong
**Last updated**: 2026-06-20 14:53:41 +07
**Summary**: web2 chat-modal: cot trai hien tat ca hoi thoai + pill ten page

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/shared/web2-customer-chat-core.js`
- `web2/shared/web2-customer-chat-modal.js`

## Last 5 commits touching `web2/`

- `b93a2f2cb` feat(web2/chat-modal): cot trai hien TAT CA hoi thoai + pill ten page moi dong _(2026-06-20)_
- `8a33f8210` feat(web2/zalo): them account bang phien chat.zalo.me (cookie) - khong can QR; them My Njd live OK _(2026-06-20)_
- `43c92f7fc` feat(web2/jt-tracking): chat KH bam SDT -> modal 3-cot 'Chat khach hang' giong native-orders _(2026-06-20)_
- `6104e5699` fix(web2): dong not 16 muc audit con lai (MEDIUM/LOW) — money/msg-guard/frontend; toan bo 121 issue da fix _(2026-06-20)_
- `65d6ba9b4` fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-145341-b93a2f2` cho Claude walk chain theo CLAUDE.md protocol.
