# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-172838-3f1cb9a`
**Session file**: [`./20260521-172838-3f1cb9a.md`](../20260521-172838-3f1cb9a.md)
**Commit**: `3f1cb9a` — feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP
**Last updated**: 2026-05-21 17:28:38 +07
**Summary**: feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `3f1cb9a1` feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP _(2026-05-21)_
- `b48fe690` fix(native-orders): cancelOrder dùng WORKER*URL trực tiếp (NativeOrdersApi.\_getBaseUrl không tồn tại) *(2026-05-21)\_
- `a67519e1` feat(native-orders): bulk-send skip đơn SL=0 (giỏ trống) _(2026-05-21)_
- `d3e665d1` feat(native-orders): bulk send tin nhắn template như orders-report _(2026-05-21)_
- `e7b5c890` fix(native-orders+ext v2.0.4): Pancake API route cho global*id + m.facebook.com permission *(2026-05-21)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-172838-3f1cb9a` cho Claude walk chain theo CLAUDE.md protocol.
