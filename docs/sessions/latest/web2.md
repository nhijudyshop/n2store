# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-163339-eea4776`
**Session file**: [`./20260620-163339-eea4776.md`](../20260620-163339-eea4776.md)
**Commit**: `eea4776` — feat(web2/zalo): chip nhom bao 'Can dang nhap TK trong nhom' khi khong gui duoc (TK nhom xoa/chua ket noi)
**Last updated**: 2026-06-20 16:33:39 +07
**Summary**: feat(web2/zalo): chip nhom bao 'Can dang nhap TK trong nhom' khi khong gui duoc (TK nhom xoa/chua ket noi)

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/shared/web2-zalo.js`
- `web2/shared/zalo-chat/chat-view.js`

## Last 5 commits touching `web2/`

- `eea4776d5` feat(web2/zalo): chip nhom bao 'Can dang nhap TK trong nhom' khi khong gui duoc (TK nhom xoa/chua ket noi) _(2026-06-20)_
- `2546b67f8` auto: session update _(2026-06-20)_
- `f59ae9d5e` fix(web2/multi-tool): loc hoi thoai dung post*id bai dang chon + bo dead code worker *(2026-06-20)\_
- `df34bdd1b` feat(web2/zalo): nen tang uu tien TK cookie de gui tin - Phase1 extension uid + Phase2 getCookieAccountKey (inert, chua wire) _(2026-06-20)_
- `bedcfb08a` feat(web2/multi-tool): tang comment chay nen tren server + re-check toi >= target (route+worker+UI) _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-163339-eea4776` cho Claude walk chain theo CLAUDE.md protocol.
