<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Agent tooling doc (KHÔNG phải feature web). -->

# Agent Tooling — Ponytail (lazy senior dev / YAGNI, ALWAYS-ON)

> **Loại:** công cụ cho **agent Claude Code**, KHÔNG phải feature app. Nguồn: https://github.com/DietrichGebert/ponytail (MIT, v4.8.3, commit trong `.claude/hooks/ponytail-SOURCE_COMMIT.txt`). Cài 2026-06-28, chế độ **always-on** (user chọn).

Ponytail ép giải pháp **lười = đơn giản/ngắn nhất mà chạy được**: thang YAGNI chạy _sau khi đã hiểu vấn đề_ — (1) có cần tồn tại? → (2) đã có trong codebase? reuse → (3) stdlib? → (4) native platform? → (5) dependency đã cài? → (6) 1 dòng? → (7) mới viết code tối thiểu. Không lười với: hiểu vấn đề, validate input ở biên, error handling chống mất data, security, accessibility — và mọi thứ user yêu cầu rõ.

## Đã cài gì (in-repo, committed)

- **6 skill invocable** `.claude/skills/`: `ponytail` (core, toggle level), `ponytail-review` (soi diff over-engineering), `ponytail-audit` (soi cả repo), `ponytail-debt` (gom comment `ponytail:` thành ledger), `ponytail-gain` (scoreboard benchmark), `ponytail-help`.
- **3 hook always-on** wired vào `.claude/settings.json` (đường dẫn tuyệt đối, vì manual install không có `${CLAUDE_PLUGIN_ROOT}`):
    - `SessionStart` (`startup|resume|clear|compact`) → `.claude/hooks/ponytail-activate.js` — tiêm ruleset YAGNI vào context MỖI session.
    - `SubagentStart` → `ponytail-subagent.js` — áp cho subagent.
    - `UserPromptSubmit` → `ponytail-mode-tracker.js` — bắt toggle `/ponytail lite|full|ultra|off`.
- Hook deps + nguồn: `.claude/hooks/ponytail-{config,runtime,instructions}.js`, `ponytail-statusline.{sh,ps1}`, `ponytail-AGENTS.md` (rule text), `ponytail-LICENSE`. `ponytail-instructions.js` đọc skill qua `../skills/ponytail/SKILL.md` (= `.claude/skills/ponytail/SKILL.md` — zero-dup vì hook nằm `.claude/hooks/`, sibling của `.claude/skills/`).
- **State ngoài repo** (không pollute): mode flag `~/.claude/.ponytail-active`, config persist `~/.config/ponytail/config.json`.

## Dùng

- **Mặc định `full`**, active mọi session trong repo này. Đổi cường độ: `/ponytail lite` | `full` | `ultra` | `off` (tắt phiên). Tắt vĩnh viễn: đặt `PONYTAIL_DEFAULT_MODE=off` hoặc sửa `~/.config/ponytail/config.json`.
- On-demand: `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help`.
- Đánh dấu shortcut cố ý bằng comment `ponytail:` (kèm trần & đường nâng cấp) → `ponytail-debt` gom lại sau.
- **Statusline badge (tuỳ chọn):** hook có thể nhắc thêm `statusLine` vào `~/.claude/settings.json` chạy `.claude/hooks/ponytail-statusline.sh` để hiện `[PONYTAIL]`. Chưa bật (không bắt buộc).

## Gỡ

Xoá 3 entry `id` `session:ponytail-activate` / `subagent:ponytail` / `prompt:ponytail-mode-tracker` khỏi `.claude/settings.json`, `rm -rf .claude/skills/ponytail* .claude/hooks/ponytail-*`. An toàn, không ảnh hưởng app.
