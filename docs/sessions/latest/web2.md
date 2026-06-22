# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-181557-a9b4a5b`
**Session file**: [`./20260622-181557-a9b4a5b.md`](../20260622-181557-a9b4a5b.md)
**Commit**: `a9b4a5b` — fix(native-orders) tag-add jank: in-place .col-tag update + smooth pop-in for new pills only (compositor-only, no avatar reload, no re-pop)
**Last updated**: 2026-06-22 18:15:57 +07
**Summary**: fix(native-orders) tag-add jank: in-place .col-tag update + smooth pop-in for new pills only (compositor-only, no ava...

## Files changed in this commit (`web2/`)

- `web2/order-tags/index.html`
- `web2/products/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-effects.css`
- `web2/shared/web2-order-tag-pill.js`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `a9b4a5b13` fix(native-orders) tag-add jank: in-place .col-tag update + smooth pop-in for new pills only (compositor-only, no avatar reload, no re-pop) _(2026-06-22)_
- `47e48e553` fix(web2-video-maker): default voice = Adam 3 + auto-select khi thêm giọng + bỏ pitch giọng server (giọng tạo ra không giống) _(2026-06-22)_
- `4f42d371a` feat(web2-zalo): Phase 4 đợt 1 — group system messages (join/leave/rename/pin) _(2026-06-22)_
- `0b1ff4117` auto: session update _(2026-06-22)_
- `b932b7690` feat(web2-zalo): Phase 3 đợt 2 — inline video player + contact card + location card render _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-181557-a9b4a5b` cho Claude walk chain theo CLAUDE.md protocol.
