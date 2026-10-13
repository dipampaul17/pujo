# Open-status sweep (read by the live routine)

**X only.** A pandal is marked open only on an X post:
1. a first-hand visitor post or photo dated 2026-10-10 or later that names the pandal (📍 posts, "visited", photos), or
2. a dated X post of the inauguration that names that pandal (outlet or attendee).

Never evidence: news or web articles on their own; generic roundups (traffic, gridlock, "crowds across the city",
itineraries, "series of pujas"); scheduled or future items ("to inaugurate", "scheduled"); throwbacks, route guides.

**News is a lead, not evidence.** `status.py` writes Google News "inaugurated" headlines to `raw/news_leads.json`.
`xpoll.py plan` searches lead pandals first on X. Only the X post it finds can open the pandal; the article may then
be shown as a secondary source.

**Overrides win.** `raw/overrides.json` is DP's ground truth (e.g. Ekdalia Evergreen, Mudiali: closed). It outranks
every source and sticky open. It clears only on a first-hand X visitor post dated after its `after` timestamp.

**Sticky.** Once open on X evidence, a pandal stays open; only explicit closure evidence or an override downgrades it.

**Loop (every 5 min, 3 X calls, 864/day < 1000):** even runs: top 6 + trusted visitors, pass pandals, wide openings
search; odd runs: stalest/lead pandals, pass pandals, street signals. Then `xpoll.py ingest`, then `status.py`.
