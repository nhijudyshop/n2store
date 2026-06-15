# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-142600-e03aba2`
**Session file**: [`./20260615-142600-e03aba2.md`](../20260615-142600-e03aba2.md)
**Commit**: `e03aba2` — feat(web2-zalo): allowlist 2 nhóm XỬ LÝ NJD + wipe + retention 7 ngày
**Last updated**: 2026-06-15 14:26:00 +07
**Summary**: feat(web2-zalo): allowlist 2 nhóm XỬ LÝ NJD + wipe + retention 7 ngày

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `e03aba2c0` feat(web2-zalo): allowlist 2 nhóm XỬ LÝ NJD + wipe + retention 7 ngày _(2026-06-15)_
- `bde146298` fix(web2/jt-tracking): classifier khớp từ vựng J&T thật (audit 121 sự kiện) _(2026-06-15)_
- `6b0421a1e` chore(session): RESUME:20260615-140912-29a14db _(2026-06-15)_
- `29a14dbb7` refactor(live-chat): bỏ HẾT hiệu ứng comment mới (fade/trượt) — hiện tức thì, cả 2 trang _(2026-06-15)_
- `31fcb2442` fix(web2/jt-tracking): 'chuyển hoàn' = status returned (Đã hoàn), không phải đã giao _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-142600-e03aba2` cho Claude walk chain theo CLAUDE.md protocol.
