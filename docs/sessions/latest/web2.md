# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-184537-97ae89a`
**Session file**: [`./20260615-184537-97ae89a.md`](../20260615-184537-97ae89a.md)
**Commit**: `97ae89a` — feat(web2-jt): 'Dán lịch sử' nạp dòng dán vào kho tin chat
**Last updated**: 2026-06-15 18:45:37 +07
**Summary**: feat(web2-jt): 'Dán lịch sử' nạp dòng dán vào kho tin chat

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `97ae89a58` feat(web2-jt): 'Dán lịch sử' nạp dòng dán vào kho tin chat _(2026-06-15)_
- `6cc274995` auto: session update _(2026-06-15)_
- `fda649a55` feat(web2-zalo): 'Tải tin cũ hơn' backfill lịch sử nhóm từ Zalo về DB _(2026-06-15)_
- `667ad2684` fix(web2/multi-tool): giãn nhịp tối thiểu 0.5s (min input + clamp run/hint) _(2026-06-15)_
- `6c84cead9` fix(web2/multi-tool): ô Giãn nhịp đổi sang GIÂY (thập phân) — 0.5/0.1s có tác dụng thật _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-184537-97ae89a` cho Claude walk chain theo CLAUDE.md protocol.
