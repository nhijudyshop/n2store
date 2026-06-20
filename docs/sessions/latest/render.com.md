# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-100906-c42670c`
**Session file**: [`./20260620-100906-c42670c.md`](../20260620-100906-c42670c.md)
**Commit**: `c42670c` — fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file)
**Last updated**: 2026-06-20 10:09:06 +07
**Summary**: fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file)

## Files changed in this commit (`render.com/`)

- `render.com/routes/admin-web2-data-reset.js`
- `render.com/routes/admin-web2-import-customers.js`
- `render.com/routes/admin-web2-import-fb-links.js`
- `render.com/routes/admin-web2-import-pancake-customers.js`
- `render.com/routes/admin-web2-wallet-reset.js`
- `render.com/routes/purchase-refund.js`
- `render.com/routes/web2-ai-script.js`
- `render.com/routes/web2-fb-posts.js`
- `render.com/routes/web2-jt-tracking.js`
- `render.com/routes/web2-live-comments.js`
- `render.com/routes/web2-msg-send.js`
- `render.com/routes/web2-products.js`
- `render.com/routes/web2-returns.js`
- `render.com/routes/web2-supplier-wallet.js`
- `render.com/routes/web2-users.js`
- `render.com/routes/web2-variants.js`
- `render.com/routes/web2-zalo.js`

## Last 5 commits touching `render.com/`

- `c42670c11` fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file) _(2026-06-20)_
- `b936b1705` fix(web2/fb-caption): gọi khách bằng 'chị' (các chị/mấy chị/chị đẹp), tránh 'các bạn' _(2026-06-19)_
- `d710a31ae` fix(web2/fb-caption): tông thân thiện — shop xưng em/bọn em/shop, cấm 'chúng tôi' (system prompt + lưới an toàn hậu xử lý) _(2026-06-19)_
- `2c73f6a76` feat(web2/fb): chọn NHIỀU SP từ Kho cho AI (caption tổng hợp + tự thêm ảnh) qua shared Web2ProductPicker; sort page Store→House→Ơi→Nè _(2026-06-19)_
- `d70b709d6` feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-100906-c42670c` cho Claude walk chain theo CLAUDE.md protocol.
