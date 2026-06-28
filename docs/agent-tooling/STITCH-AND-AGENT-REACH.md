<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Agent tooling doc (KHÔNG phải feature web). -->

# Agent Tooling — Stitch Skills + Agent Reach

> **Loại:** Công cụ cho **agent Claude Code** (mở rộng năng lực khi code/research trên project), **KHÔNG** phải feature runtime của app shop. Không có route/trang/DB nào của Web 2.0 hay Web 1.0 bị thay đổi.
> **Ngày tích hợp:** 2026-06-28. User chọn hướng: _"Cả hai chỉ cài làm agent tooling"_.

Hai bộ công cụ mã nguồn mở được cài để Claude Code có thêm 2 năng lực:

| Công cụ                                          | Năng lực                                                                                                   | Loại                       | Nơi cài                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| **stitch-skills** (google-labs-code, Apache-2.0) | Sinh/convert **UI design** qua Google Stitch (code↔design, design→React/RN/Remotion, DESIGN.md)            | Agent Skills (Claude Code) | `.claude/skills/stitch-*` (trong repo)                        |
| **agent-reach** (Panniantong, MIT)               | Cho agent **đọc internet**: YouTube/Twitter/Reddit/Bilibili/Xiaohongshu/GitHub/LinkedIn/RSS/Web/Exa search | Python CLI + Skill         | Ngoài repo: `~/.local/bin`, `~/.agent-reach/`, `~/.mcporter/` |

---

## 1. Stitch Skills (14 skill)

**Nguồn:** https://github.com/google-labs-code/stitch-skills — commit `38f45dd` (xem `.claude/skills/stitch-skills-meta/SOURCE_COMMIT.txt`). License Apache-2.0 (`.claude/skills/stitch-skills-meta/LICENSE`).

Vendor nguyên 14 skill (giữ verbatim SKILL.md + scripts/resources/examples) vào `.claude/skills/` với prefix `stitch-` (Claude Code lấy **invocation id = tên thư mục**; frontmatter `name:` giữ nguyên `stitch::...`). Vì là vendored flat skills (giống 183 skill có sẵn trong repo) nên xuất hiện ngay trong danh sách skill của project.

| Plugin gốc       | Skill (id trong repo)                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stitch-design    | `stitch-code-to-design`, `stitch-generate-design`, `stitch-manage-design-system`, `stitch-extract-design-md`, `stitch-extract-static-html`, `stitch-upload-to-stitch` |
| stitch-build     | `stitch-react-components`, `stitch-react-native`, `stitch-remotion`, `stitch-shadcn-ui`                                                                               |
| stitch-utilities | `stitch-design-md`, `stitch-enhance-prompt`, `stitch-loop`, `stitch-taste-design`                                                                                     |

> **⚠️ ĐIỀU KIỆN ĐỂ CHẠY THẬT — chưa thiết lập:** đa số skill này gọi **Stitch MCP server** (cần **tài khoản Google Stitch** + đăng ký MCP). Hiện **chưa cấu hình** MCP đó → skill đã _cài & gọi được_ nhưng các bước gọi `stitch*` MCP tool sẽ fail cho tới khi user setup. Hướng dẫn: https://stitch.withgoogle.com/docs/mcp/setup/. Khi đã có, thêm MCP `stitch` vào Claude Code rồi mới dùng `stitch-generate-design`, `stitch-code-to-design`, …
>
> **Dùng được NGAY (không cần Stitch MCP):** các skill thuần phân tích/sinh file — `stitch-extract-design-md` (rút DESIGN.md từ source FE), `stitch-extract-static-html` (snapshot HTML inline CSS), `stitch-taste-design` / `stitch-design-md` (sinh DESIGN.md), `stitch-enhance-prompt`, `stitch-shadcn-ui`.

**Gỡ:** xoá `rm -rf .claude/skills/stitch-*` (an toàn, không ảnh hưởng app).

---

## 2. Agent Reach (CLI đọc internet)

**Nguồn:** https://github.com/Panniantong/agent-reach (MIT, v1.5.0). Định vị: _installer + doctor + router_ — sau khi cài, agent gọi **trực tiếp tool thượng nguồn** (gh, yt-dlp, curl r.jina.ai, mcporter…), agent-reach chỉ chọn/cài/chẩn đoán/định tuyến.

**Cài ngoài workspace** (theo đúng boundary của agent-reach — KHÔNG để file trong repo):

- CLI: `~/.local/bin/agent-reach` (pipx, isolated venv) + `yt-dlp`, `mcporter` cùng ở `~/.local/bin`.
- Config/token: `~/.agent-reach/`. Exa MCP: `~/.mcporter/mcporter.json` (system config, resolve mọi cwd).
- Skill cho Claude Code (user-level): `~/.claude/skills/agent-reach/`.
- **PATH:** pipx đã thêm `~/.local/bin` vào `~/.zshrc` + `~/.zprofile` → **shell zsh mới (gồm session Claude Code mới) tự có**. Shell hiện tại chưa source thì prefix tay: `PATH="$HOME/.local/bin:$PATH"`.

### Trạng thái kênh (agent-reach doctor) — 6/13 ✅

| Kênh                                                                              | Trạng thái               | Cách gọi                                                    |
| --------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| 🌐 Web (Jina Reader)                                                              | ✅                       | `curl -s https://r.jina.ai/<URL>`                           |
| 📺 YouTube (info + phụ đề)                                                        | ✅                       | `yt-dlp --dump-json <URL>` / `yt-dlp --write-auto-sub ...`  |
| 📦 GitHub                                                                         | ✅                       | `gh search repos "q"` / `gh search code` / `gh api`         |
| 📡 RSS/Atom                                                                       | ✅                       | `python3 -c "import feedparser; ..."`                       |
| 🔍 Exa (search ngữ nghĩa toàn web, **free, no key**)                              | ✅                       | `mcporter call exa.web_search_exa query="..." numResults=5` |
| 📺 Bilibili (search)                                                              | ✅                       | qua agent-reach/curl; full cần `pipx install bilibili-cli`  |
| 💻 V2EX                                                                           | ⚠️ 403 (cần proxy)       | —                                                           |
| 🐦 Twitter · 📖 Reddit · 📕 Xiaohongshu · 🎙️ Xiaoyuzhou · 📈 Xueqiu · 💼 LinkedIn | ⬜ cần cookie/credential | xem dưới                                                    |

Kiểm tra bất cứ lúc nào: `agent-reach doctor` (hoặc `agent-reach doctor --json` để biết `active_backend` mỗi nền tảng).

### Mở thêm kênh (cần USER cung cấp credential — chưa làm)

Các kênh login dùng **Cookie-Editor export** (Chrome ext) là chính, **nên dùng tài khoản phụ** (rủi ro ban/lộ cookie):

```bash
agent-reach install --channels=twitter,reddit,xiaohongshu,xueqiu   # cài backend
agent-reach configure twitter-cookies "<HEADER_STRING từ Cookie-Editor>"
agent-reach configure groq-key gsk_xxx     # mở Xiaoyuzhou (podcast→text, Groq free)
agent-reach configure proxy http://user:pass@ip:port   # nếu IP bị chặn (Reddit/Twitter/V2EX)
```

### Caveat đã gặp & xử lý

- **`mcporter config add` ghi vào `<cwd>/config/mcporter.json`** → từng tạo rác `n2store/config/` (đã xoá). Đã chuyển sang **system config `~/.mcporter/mcporter.json`** (resolve mọi cwd). Nếu cần thêm MCP cho agent-reach về sau → sửa file đó, **đừng** chạy `mcporter config add` trong thư mục repo.
- **`npm install -g mcporter` lỗi EACCES** do `~/.npm` có file root-owned (lần `sudo npm` cũ). Đã né bằng `--cache /tmp/... --prefix ~/.local` (không sudo). Muốn dùng `npm -g` bình thường về sau: `sudo chown -R 501:20 ~/.npm` (cần user chạy).
- **SSL CERTIFICATE_VERIFY_FAILED** (python.org Python) → đã chạy `Install Certificates.command` (cài certifi). V2EX vẫn 403 vì chặn IP, không phải SSL.

**Cập nhật:** `帮我更新 Agent Reach: https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/update.md` hoặc `pipx upgrade agent-reach`.
**Gỡ:** `pipx uninstall agent-reach` (+ `rm -rf ~/.agent-reach ~/.mcporter/mcporter.json ~/.claude/skills/agent-reach`).

---

## 3. Còn lại cho USER (việc cần bạn quyết/cung cấp)

1. **Google Stitch MCP** — đăng ký + add MCP `stitch` để các skill design chạy thật.
2. **Cookie kênh social** (Twitter/Reddit/Xiaohongshu/Xueqiu) qua Cookie-Editor — nếu muốn agent đọc các nền tảng đó (khuyến nghị tài khoản phụ).
3. **Groq key** (free) cho Xiaoyuzhou podcast→text; **proxy** nếu muốn Reddit/V2EX.
4. (Tuỳ chọn) `sudo chown -R 501:20 ~/.npm` nếu muốn `npm -g` hoạt động bình thường.
