# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-171455-a67519e`
**Session file**: [`./20260521-171455-a67519e.md`](../20260521-171455-a67519e.md)
**Commit**: `a67519e` — feat(native-orders): bulk-send skip đơn SL=0 (giỏ trống)
**Last updated**: 2026-05-21 17:14:55 +07
**Summary**: feat(native-orders): bulk-send skip đơn SL=0 (giỏ trống)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a67519e1` feat(native-orders): bulk-send skip đơn SL=0 (giỏ trống) _(2026-05-21)_
- `88b353a4` chore(session): RESUME:20260521-170207-bd2afac _(2026-05-21)_
- `bd2afacf` perf(web2-msg-template): parallel multi-worker send theo page _(2026-05-21)_
- `0d419bac` chore(session): RESUME:20260521-165403-b87aa5f _(2026-05-21)_
- `b87aa5f8` docs(dev-log): bulk send tin nhắn template cho native-orders _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-171455-a67519e` cho Claude walk chain theo CLAUDE.md protocol.
