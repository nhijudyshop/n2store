# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-082415-845fe36`
**Session file**: [`./20260616-082415-845fe36.md`](../20260616-082415-845fe36.md)
**Commit**: `845fe36` — fix(web2): icon columns-3→columns (Lucide 0.294.0) + revert WS proxy về broker n2store-realtime
**Last updated**: 2026-06-16 08:24:15 +07
**Summary**: fix(web2): icon columns-3→columns (Lucide 0.294.0) + revert WS proxy về broker n2store-realtime

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `845fe3649` fix(web2): icon columns-3→columns (Lucide 0.294.0) + revert WS proxy về broker n2store-realtime _(2026-06-16)_
- `78aad3a51` chore(session): RESUME:20260616-003508-274721b _(2026-06-16)_
- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `11fab9bb1` chore(session): RESUME:20260616-001902-5b414ed _(2026-06-16)_
- `5b414edc1` perf(web2-api): tesseract lazy-load + autofb không mount khi WEB2*ONLY (giảm RAM nền) *(2026-06-16)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-082415-845fe36` cho Claude walk chain theo CLAUDE.md protocol.
