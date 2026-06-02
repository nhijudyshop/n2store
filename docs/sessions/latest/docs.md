# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-154653-b04db9b`
**Session file**: [`./20260602-154653-b04db9b.md`](../20260602-154653-b04db9b.md)
**Commit**: `b04db9b` — fix(web2-wallet): lá chắn unique chống cộng-trùng tiền bank (race webhook/cron/reload)
**Last updated**: 2026-06-02 15:46:53 +07
**Summary**: fix(web2-wallet): lá chắn unique chống cộng-trùng tiền bank (race webhook/cron/reload)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `b04db9b4f` fix(web2-wallet): lá chắn unique chống cộng-trùng tiền bank (race webhook/cron/reload) _(2026-06-02)_
- `88fd29c63` chore(session): RESUME:20260602-154311-2395cac _(2026-06-02)_
- `8f9433fd1` feat(issue-tracking): hiện Người bán (UserName PBH) dưới tên khách ở BÁN HÀNG + TRẢ HÀNG _(2026-06-02)_
- `3a0717ac0` chore(session): RESUME:20260602-153754-815ea85 _(2026-06-02)_
- `815ea8553` feat(tpos-pancake): fallback gửi qua N2 Extension bypass-24h khi Pancake API lỗi (giống native-orders) _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-154653-b04db9b` cho Claude walk chain theo CLAUDE.md protocol.
