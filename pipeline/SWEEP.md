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

**Open count.** The one Open set is `public/live/status.json` (X evidence + overrides), which is what the app shows.
Report it with `python3 pipeline/open_count.py`. `state/xlive.json` `open` is only the poller's raw input to `status.py`.

**X budget: 1000/day, resets 05:30 IST.** The 5-minute refresh (`xpoll.py plan`) spends:
- 15:00-02:00 IST (evening priority): 3 calls/run: even runs top 6 + trusted visitors + CM/CMO, pass pandals, wide
  openings; odd runs other pandals, pass pandals, street signals.
- 02:00-15:00 IST: 1 call/run, rotating pass pandals, other pandals, wide openings (2 h window), top + trusted/CM.
- Total 552/day. Sweeps get the remaining ~450: at most 1 X call per sweep, and no wide openings search in a sweep
  (the refresh already runs it). Before any extra call, check "X reads left"; below 100 left, sweeps make no X calls.
