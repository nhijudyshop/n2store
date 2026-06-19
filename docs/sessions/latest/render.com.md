# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-134410-d49b450`
**Session file**: [`./20260619-134410-d49b450.md`](../20260619-134410-d49b450.md)
**Commit**: `d49b450` — fix(web2/jt-tracking): backfill src_at từ tin Zalo cho row cũ → sort theo giờ tin nhắn nhận chạy được ngay
**Last updated**: 2026-06-19 13:44:10 +07
**Summary**: fix(web2/jt-tracking): backfill src_at từ tin Zalo cho row cũ → sort theo giờ tin nhắn nhận chạy đượ...

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-jt-tracking.js`

## Last 5 commits touching `render.com/`

- `d49b4508f` fix(web2/jt-tracking): backfill src*at từ tin Zalo cho row cũ → sort theo giờ tin nhắn nhận chạy được ngay *(2026-06-19)\_
- `221665adb` fix(web2/jt-tracking + zalo-chat): sort theo giờ Zalo (src*at) + bỏ Chuyển tiếp + fix react z-index + reply quote thật *(2026-06-19)\_
- `05e76118b` fix(upload): bỏ Firebase Storage → Postgres bytea cho up ảnh BILL (inventory-tracking + balance-history) _(2026-06-19)_
- `4aea4b7b0` fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách _(2026-06-18)_
- `625dd0c74` fix(wallets-v2): Rút tiền thủ công (Customer 360) trừ đúng số dư mọi lần _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-134410-d49b450` cho Claude walk chain theo CLAUDE.md protocol.
