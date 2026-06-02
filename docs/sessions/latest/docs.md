# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-143625-f5a7c31`
**Session file**: [`./20260602-143625-f5a7c31.md`](../20260602-143625-f5a7c31.md)
**Commit**: `f5a7c31` — feat(native-orders): bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT
**Last updated**: 2026-06-02 14:36:25 +07
**Summary**: feat(native-orders): bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `f5a7c3139` feat(native-orders): bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT _(2026-06-02)_
- `86a61a1d2` chore(session): RESUME:20260601-191704-526848e _(2026-06-01)_
- `5d4b73407` chore(session): RESUME:20260601-190455-470a0ad _(2026-06-01)_
- `2f9123df0` chore(session): RESUME:20260601-185926-b1b5d7c _(2026-06-01)_
- `b1b5d7c15` feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-143625-f5a7c31` cho Claude walk chain theo CLAUDE.md protocol.
