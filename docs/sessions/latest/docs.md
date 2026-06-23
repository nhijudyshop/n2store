# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-174406-963e7f1`
**Session file**: [`./20260623-174406-963e7f1.md`](../20260623-174406-963e7f1.md)
**Commit**: `963e7f1` — docs(dev-log): web2-ai 9 verified bugs (SSE abort/upstream cancel, overload key-rotate, gemini-image rotate, vision-guard 422, image-tab recovery, editImage warn, stop-before-token, save quota, rate-limit TTL sweep)
**Last updated**: 2026-06-23 17:44:06 +07
**Summary**: web2-ai 9 verified bugs fixed (SSE abort, overload rotate, gemini-image rotate, vision-guard, UX)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `963e7f13e` docs(dev-log): web2-ai 9 verified bugs (SSE abort/upstream cancel, overload key-rotate, gemini-image rotate, vision-guard 422, image-tab recovery, editImage warn, stop-before-token, save quota, rate-limit TTL sweep) _(2026-06-23)_
- `f548eff7d` chore(session): RESUME:20260623-174155-05afe83 _(2026-06-23)_
- `dd787a8f1` feat(web2-attendance-sync): tự chạy nền khi bật Windows (auto-start + auto-restart) _(2026-06-23)_
- `afd901019` chore(session): RESUME:20260623-173240-618cafd _(2026-06-23)_
- `618cafd00` docs(dev-log): Zalo P4 reconnect 500→400 + Popup + icon fix _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-174406-963e7f1` cho Claude walk chain theo CLAUDE.md protocol.
