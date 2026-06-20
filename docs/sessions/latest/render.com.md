# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-103013-8059794`
**Session file**: [`./20260620-103013-8059794.md`](../20260620-103013-8059794.md)
**Commit**: `8059794` — chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes
**Last updated**: 2026-06-20 10:30:13 +07
**Summary**: chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes

## Files changed in this commit (`render.com/`)

- `render.com/lib/web2-secret-crypto.js`
- `render.com/routes/web2-fb-posts.js`
- `render.com/routes/web2-zalo.js`
- `render.com/services/web2-zalo-oa.js`
- `render.com/services/web2-zalo-zca.js`

## Last 5 commits touching `render.com/`

- `19208170f` feat(web2): ma hoa token/session Zalo+FB at-rest (AES-256-GCM, safe-by-default) _(2026-06-20)_
- `c42670c11` fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file) _(2026-06-20)_
- `b936b1705` fix(web2/fb-caption): gọi khách bằng 'chị' (các chị/mấy chị/chị đẹp), tránh 'các bạn' _(2026-06-19)_
- `d710a31ae` fix(web2/fb-caption): tông thân thiện — shop xưng em/bọn em/shop, cấm 'chúng tôi' (system prompt + lưới an toàn hậu xử lý) _(2026-06-19)_
- `2c73f6a76` feat(web2/fb): chọn NHIỀU SP từ Kho cho AI (caption tổng hợp + tự thêm ảnh) qua shared Web2ProductPicker; sort page Store→House→Ơi→Nè _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-103013-8059794` cho Claude walk chain theo CLAUDE.md protocol.
