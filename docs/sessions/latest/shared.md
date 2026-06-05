# Latest Snapshot — `shared/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-151348-d59cf73`
**Session file**: [`./20260605-151348-d59cf73.md`](../20260605-151348-d59cf73.md)
**Commit**: `d59cf73` — fix(cloudflare CORS): allow header X-Web2-Token - sau khi dang nhap Web2.0 client gui x-web2-token bi CORS preflight chan -> moi API web2 fail. Them 1 header, khong dung logic trang khac
**Last updated**: 2026-06-05 15:13:48 +07
**Summary**: fix(cloudflare CORS): allow header X-Web2-Token - sau khi dang nhap Web2.0 client gui x-web2-token bi CORS preflight ...

## Files changed in this commit (`shared/`)

- `shared/universal/cors-headers.js`

## Last 5 commits touching `shared/`

- `d59cf73ba` fix(cloudflare CORS): allow header X-Web2-Token - sau khi dang nhap Web2.0 client gui x-web2-token bi CORS preflight chan -> moi API web2 fail. Them 1 header, khong dung logic trang khac _(2026-06-05)_
- `5a3f23507` fix(soluong-live): imageVersion cache-bust theo nội dung ảnh (URL proxy hằng số) _(2026-06-04)_
- `7bab6d9ec` fix(issue-tracking): refund PUT consistency - zero giảm giá order-level khi bake giá vào PriceUnit _(2026-06-01)_
- `397da92e5` feat(virtual-credit): hạn cấp công nợ ảo 15 → 30 ngày (chỉ phiếu mới) + finalize refund per-line discount _(2026-06-01)_
- `b2e8d4c20` chore(web2): xóa trang sale-online-facebook + dừng cron sync 15min _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-151348-d59cf73` cho Claude walk chain theo CLAUDE.md protocol.
