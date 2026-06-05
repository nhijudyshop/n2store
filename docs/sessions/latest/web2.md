# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-115107-91e84e9`
**Session file**: [`./20260605-115107-91e84e9.md`](../20260605-115107-91e84e9.md)
**Commit**: `91e84e9` — auto: session update
**Last updated**: 2026-06-05 11:51:07 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print.js`
- `web2/shared/web2-msg-template.js`

## Last 5 commits touching `web2/`

- `91e84e986` auto: session update _(2026-06-05)_
- `e48a7e7cf` fix(web2-msg-send): mount /api/web2/msg-send (CF worker forward /api/web2/\*) thay /api/web2-msg-send (chua trong allowlist -> roi ve TPOS 404) _(2026-06-05)_
- `a6f0e3e7d` feat(native-orders): gửi tin nhắn template qua JOB server-side đa-account Pancake + extension fallback (refresh-safe, SSE progress) _(2026-06-05)_
- `1a6c8a4dc` auto: session update _(2026-06-05)_
- `710e088e2` fix(web2 products): tem ma SP canh giua doc (justify center) thay space-between - khoi noi dung to nhung khong sat mep tem _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-115107-91e84e9` cho Claude walk chain theo CLAUDE.md protocol.
