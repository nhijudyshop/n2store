> This file extends [design-quality.md](./design-quality.md) with DESIGN.md format integration.

# DESIGN.md — AI-Native Design System Format

## What is DESIGN.md

DESIGN.md is Google's open format — a single markdown file that AI coding tools read to build consistent UI. Plain markdown is what LLMs read best, no parsing libraries or schema validation needed.

**Site**: https://designmd.ai — 160+ free community design systems, searchable by style/tag.

## How to Use

### Step 1: Find a Design System

Before building any new UI page/feature, search for a fitting design system:

```bash
# Search by style keywords
npx designmd search "dark dashboard" --limit 5
npx designmd search "clean saas minimal" --tag saas --sort trending

# Browse available style tags
npx designmd tags
```

**Available tags**: clean, saas, light, bold, dark, dashboard, warm, minimal, mobile-app, professional, modern, playful, devtools, elegant, landing-page, premium, ecommerce, portfolio, social, accessible

### Step 2: Download to Project Root

```bash
# Download a design system (requires free API key)
npx designmd download chef/genesis
npx designmd download chef/genesis -o ./DESIGN.md

# Get API key at: https://designmd.ai/api-keys
# Set: export DESIGNMD_API_KEY=dk_your-key-here
```

### Step 3: AI Reads DESIGN.md Automatically

When `DESIGN.md` exists at project root, Claude reads it and follows the design system for all UI work.

## DESIGN.md File Structure

A DESIGN.md file contains these sections:

### Colors

```markdown
## Colors

### Primary Palette
- **Primary**: `#6366F1` — Main brand color, used for CTAs and key interactive elements
- **Secondary**: `#20970B` — Success states and positive actions
- **Accent**: `#F59E0B` — Highlights and attention-drawing elements

### Neutrals
- **Background**: `#FAFAFA`
- **Surface**: `#FFFFFF`
- **Border**: `#E5E7EB`
- **Text Primary**: `#111827`
- **Text Secondary**: `#6B7280`
- **Text Muted**: `#9CA3AF`

### Semantic Colors
- **Error**: `#EF4444`
- **Warning**: `#F59E0B`
- **Success**: `#10B981`
- **Info**: `#3B82F6`
```

### Typography

```markdown
## Typography

### Font Families
- **Display**: General Sans (or Inter) — Headlines, hero text
- **Body**: DM Sans (or system-ui) — Body copy, UI labels

### Scale
| Role      | Size  | Weight | Line Height | Letter Spacing |
|-----------|-------|--------|-------------|----------------|
| Display   | 72px  | 700    | 1.1         | -0.02em        |
| H1        | 48px  | 700    | 1.2         | -0.01em        |
| H2        | 36px  | 600    | 1.25        | -0.005em       |
| H3        | 24px  | 600    | 1.3         | 0              |
| Body      | 16px  | 400    | 1.6         | 0              |
| Body SM   | 14px  | 400    | 1.5         | 0              |
| Caption   | 12px  | 500    | 1.4         | 0.02em         |
```

### Spacing

```markdown
## Spacing

**Base unit**: 4px

| Token | Value |
|-------|-------|
| xs    | 4px   |
| sm    | 8px   |
| md    | 16px  |
| lg    | 24px  |
| xl    | 32px  |
| 2xl   | 48px  |
| 3xl   | 64px  |
| 4xl   | 96px  |
```

### Components

```markdown
## Components

### Buttons
- **Primary**: bg `#6366F1`, text white, radius 8px, padding 12px 24px
  - Hover: bg `#4F46E5`, transform translateY(-1px), shadow sm
  - Active: bg `#4338CA`, transform none
  - Disabled: opacity 0.5, cursor not-allowed
- **Secondary**: bg transparent, border 1px `#E5E7EB`, text `#374151`
- **Ghost**: bg transparent, text `#6366F1`

### Cards
- Background: `#FFFFFF`
- Border: 1px solid `#E5E7EB`
- Border radius: 12px
- Padding: 24px
- Shadow: `0 1px 3px rgba(0,0,0,0.1)`
- Hover: shadow `0 4px 12px rgba(0,0,0,0.1)`, translateY(-2px)

### Inputs
- Height: 44px
- Border: 1px solid `#D1D5DB`
- Border radius: 8px
- Padding: 0 12px
- Focus: border `#6366F1`, ring 2px `rgba(99,102,241,0.2)`
```

### Elevation & Shadows

```markdown
## Elevation

| Level | Shadow | Use Case |
|-------|--------|----------|
| 0     | none   | Flat elements |
| 1     | `0 1px 3px rgba(0,0,0,0.1)` | Cards, surfaces |
| 2     | `0 4px 12px rgba(0,0,0,0.1)` | Hover states, dropdowns |
| 3     | `0 8px 24px rgba(0,0,0,0.12)` | Modals, popovers |
| 4     | `0 16px 48px rgba(0,0,0,0.15)` | Overlays |
```

### Guidelines (Do's and Don'ts)

```markdown
## Guidelines

### Do
- Use primary color sparingly — only for CTAs and key actions
- Maintain consistent spacing rhythm using the 4px grid
- Pair display font for headlines with body font for content
- Use semantic colors for status indicators

### Don't
- Don't use more than 3 colors on a single screen
- Don't mix font weights randomly — stick to the scale
- Don't use shadows heavier than level 2 for cards
- Don't override the spacing scale with arbitrary values
```

## MCP Server Integration (Optional)

For direct AI access without visiting the website:

```bash
# Add to Claude Code (user-level)
claude mcp add -s user designmd -e DESIGNMD_API_KEY=dk_your-key-here -- npx designmd-mcp
```

Or in MCP config JSON:
```json
{
  "mcpServers": {
    "designmd": {
      "command": "npx",
      "args": ["designmd-mcp"],
      "env": {
        "DESIGNMD_API_KEY": "dk_your-key-here"
      }
    }
  }
}
```

MCP provides 7 tools: search, browse, download, upload, delete, view tags, get details. Adds ~2K tokens to context.

## Workflow: When Building New UI

1. **Check if `DESIGN.md` exists** in project root
2. **If yes** → follow it strictly for colors, typography, spacing, components
3. **If no** → ask user: "Bạn muốn chọn design system nào? Tôi có thể search trên designmd.ai"
4. **Search** → `npx designmd search "<keywords>"` based on project type
5. **Download** → save as `DESIGN.md` at project root
6. **Apply** → all UI code must reference DESIGN.md values, not hardcoded styles

## Popular Design Systems by Use Case

| Use Case | Design System | Tags |
|----------|--------------|------|
| SaaS Dashboard | Genesis | clean, saas, blue |
| Healthcare | Verdana Health | clean, accessible |
| E-commerce | ShopVibe | ecommerce, modern |
| Audio/Media | VoiceBox | dark, bold |
| Creative Tool | CreateSpace | playful, modern |
| Travel | Journey UI | warm, elegant |
| Social/Community | FeedLoop | light, social |
| Dev Tools | DevLog | dark, devtools |
| Learning Platform | LearnFlow | clean, accessible |
| Chat/Messaging | ChatBubble | minimal, mobile-app |

## Integration with Existing Rules

This complements [design-quality.md](./design-quality.md):
- DESIGN.md provides the **concrete values** (colors, sizes, shadows)
- design-quality.md provides the **quality standards** (anti-template, hierarchy, depth)
- Both must be satisfied: a DESIGN.md with good tokens + bad composition still fails
