# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-151837-5c77fce`
**Session file**: [`./20260607-151837-5c77fce.md`](../20260607-151837-5c77fce.md)
**Commit**: `5c77fce` — feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2_customers); test OK
**Last updated**: 2026-06-07 15:18:37 +07
**Summary**: feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2_c...

## Files changed in this commit (`web2/`)

- `web2/shared/chat-panel/web2-chat-entity-detect.js`

## Last 5 commits touching `web2/`

- `5c77fce83` feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2*customers); test OK *(2026-06-07)\_
- `d9ae5666d` auto: session update _(2026-06-07)_
- `55e73dcd4` auto: session update _(2026-06-07)_
- `89826ae43` feat(web2/chat): Feature 1 — paste ảnh ctrl+v vào Web2ChatPanel (native-orders + tpos-pancake); test OK _(2026-06-07)_
- `231f0c140` refactor(native-orders): chat dùng Web2ChatPanel hợp nhất (mount hideHeader + adapter; WS/send/quick port); test mock OK _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-151837-5c77fce` cho Claude walk chain theo CLAUDE.md protocol.
