# Using Superview with Claude Code

## Quick Render

When Claude generates content, render it for review:

```bash
# Render a draft email
superview render draft-email.md --type email --title "Partnership Outreach"

# Render a tweet
echo "Just shipped superview" | superview render --type tweet

# Auto-detect content type
superview render output.md
```

## Feedback Loop

1. Claude renders content: `superview render draft.md`
2. You open the HTML, leave comments on specific blocks
3. You say "iterate" or "v2"
4. Claude reads `.superview/feedback/{task-id}.json`
5. Claude generates improved version with `--version 2 --previous draft-v1.md`
6. You see v1 feedback carried forward + new content in v2 tab

## Programmatic Usage (in Claude Code skills)

```typescript
import { writeAndOpen } from 'superview';

const path = await writeAndOpen(emailContent, {
  type: 'email',
  title: 'Re: Partnership',
  metadata: { to: 'partner@example.com', subject: 'Re: Partnership' },
});
```

## Live Feedback Server

For real-time feedback persistence:

```bash
superview serve
# Then render content - feedback auto-syncs to .superview/feedback/
```
