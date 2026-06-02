# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-154653-b04db9b`
**Session file**: [`./20260602-154653-b04db9b.md`](../20260602-154653-b04db9b.md)
**Commit**: `b04db9b` — fix(web2-wallet): lá chắn unique chống cộng-trùng tiền bank (race webhook/cron/reload)
**Last updated**: 2026-06-02 15:46:53 +07
**Summary**: fix(web2-wallet): lá chắn unique chống cộng-trùng tiền bank (race webhook/cron/reload)

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `373ffc716` fix(native-orders): cột STT show campaignStt (1..n per campaign) thay vì displayStt (global seq) _(2026-06-02)_
- `2395cacb3` auto: session update _(2026-06-02)_
- `f5a7c3139` feat(native-orders): bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT _(2026-06-02)_
- `526848e33` fix(tpos-customer-service): chuyển searchCustomerByFbUserId sang chatomni/info endpoint _(2026-06-01)_
- `b1b5d7c15` feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-154653-b04db9b` cho Claude walk chain theo CLAUDE.md protocol.
