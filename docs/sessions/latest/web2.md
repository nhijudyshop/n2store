# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-165759-f6e3c71`
**Session file**: [`./20260615-165759-f6e3c71.md`](../20260615-165759-f6e3c71.md)
**Commit**: `f6e3c71` — docs(web2): chốt quy ước REALTIME, KHÔNG POLLER (CLAUDE.md + overview #conventions + dev-log)
**Last updated**: 2026-06-15 16:57:59 +07
**Summary**: docs(web2): chốt quy ước REALTIME, KHÔNG POLLER (CLAUDE.md + overview #conventions + dev-log)

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`

## Last 5 commits touching `web2/`

- `f6e3c7171` docs(web2): chốt quy ước REALTIME, KHÔNG POLLER (CLAUDE.md + overview #conventions + dev-log) _(2026-06-15)_
- `3ea2a2e14` fix(web2/multi-tool): picker Bài live fetch trực tiếp Pancake (bỏ poller) + đang/đã livestream _(2026-06-15)_
- `2b485b9a1` fix(web2/jt-tracking): hardening script Console — log NGAY trước promise + try/catch _(2026-06-15)_
- `918b3f163` feat(web2/multi-tool): chọn Bài live (gồm đã xong) auto mới nhất + ẩn spam khỏi live-chat _(2026-06-15)_
- `f48d9a42f` auto: session update _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-165759-f6e3c71` cho Claude walk chain theo CLAUDE.md protocol.
