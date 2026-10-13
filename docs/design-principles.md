# Design principles: Raya & DP's Pujo

Rules taken from published design writing, rewritten as concrete constraints for this app. These are paraphrases, not quotes, except where quotation marks and a source are given.
The tokens live in `src/index.css`. Change a rule there, never per screen.

## Sources
- Stripe, Katie Dill. Sessions 2024, "Craft and beauty": https://stripe.com/sessions/2024/craft-and-beauty-the-business-value-of-form-in-function · interview: https://creatoreconomy.so/p/how-stripe-crafts-quality-products-katie-dill
- Linear, "How we redesigned the Linear UI (part II)": https://linear.app/now/how-we-redesigned-the-linear-ui
- Apple Human Interface Guidelines (Typography, Layout, Color, Motion, Sheets, Segmented controls): https://developer.apple.com/design/human-interface-guidelines/
- Robinhood: https://medium.com/robinhood-engineering/the-top-secret-robinhood-design-story-a2b044812bae · https://design.google/library/robinhood-investing-material · https://portorocha.com/robinhood
- Emil Kowalski, "Agents with taste": https://emilkowal.ski/ui/agents-with-taste
- Notion: we found no Notion design-principles text we could verify, so no rule is attributed to Notion.

## Rules
**Quality order (Dill/Stripe).** Utility first, then usability, then beauty, and all three must hold. Walk the store: use the app end to end on a phone, the way the user does (here: open → pandal → Uber), before calling a change done. The checklist covers copy, motion, load time and transitions, not only visuals.

**Reduce chrome, keep alignment (Linear).** Remove visual noise from headers, tabs and panels. Align every label and icon to the same vertical and horizontal lines. The content is the interface.
→ One navbar, one segmented control style, no labels that don't help someone choose and go.

**Few variables, derived colors (Linear).** Linear generates its themes from a base color, an accent and a contrast value, and limits how much of the accent leaks into neutrals.
→ Warm neutral base, near-black ink, one sindoor accent reserved for open, next and new. Dark mode uses the same roles.

**Bold type and color carry hierarchy (Robinhood).** Content-centric layout: hierarchy comes from type size and weight, not boxes or ornament. A restrained palette of black, white and neutrals with one signature accent.
→ Type scale 34/28/22/20/17/15/13, tight tracking on large sizes, regular body tracking. Headings use weight 650, body 400–500.

**Platform conventions (Apple HIG).** 44 pt minimum hit targets. Sheets have a grabber and drag to dismiss. Segmented controls switch views of the same content. Tabular figures for numbers. Respect Reduce Motion.
→ `.seg` for zones and sections, `.sheet` + `.grabber` + `.close-x`, 30 px glyph inside a 44 px hit area.

**Motion has a reason (Kowalski).** Enter with ease-out, move with ease-in-out, and make exits about 20–30% faster than entrances. UI animation stays under 300 ms. Pressed controls scale to 0.97. Nothing appears from scale(0).
→ Tokens `--t-tap 120`, `--t-ui 200`, `--t-sheet 280`, `--t-exit 190`, plus `--ease`, `--spring`, `--ease-in`.

**Typography details (Kowalski).** Use `tabular-nums` for distances and times, the real `…` character for truncation, and underlines only for links.

## System
- Spacing: 4/8 grid. Screen inset 20, card inset 16, sections separated by 24–40.
- Radii: 10 (images, small controls), 14 (cards, buttons, lists), 22 (sheets, hero frame). Pills only for small inline actions.
- Surfaces: grouped inset lists with indented hairlines. One elevation (`--shadow-1`); the sheet is the only thing that floats.
- Buttons: 52 for main actions, 44 for quiet ones. One primary per screen (Uber).
- Copy: no advice, no meta, no totals no one asked for. Statuses always show their source.
