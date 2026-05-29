# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-121633-e617e3a`
**Session file**: [`./20260529-121633-e617e3a.md`](../20260529-121633-e617e3a.md)
**Commit**: `e617e3a` — feat(inventory-tracking): SSE realtime auto-refresh + grant bobo CP perms
**Last updated**: 2026-05-29 12:16:33 +07
**Summary**: feat(inventory-tracking): SSE realtime auto-refresh + grant bobo CP perms

## Files changed in this commit (`scripts/`)

- `scripts/grant-bobo-cp-perms.js`

## Last 5 commits touching `scripts/`

- `e617e3a53` feat(inventory-tracking): SSE realtime auto-refresh + grant bobo CP perms _(2026-05-29)_
- `eef32e0fb` feat(n2store-extension): add localhost matches — auto-snap chạy được trên dev _(2026-05-26)_
- `d1d3d7ea9` fix(delivery-report/report): 3 bug merge row - duyet click + sum children + note _(2026-05-26)_
- `ec5e4c149` auto: session update _(2026-05-26)_
- `afbd376c5` chore(scripts): rename OLD Firestore collection refs + cleanup tool _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-121633-e617e3a` cho Claude walk chain theo CLAUDE.md protocol.
