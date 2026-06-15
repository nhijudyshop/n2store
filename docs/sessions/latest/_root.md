# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-165759-f6e3c71`
**Session file**: [`./20260615-165759-f6e3c71.md`](../20260615-165759-f6e3c71.md)
**Commit**: `f6e3c71` — docs(web2): chốt quy ước REALTIME, KHÔNG POLLER (CLAUDE.md + overview #conventions + dev-log)
**Last updated**: 2026-06-15 16:57:59 +07
**Summary**: docs(web2): chốt quy ước REALTIME, KHÔNG POLLER (CLAUDE.md + overview #conventions + dev-log)

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `f6e3c7171` docs(web2): chốt quy ước REALTIME, KHÔNG POLLER (CLAUDE.md + overview #conventions + dev-log) _(2026-06-15)_
- `ef24e8646` docs(claude): browser test FIFO/cổng động — tránh tranh chấp đa phiên _(2026-06-14)_
- `65d32a8bb` fix(web2-zalo): heal tên hội thoại NHÓM bị lấy theo người nhắn cuối _(2026-06-14)_
- `797c2c301` auto: session update _(2026-06-14)_
- `43ba24d53` feat(web2): gộp services-dashboard + admin-sse-monitor → trang Cấu hình & Hệ thống _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-165759-f6e3c71` cho Claude walk chain theo CLAUDE.md protocol.
