# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-003508-274721b`
**Session file**: [`./20260616-003508-274721b.md`](../20260616-003508-274721b.md)
**Commit**: `274721b` — chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa)
**Last updated**: 2026-06-16 00:35:08 +07
**Summary**: chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `11fab9bb1` chore(session): RESUME:20260616-001902-5b414ed _(2026-06-16)_
- `5b414edc1` perf(web2-api): tesseract lazy-load + autofb không mount khi WEB2*ONLY (giảm RAM nền) *(2026-06-16)\_
- `2c3970f5f` chore(session): RESUME:20260616-001109-c5a3a62 _(2026-06-16)_
- `c5a3a6202` docs(dev-log): web2-api OOM resolved — plan standard 2GB + NODE*OPTIONS heap cap 1536 *(2026-06-16)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-003508-274721b` cho Claude walk chain theo CLAUDE.md protocol.
