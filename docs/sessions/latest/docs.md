# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-160901-dbcaf6a`
**Session file**: [`./20260701-160901-dbcaf6a.md`](../20260701-160901-dbcaf6a.md)
**Commit**: `dbcaf6a` — fix(web2-campaign): M2 — trim newCust SQL trên board khớp cart-detail popup
**Last updated**: 2026-07-01 16:09:01 +07
**Summary**: Overhaul chiến dịch: shipped H1/H2/M1/M2/M8/M9/L2/F1/M7 + #1 admin-lock + native-orders 1-picker + foundation; còn Web2CampaignManager/#3/#2 wire 9 trang/H4/M10

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6afe1dfd9` fix(web2-campaign): audit #4/#5 drag→giỏ — F1 kéo SP sai chiến dịch + M7 SSE clobber _(2026-07-01)_
- `527a1d4fd` feat(web2-campaign): #1 khóa CRUD/gán chiến dịch về admin + M1 delete cascade + L2 _(2026-07-01)_
- `f5884aebb` feat(native-orders): gom 2 dropdown chiến dịch → 1 Web2CampaignPicker + fix M8/M9 _(2026-07-01)_
- `1a3b01a7d` chore(session): RESUME:20260701-154512-2395762 _(2026-07-01)_
- `23957624c` feat(web2-campaign): shared Web2CampaignPicker (bộ lọc chiến dịch 1 nguồn) + postsForCampaign _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-160901-dbcaf6a` cho Claude walk chain theo CLAUDE.md protocol.
