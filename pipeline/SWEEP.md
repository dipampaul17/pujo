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

**X budget: 1000/day, resets 05:30 IST (00:00 UTC). Ledger: `state/xbudget.json`** (DP 14 Oct). `xpoll.py plan` charges
the ledger for every query it plans. After any X call, sync it to X's own footer ("N of 1000 today"):
`python3 pipeline/xpoll.py set-left N`. Check with `xpoll.py left`; charge extra calls with `xpoll.py spend K`.
- Every run: call 1 = wide openings (English/Bengali/Banglish opening words + Kolkata/pujo) OR DP's override pandals
  (Ekdalia, Mudiali: Bengali + English names) OR trusted visitors OR inaugurators (CM/CMO always + verified leaders/celebs,
  rotated in batches, with inauguration keywords). Window = since the last wide run minus 5 min (max 6 h).
- 05:30-17:00 and 23:00-02:00 IST: 2 calls/run (wide + pass pandals on even runs / other pandals on odd runs).
- 17:00-23:00 IST: 3 calls/run (wide + pass pandals + other pandals / street signals alternately).
- 02:00-05:30 IST: 1 call/run (wide only).
- Guards: never below 60 left (0 calls); under 150 left: 1 call; if the schedule to the reset would cross the floor, one
  call fewer; if there is surplus beyond floor + 80 for sweeps, 2-call runs become 3. A full day plans ~780 calls.
- Sweeps: at most 1 X call each, no wide search (the refresh runs it), and none when `xpoll.py left` < 150.

**Inaugurators (self-growing).** `raw/x_inaugurators.json` holds verified accounts (ministers, MPs, MLAs, BJP state
leaders, celebrities). Their dated inauguration post naming an app pandal is X evidence, like the CM's. Ingest logs the
author and @-mentions of every inauguration post naming an app pandal to `raw/x_inaugurator_candidates.json`. When it has
pending handles (and >= 150 reads left): `xpoll.py inaug-pending` -> get_users_by_usernames (1 read, <=100 names, fields
description,location,public_metrics,most_recent_tweet_id) -> save JSON -> `xpoll.py inaug-verify FILE` (auto-adds
Bengal-relevant public figures, rejects the rest).

**Overrides.** DP's closed reports (`raw/overrides.json`) are not permanent: an X first-hand visit or dated inauguration
post dated after `after` flips the pandal Open. News never does.
