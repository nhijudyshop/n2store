# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-165403-b87aa5f`
**Session file**: [`./20260521-165403-b87aa5f.md`](../20260521-165403-b87aa5f.md)
**Commit**: `b87aa5f` — docs(dev-log): bulk send tin nhắn template cho native-orders
**Last updated**: 2026-05-21 16:54:03 +07
**Summary**: docs(dev-log): bulk send tin nhắn template cho native-orders

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `b87aa5f8` docs(dev-log): bulk send tin nhắn template cho native-orders _(2026-05-21)_
- `c5ee01e2` chore(session): RESUME:20260521-163635-e7b5c89 _(2026-05-21)_
- `e7b5c890` fix(native-orders+ext v2.0.4): Pancake API route cho global*id + m.facebook.com permission *(2026-05-21)\_
- `c02ad237` chore(session): RESUME:20260521-162957-497a855 _(2026-05-21)_
- `497a855a` fix(native-orders): 1545012 root cause = gửi PSID thay vì FB global ID _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-165403-b87aa5f` cho Claude walk chain theo CLAUDE.md protocol.
