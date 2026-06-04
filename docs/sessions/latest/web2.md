# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-121645-8a62794`
**Session file**: [`./20260604-121645-8a62794.md`](../20260604-121645-8a62794.md)
**Commit**: `8a62794` — auto: session update
**Last updated**: 2026-06-04 12:16:45 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio.js`

## Last 5 commits touching `web2/`

- `8a627947c` auto: session update _(2026-06-04)_
- `3e2868402` feat(web2): photo-studio — chèn nền: 8 preset studio + chọn nền trên camera (live) + lưu nền riêng dùng lại _(2026-06-04)_
- `1efd14a23` auto: session update _(2026-06-04)_
- `ef32c6888` auto: session update _(2026-06-04)_
- `6687ad8a9` feat(web2): photo-studio — engine fal.ai BiRefNet (HD, không watermark) cho Cloud HD _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-121645-8a62794` cho Claude walk chain theo CLAUDE.md protocol.
