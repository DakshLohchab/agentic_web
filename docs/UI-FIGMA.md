# Figma → Agentic Browser UI workflow

Use this guide to design the popup in Figma and keep CSS in sync. No Figma MCP is required.

## Frame setup

| Property | Value |
|----------|--------|
| Frame name | `Popup / Agentic Browser` |
| Size | **360 × 520** px (min width matches `popup.css`) |
| Layout | Auto layout vertical, 16px padding, 12px gap |

## Component map

| Figma layer | Extension element | CSS hook |
|-------------|-------------------|----------|
| Header row | `.app-header` | `--color-surface` |
| Brand mark 36×36 | `.brand-mark` | gradient primary → indigo |
| Goal card | `.card` + `#goal` | `--radius-lg`, `--shadow-card` |
| Button row | `.actions` | Run = `.btn-primary`, Stop = `.btn-secondary` |
| Status card | `.status-card` | `#statusChip` chips |
| Warning banner | `#accessBanner` | `.banner-warning` / `.banner-info` |
| Error box | `#errorBox` | `--color-error-bg` |

## Design tokens (create as Figma variables)

Export these as CSS custom properties in `popup.css` (`:root`):

```
--color-bg              #0f1419 (dark) / #f4f6f9 (light)
--color-surface         #1a2332 / #ffffff
--color-primary         #3b82f6
--color-text            #e8edf4 / #0f172a
--color-text-muted      #94a3b8 / #64748b
--color-error           #ef4444
--color-warning         #f59e0b
--radius-md             10
--radius-lg             14
--popup-min-width       360
```

**Chip states** (status pill variants):

- idle — gray
- running / observing / thinking / acting — blue tint
- done — green tint
- error / stopped — red tint
- ask_user — amber tint

## Step-by-step workflow

1. **Create file** — Figma design file, frame 360×520.
2. **Variables** — Add color + radius variables matching the table above.
3. **Build sections** — Header → optional banner → goal card → status card → footer link.
4. **Prototype** — Optional: Run disabled when banner shows “restricted”.
5. **Handoff** — Use Dev Mode or Inspect to copy spacing, radii, hex values.
6. **Apply** — Update `:root` in `extension/popup.css` and `extension/options.css` (shared tokens).
7. **Assets** — Export logo/mark as SVG only if you replace `.brand-mark` gradient.

## Code Connect (optional)

If you use Figma Code Connect later, map:

- `Button/Primary` → `.btn.btn-primary`
- `Chip/Status` → `.chip.chip-{status}`

## Plugins that help

- **Tokens Studio** — export JSON → paste into CSS variables
- **Figma to CSS** — one-off spacing reference (verify against our variables)

## Side panel

The side panel reuses `popup.html`. One Figma frame is enough; note “also used in side panel” in the frame description.

## When Figma MCP is available

1. Load the `figma-use` skill before any `use_figma` call.
2. Create or update the 360×520 frame with auto-layout sections above.
3. Copy token hex values into `popup.css` `:root` manually (fastest for MVP).
