# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-185419-65fd9d7`
**Session file**: [`./20260521-185419-65fd9d7.md`](../20260521-185419-65fd9d7.md)
**Commit**: `65fd9d7` — chore(cache-bust): bump asset version v=20260521b → v=20260521c
**Last updated**: 2026-05-21 18:54:19 +07
**Summary**: chore(cache-bust): bump asset version v=20260521b → v=20260521c

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `65fd9d77` chore(cache-bust): bump asset version v=20260521b → v=20260521c _(2026-05-21)_
- `94483dba` feat(native-orders): bỏ splitPbh ở confirmed, mở splitOrder ra confirmed _(2026-05-21)_
- `b31cc8db` feat(native-orders): đơn cancelled vẫn cho tạo PBH (số HĐ mới) _(2026-05-21)_
- `f0c49d92` fix(native-orders): đơn cancelled vẫn tạo PBH mới (UI + backend guard) _(2026-05-21)_
- `3f1cb9a1` feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-185419-65fd9d7` cho Claude walk chain theo CLAUDE.md protocol.
