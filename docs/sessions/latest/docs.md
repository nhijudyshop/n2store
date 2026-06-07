# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-151837-5c77fce`
**Session file**: [`./20260607-151837-5c77fce.md`](../20260607-151837-5c77fce.md)
**Commit**: `5c77fce` — feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2_customers); test OK
**Last updated**: 2026-06-07 15:18:37 +07
**Summary**: feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2_c...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `5c77fce83` feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2*customers); test OK *(2026-06-07)\_
- `eda42761c` chore(session): RESUME:20260607-151603-d9ae566 _(2026-06-07)_
- `f1164ec5c` docs(dev-log): tắt web2-sync-worker + xóa toàn bộ TPOS shadow (DB 255→80MB), giữ deliveryzone/printer config _(2026-06-07)_
- `962d928ea` chore(session): RESUME:20260607-151114-55e73dc _(2026-06-07)_
- `89826ae43` feat(web2/chat): Feature 1 — paste ảnh ctrl+v vào Web2ChatPanel (native-orders + tpos-pancake); test OK _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-151837-5c77fce` cho Claude walk chain theo CLAUDE.md protocol.
