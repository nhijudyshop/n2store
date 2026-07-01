# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-162636-2060341`
**Session file**: [`./20260701-162636-2060341.md`](../20260701-162636-2060341.md)
**Commit**: `2060341` — docs(web2-campaign): thiết kế #2 cross-page cart merge (hybrid global-id + SĐT)
**Last updated**: 2026-07-01 16:26:36 +07
**Summary**: Overhaul chiến dịch cont: #2 cross-page thiết kế hybrid (doc) + điều tra định danh; #3 deep-audit đang chạy; còn #1 page-UI + #2 impl + Web2CampaignManager + wire trang + H4

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/CAMPAIGN-CROSSPAGE-DESIGN.md`

## Last 5 commits touching `docs/`

- `206034124` docs(web2-campaign): thiết kế #2 cross-page cart merge (hybrid global-id + SĐT) _(2026-07-01)_
- `2acb803d7` chore(session): RESUME:20260701-160901-dbcaf6a _(2026-07-01)_
- `6afe1dfd9` fix(web2-campaign): audit #4/#5 drag→giỏ — F1 kéo SP sai chiến dịch + M7 SSE clobber _(2026-07-01)_
- `527a1d4fd` feat(web2-campaign): #1 khóa CRUD/gán chiến dịch về admin + M1 delete cascade + L2 _(2026-07-01)_
- `f5884aebb` feat(native-orders): gom 2 dropdown chiến dịch → 1 Web2CampaignPicker + fix M8/M9 _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-162636-2060341` cho Claude walk chain theo CLAUDE.md protocol.
