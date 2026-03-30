# Using Superview with Claude Code

## Quick Render

When Claude generates content, render it for review:

```bash
# Render a draft email
superview render draft-email.md --type email --title "Partnership Outreach" --no-open

# Render a tweet
echo "Just shipped superview" | superview render --type tweet --no-open

# Auto-detect content type
superview render output.md --no-open
```

## Feedback Loop

1. Claude renders content: `superview render draft.md --no-open`
2. Claude tells you the generated HTML file path
3. You open that HTML file directly and leave comments, notes, or edits
4. Claude reads the latest canonical review bundle:
   `superview inbox --latest --json --base-dir "<working-dir>"`
5. Claude iterates against the canonical `content` in that JSON payload
6. Claude renders the next version with the same `--task-id`

Example iteration readback:

```bash
superview content --latest --json --base-dir "$PWD"
superview inbox --latest --json --base-dir "$PWD"
```

The `inbox` payload already includes the latest canonical `content`, so in most cases one command is enough.

## Persistence Modes

- File-first review is the default. Open the generated HTML file directly.
- `superview serve` is optional live sync only.
- If the browser cannot write review state to disk directly, Superview falls back to explicit export/import review bundles.

## Programmatic Usage

```typescript
import { writeAndOpen } from 'superview';

const path = await writeAndOpen(emailContent, {
  type: 'email',
  title: 'Re: Partnership',
  metadata: { to: 'partner@example.com', subject: 'Re: Partnership' },
  open: false,
});

console.log(path);
```

## Agent Rules

- Prefer the generated HTML file path, not localhost.
- Do not scrape browser state or assume a running server.
- Default machine interface:
  `superview inbox --latest --json --base-dir "<working-dir>"`
- `superview review` and `superview feedback` are compatibility aliases, not the preferred flow.

## Optional Live Mode

If you explicitly want live localhost sync:

```bash
superview serve --base-dir "$PWD"
```

Then render as usual. For normal review and iteration, this is not required.
