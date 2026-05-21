# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-163635-e7b5c89`
**Session file**: [`./20260521-163635-e7b5c89.md`](../20260521-163635-e7b5c89.md)
**Commit**: `e7b5c89` — fix(native-orders+ext v2.0.4): Pancake API route cho global_id + m.facebook.com permission
**Last updated**: 2026-05-21 16:36:35 +07
**Summary**: fix(native-orders+ext v2.0.4): Pancake API route cho global_id + m.facebook.com permission

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `e7b5c890` fix(native-orders+ext v2.0.4): Pancake API route cho global*id + m.facebook.com permission *(2026-05-21)\_
- `c02ad237` chore(session): RESUME:20260521-162957-497a855 _(2026-05-21)_
- `497a855a` fix(native-orders): 1545012 root cause = gửi PSID thay vì FB global ID _(2026-05-21)_
- `20671910` chore(session): RESUME:20260521-162621-8e901b5 _(2026-05-21)_
- `ba7bcb76` fix(inventory): 7 bug + race con audit image-manager pipeline _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-163635-e7b5c89` cho Claude walk chain theo CLAUDE.md protocol.
