# superview

Render AI output as beautiful, reviewable HTML with feedback and iteration.

One command. Zero config. Nine content types. Day/night themes. Inline feedback. Version tracking with diffs.

## Quick Start

```bash
npx superview render draft.md
```

That's it. Your content opens in the browser as styled, reviewable HTML.

## Install

```bash
npm install -g superview
```

## Usage

```bash
# Auto-detect content type
superview render output.md

# Specify type explicitly
echo "Just shipped v2" | superview render --type tweet
superview render email.md --type email --title "Re: Partnership"

# Pipe from any tool
cat cover-letter.md | superview render --type document

# Start feedback server for real-time persistence
superview serve
```

## Content Types

| Type | What it renders |
|------|----------------|
| `email` | To/Subject header, accent bar, body |
| `tweet` | Card with @handle, character count |
| `thread` | Connected cards with vertical line |
| `message` | Chat bubble, timestamp |
| `linkedin` | LinkedIn-style card, engagement bar |
| `document` | A4 layout, gold top border, section headers |
| `code` | Dark surface, line numbers, syntax highlighting |
| `table` | Alternating rows, sticky header |
| `generic` | Article layout, optimal reading width |

Content type is auto-detected from your input. Use `--type` to override.

## Features

**Themes**: Day (warm cream) and night (near black) with auto time-based switching. Press `T` to toggle.

**Feedback**: Click the comment icon on any block. Select text for inline comments. Thumbs up/down reactions. All feedback exports to JSON for iteration.

**Versions**: Pass `--version 2 --previous v1.md` to see version tabs with word-level diffs. Press `D` to toggle diff view.

**History**: Sidebar shows all past renders, grouped by date, searchable.

**Keyboard shortcuts**: `T` theme, `D` diff, `1-9` versions, `Escape` close.

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

## CLI Reference

```
superview render <file|->     Render and open in browser
superview comment <file|->    Render with comment mode
superview history             Browse render history
superview feedback <id>       Export feedback JSON
superview serve               Start feedback server (port 3847)
superview init                Initialize .superview/ directory
superview clean               Remove temp files older than 7 days
```

### Options

```
--type <type>       email|tweet|thread|message|linkedin|document|code|table|generic
--title <title>     Page title
--theme <mode>      day|night|auto (default: auto)
--no-open           Don't open browser
--no-sidebar        Hide history sidebar
--with-fonts        Embed Google Fonts (Crimson Pro, DM Sans, JetBrains Mono)
--out <path>        Custom output path
--task-id <id>      Task ID for feedback tracking
--version <n>       Version number
--previous <file>   Previous version for diff
```

## Design

Matches [pranitgarg.com](https://pranitgarg.com) design system:

- **Day**: Warm cream (#F5F2E8) background, forest green (#2A7047) accent
- **Night**: Near black (#080810) background, red (#D43030) accent
- Paper grain texture overlay
- System serif headings (Georgia/Crimson Pro fallback)
- System sans body (DM Sans fallback)
- System monospace for code (JetBrains Mono fallback)

## Claude Code Integration

Superview replaces `quick-view`, `comment-mode`, and `html-style` skills. It auto-triggers on content output and supports the full feedback loop:

1. Claude renders content via `superview render`
2. You review and leave feedback in the browser
3. Feedback persists to `.superview/feedback/`
4. You say "iterate" or "v2"
5. Claude reads feedback, generates improved version
6. You see v1 feedback carried forward + new content

## License

MIT. Built by [Pranit](https://x.com/Pranit).
