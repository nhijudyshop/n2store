# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-144341-528b07a`
**Session file**: [`./20260605-144341-528b07a.md`](../20260605-144341-528b07a.md)
**Commit**: `528b07a` — feat(web2): unread DB riêng Web 2.0 + harden Pancake WS 24/7
**Last updated**: 2026-06-05 14:43:41 +07
**Summary**: feat(web2): unread DB riêng Web 2.0 + harden Pancake WS 24/7

## Files changed in this commit (`scripts/`)

- `scripts/test-web2-unread.js`

## Last 5 commits touching `scripts/`

- `528b07a1c` feat(web2): unread DB riêng Web 2.0 + harden Pancake WS 24/7 _(2026-06-05)_
- `35731e4ad` feat(web2): detect 'CK XONG'/'ĐÃ CK' từ inbox Pancake 24/7 → trang Xác nhận CK _(2026-06-05)_
- `0a9bb7bb3` feat(print-bridge): ban PowerShell (khong can Node) cho Windows _(2026-06-04)_
- `f9236f04e` fix(print-bridge): them header Access-Control-Allow-Private-Network (fix 'bridge chua chay' tren trang HTTPS goi localhost - Chrome PNA) _(2026-06-04)_
- `cc865c318` feat(web2): quan ly may in + in thang IP:port (print-bridge ESC/POS raster) + gan may theo chuc nang _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-144341-528b07a` cho Claude walk chain theo CLAUDE.md protocol.
