# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-134924-29141d8`
**Session file**: [`./20260613-134924-29141d8.md`](../20260613-134924-29141d8.md)
**Commit**: `29141d8` — fix(web2-customers): lookup KH theo SĐT phụ (alt_phones) — TC-cụm ĐÓNG
**Last updated**: 2026-06-13 13:49:24 +07
**Summary**: fix(web2-customers): lookup KH theo SĐT phụ (alt_phones) — TC-cụm ĐÓNG

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `29141d8e0` fix(web2-customers): lookup KH theo SĐT phụ (alt*phones) — TC-cụm ĐÓNG *(2026-06-13)\_
- `4c07d17f1` docs(web2): đợt LOW — wallet emit post-commit + 3W6 sidebar + SSE resync (flip ⬜→✅) _(2026-06-13)_
- `12ad549cd` auto: session update _(2026-06-13)_
- `d5b84c1fd` fix(web2-sse): reload-on-reconnect — re-fetch sau khi SSE nối lại _(2026-06-13)_
- `ff410b14f` docs(web2): MEDIUM-cleanup đợt 2 — flip ⬜→✅ audit (TM/TC/SP/HT/LC/BC) + xoá ref page-shell.js _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-134924-29141d8` cho Claude walk chain theo CLAUDE.md protocol.
