# superview

Stop reviewing AI output in your terminal.

Beautiful preview and feedback for AI-generated content. Tweets look like tweets. Emails look like emails.

<!-- TODO: hero GIF showing render + feedback loop -->

## Quick Start

```bash
npx superview "Your AI-generated text here"
```

That's it. Your content opens in the browser as styled, reviewable HTML.

## Works with Claude Code

```bash
npx superview setup-claude
```

Superview auto-triggers when Claude creates content. Write a tweet, email, or document, and it renders instantly for review. Open the generated HTML file directly, leave comments in the browser, then read them back with `superview inbox --latest --json` (or `review` / `feedback` for compatibility). `superview serve` is optional live sync, not the default review path.

For review persistence there are now three modes:
- **Live sync**: open through `superview serve`
- **Folder-backed**: click `Connect folder` from a localhost or HTTPS page and Superview writes review files directly into `.superview/`
- **Export/import**: on plain file-open pages, use `Export review`, then run `superview import-review <file>`

Agent-facing canonical flow:

```bash
superview content --latest --json
superview inbox --latest --json
```

`superview content` reads the latest canonical edited draft from `.superview/content/<taskId>.txt`. `superview inbox` reads the canonical review bundle in `.superview/reviews/<taskId>.json` and also includes the latest canonical `content` field in its JSON output. `superview review` is the same data shape, and `superview feedback` remains a compatibility alias.

## Content Types

- **email**: To/Subject header, accent bar, formatted body
- **tweet**: Card with @handle, character count, per-sentence feedback blocks
- **thread**: Connected cards with vertical line, numbered segment detection
- **message**: Chat bubble with timestamp
- **linkedin**: LinkedIn-style card with engagement bar
- **document**: A4 layout, gold top border, section headers
- **code**: Dark surface, line numbers, syntax highlighting
- **table**: Alternating rows, sticky header
- **generic**: Article layout, optimal reading width

Content type is auto-detected from your input. Use `--type` to override.

## Features

**Inline Feedback**: Google Docs-style comment panel. Click any block to comment. Resolve comments when addressed. Floating pill shows unresolved count. General notes textarea for overall thoughts.

**Serverless Review**: Comments, notes, renames, and safe inline edits work without the Superview server. When folder access is unavailable, export the review bundle and import it from the CLI.

**Version Tracking**: Render v2 with `--version 2 --previous v1.md` to see version tabs with word-level diffs. Press `D` to toggle diff view. Accordion labels show version number, date, and time.

**Today Dashboard**: `npx superview today --open` shows everything rendered today, grouped by time period.

**Variations**: Link related renders with `--variant-of` for tabbed side-by-side comparison.

**History**: Sidebar shows all past renders, grouped by date, searchable. Always visible (empty state when no history).

**Themes**: Day (warm cream) and night (near black) with auto time-based switching. Press `T` to toggle.

**Keyboard Shortcuts**: `T` theme, `D` diff, `1-9` versions, `Cmd+Shift+M` comments, `N/P` navigate comments, `Escape` close.

## Install

```bash
npm install -g superview
```

Or use without installing:

```bash
npx superview render draft.md
```

## CLI Reference

### Commands

```
superview render <file|->     Render and open in browser
superview render --content    Render inline text directly
superview "text"              Shorthand for render --content
superview content --latest --json  Export the latest canonical edited content
superview inbox --latest --json   Export the latest structured review bundle
superview review --latest --json  Same bundle for compatibility
superview feedback --latest --json Legacy alias for review
superview import-review <file>    Import a review bundle JSON file
superview keep <id>           Promote temp render to permanent
superview today               Open Today dashboard
superview history             Browse render history
superview serve               Start optional live-sync server (port 3847)
superview setup-claude        Configure Claude Code integration
superview clean               Remove temp files older than 7 days
```

When Superview is running locally, these read-only routes return the canonical review bundle JSON for compatibility with older tools:

- `GET /inbox`
- `GET /inbox/latest`
- `GET /inbox/<taskId>`
- `GET /feedback`
- `GET /feedback/latest`
- `GET /feedback/<taskId>`
- `GET /review`
- `GET /review/latest`
- `GET /review/<taskId>`

### Flags

```
--type <type>       email|tweet|thread|message|linkedin|document|code|table|generic
--title <title>     Page title
--content <text>    Render text directly (no file needed)
--metadata <json>   Template metadata (JSON string)
--variant-of <id>   Link as variant of another task
--base-dir <path>   Override .superview/ directory location
--theme <mode>      day|night|auto (default: auto)
--no-open           Don't open browser
--no-sidebar        Hide history sidebar
--with-fonts        Embed Google Fonts (Crimson Pro, DM Sans, JetBrains Mono)
--out <path>        Custom output path
--task-id <id>      Task ID for feedback tracking
--version <n>       Version number
--previous <file>   Previous version for diff
```

### Environment Variables

```
SUPERVIEW_DIR       Override default .superview/ directory location
```

## Design

Matches [pranitgarg.com](https://pranitgarg.com) design system:

- **Day**: Warm cream (#F5F2E8) background, forest green (#2A7047) accent
- **Night**: Near black (#080810) background, gold (#D49828) accent
- Paper grain texture overlay
- System serif headings (Georgia/Crimson Pro fallback)
- System sans body (DM Sans fallback)
- System monospace for code (JetBrains Mono fallback)

## Programmatic API

```typescript
import { writeAndOpen, render } from 'superview';

// Render and open in browser
await writeAndOpen('Your content here', {
  type: 'tweet',
  title: 'My tweet',
});

// Just get the HTML string
const html = await render('Content', { type: 'email' });
```

## License

MIT. Built by [Pranit](https://x.com/Pranit).
