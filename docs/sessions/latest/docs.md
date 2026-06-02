# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-154311-2395cac`
**Session file**: [`./20260602-154311-2395cac.md`](../20260602-154311-2395cac.md)
**Commit**: `2395cac` — auto: session update
**Last updated**: 2026-06-02 15:43:11 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `8f9433fd1` feat(issue-tracking): hiện Người bán (UserName PBH) dưới tên khách ở BÁN HÀNG + TRẢ HÀNG _(2026-06-02)_
- `3a0717ac0` chore(session): RESUME:20260602-153754-815ea85 _(2026-06-02)_
- `815ea8553` feat(tpos-pancake): fallback gửi qua N2 Extension bypass-24h khi Pancake API lỗi (giống native-orders) _(2026-06-02)_
- `e714d0ec0` chore(session): RESUME:20260602-153416-3c1bf81 _(2026-06-02)_
- `0210b7669` feat(issue-tracking): resolve người hủy từ TPOS AuditLog cho mọi đơn đã hủy _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-154311-2395cac` cho Claude walk chain theo CLAUDE.md protocol.
