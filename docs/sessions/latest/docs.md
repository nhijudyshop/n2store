# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-174155-05afe83`
**Session file**: [`./20260623-174155-05afe83.md`](../20260623-174155-05afe83.md)
**Commit**: `05afe83` — auto: session update
**Last updated**: 2026-06-23 17:41:55 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `dd787a8f1` feat(web2-attendance-sync): tự chạy nền khi bật Windows (auto-start + auto-restart) _(2026-06-23)_
- `afd901019` chore(session): RESUME:20260623-173240-618cafd _(2026-06-23)_
- `618cafd00` docs(dev-log): Zalo P4 reconnect 500→400 + Popup + icon fix _(2026-06-23)_
- `db9d6633b` chore(session): RESUME:20260623-173018-6c78edc _(2026-06-23)_
- `d2dd0186f` chore(session): RESUME:20260623-172754-e84de26 _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-174155-05afe83` cho Claude walk chain theo CLAUDE.md protocol.
