# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-110838-5ffd478`
**Session file**: [`./20260615-110838-5ffd478.md`](../20260615-110838-5ffd478.md)
**Commit**: `5ffd478` — feat(web2-jt): auto-ingest mã J&T từ tin nhắn nhóm Zalo realtime + fix sidebar mount
**Last updated**: 2026-06-15 11:08:38 +07
**Summary**: feat(web2-jt): auto-ingest mã J&T từ tin nhắn nhóm Zalo realtime + fix sidebar mount

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `5ffd47856` feat(web2-jt): auto-ingest mã J&T từ tin nhắn nhóm Zalo realtime + fix sidebar mount _(2026-06-15)_
- `603a57073` fix(live-chat): comment livestream về 2 trang Live — relay join per-page pages:{id} + UI chọn trang _(2026-06-15)_
- `688d6319c` feat(web2): trang Tra cứu vận đơn J&T (Báo cáo) — route + frontend + lottie _(2026-06-15)_
- `41509cd8d` auto: session update _(2026-06-15)_
- `81adccb7e` refactor(web2): gỡ TPOS perm registry + 3 N+1 batch endpoint (đợt 2) _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-110838-5ffd478` cho Claude walk chain theo CLAUDE.md protocol.
