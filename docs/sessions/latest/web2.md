# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-091420-fd83d24`
**Session file**: [`./20260627-091420-fd83d24.md`](../20260627-091420-fd83d24.md)
**Commit**: `fd83d24` — fix(web2/overview): sửa 404 toàn bộ link card/tĩnh (thiếu resolveOur) + login → native-orders
**Last updated**: 2026-06-27 09:14:20 +07
**Summary**: fix(web2/overview): sửa 404 toàn bộ link card/tĩnh (thiếu resolveOur) + login → native-orders

## Files changed in this commit (`web2/`)

- `web2/login/index.html`
- `web2/overview/index.html`
- `web2/overview/overview.js`

## Last 5 commits touching `web2/`

- `fd83d2453` fix(web2/overview): sửa 404 toàn bộ link card/tĩnh (thiếu resolveOur) + login → native-orders _(2026-06-27)_
- `a71968341` feat(web2/login): redirect sau đăng nhập theo role — admin → system?tab=services, nhân viên → overview _(2026-06-27)_
- `ce9f30b26` feat(web2/overview): trang giới thiệu Framer-style showcase toàn bộ Web 2.0 + login → overview _(2026-06-27)_
- `60d5b5470` auto: session update _(2026-06-27)_
- `a046ca872` auto: session update _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-091420-fd83d24` cho Claude walk chain theo CLAUDE.md protocol.
