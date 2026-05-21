# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-184415-2afef5f`
**Session file**: [`./20260521-184415-2afef5f.md`](../20260521-184415-2afef5f.md)
**Commit**: `2afef5f` — feat(web2): SSE realtime cho products + PBH page (không cần F5)
**Last updated**: 2026-05-21 18:44:15 +07
**Summary**: feat(web2): SSE realtime cho products + PBH page (không cần F5)

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-app.js`
- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `2afef5fd` feat(web2): SSE realtime cho products + PBH page (không cần F5) _(2026-05-21)_
- `02ef6878` feat(fast-sale-orders): simplify 2-state model (Hoàn thành + Đã hủy) _(2026-05-21)_
- `3f1cb9a1` feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP _(2026-05-21)_
- `bd2afacf` perf(web2-msg-template): parallel multi-worker send theo page _(2026-05-21)_
- `d3e665d1` feat(native-orders): bulk send tin nhắn template như orders-report _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-184415-2afef5f` cho Claude walk chain theo CLAUDE.md protocol.
