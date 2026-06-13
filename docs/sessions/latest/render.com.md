# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-134924-29141d8`
**Session file**: [`./20260613-134924-29141d8.md`](../20260613-134924-29141d8.md)
**Commit**: `29141d8` — fix(web2-customers): lookup KH theo SĐT phụ (alt_phones) — TC-cụm ĐÓNG
**Last updated**: 2026-06-13 13:49:24 +07
**Summary**: fix(web2-customers): lookup KH theo SĐT phụ (alt_phones) — TC-cụm ĐÓNG

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-customers-schema.js`
- `render.com/routes/v2/web2-customers.js`

## Last 5 commits touching `render.com/`

- `29141d8e0` fix(web2-customers): lookup KH theo SĐT phụ (alt*phones) — TC-cụm ĐÓNG *(2026-06-13)\_
- `d5b84c1fd` fix(web2-sse): reload-on-reconnect — re-fetch sau khi SSE nối lại _(2026-06-13)_
- `40f62805f` auto: session update _(2026-06-13)_
- `21da4b762` auto: session update _(2026-06-13)_
- `0661129d1` fix(web2): MEDIUM-cleanup batch 2 — from-comment race, DELETE native guard, relay client*type, /summary range, batchStatus leak, in-tem double-pending, auto-snap hidden filter *(2026-06-13)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-134924-29141d8` cho Claude walk chain theo CLAUDE.md protocol.
