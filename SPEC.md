# Superview Feature Spec

> Persistent feature spec for Superview. Auto-referenced when working in superview/ dir.
> Last updated: 2026-03-18

## Tier 1: Core (v0.3.0)

- [x] Sidebar always visible (empty state when no history)
- [x] Remove all thumbs up/down reaction buttons
- [x] `--content` flag for direct text input
- [x] Clean SKILL.md (works for any Claude Code user)
- [x] SPEC.md created
- [x] `--metadata` flag for template metadata
- [x] `--variant-of` flag for linking variants
- [x] `--base-dir` flag + SUPERVIEW_DIR env var
- [x] Shorthand: `npx superview "text here"`
- [x] `setup-claude` command for onboarding

## Tier 2: Feedback UX (v0.3.0)

- [x] Google Docs-style comment panel (replacing inline reactions)
- [x] Floating feedback pill (bottom-right, unresolved count)
- [x] General notes panel (textarea at bottom of comment panel)
- [x] Comment resolution (resolve toggle, strikethrough)
- [x] `feedback --json` structured output for Claude
- [x] Content fade-in animation
- [x] Onboarding hint on first visit
- [x] Copy button labeled "Copy text" with checkmark
- [x] Keyboard shortcuts (Cmd+Shift+M, N/P navigation)

## Tier 3: Content Intelligence (v0.3.0)

- [x] Per-sentence tweet feedback blocks
- [x] Better thread segment detection (numbered patterns)
- [x] Email auto-extract metadata from content
- [x] `keep` command (promote temp to permanent)
- [x] `today` command with --open flag
- [x] Tabbed variations UI
- [x] Version accordion labels (v1, Mar 18, 2:30 PM)

## v0.3.1 Bug Fixes (Visual Polish)

- [x] Theme toggle shows visible sun/moon icon + "Day"/"Night" label in toolbar
- [x] Sidebar footer toggle shows icon + label text
- [x] Removed orphaned "v1 (current)" text below content
- [x] Footer restyled: accent-colored "Superview" name, separator dots, better spacing
- [x] Today page uses shared layout (sidebar, theme toggle, consistent colors via buildHtml)
- [x] All 9 content types verified: tweet, thread, email, message, linkedin, document, code, table, generic

## Tier 4: Future (v0.4+)

- [ ] Compare mode (side-by-side two versions)
- [ ] Export as PNG (screenshot API)
- [ ] Version diffing improvements (word-level, inline)
- [ ] Print stylesheet for clean printing
- [ ] Accessibility audit (ARIA labels, keyboard nav)
- [ ] Theme customization via .superview/config.json
- [ ] Plugin system for custom content types
- [ ] Real-time collaboration (WebSocket)

## Acceptance Criteria

Each feature must:
1. Build clean (`tsc --noEmit`)
2. Not break existing tests (`vitest run`)
3. Work in both day and night themes
4. Be usable without the feedback server running
