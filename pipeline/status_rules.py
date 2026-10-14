"""Open-status rules, applied to every pandal. Pure functions; status.py does the I/O.

X ONLY (DP, 13 Oct): a pandal opens only on an X post: a first-hand visitor post/photo dated FIRST_DAY+, or a dated
X post of the inauguration that names that pandal. News/web links never open anything; they may ride along as
secondary sources once X confirms. Generic roundups (traffic, gridlock, "crowds across the city") and scheduled /
future items are never evidence. User overrides (raw/overrides.json) outrank everything, including sticky open.
A pandal is declared from evidence only:
  * credible outlet (news org on X or web): inauguration or crowd report
  * trusted visitor (hand-checked handle list)
  * first-hand visitor post on X: dated on/after FIRST_DAY, says the pandal was visited / is open,
    and is not a throwback, route guide, preview or future plan
Every accepted source is recorded; the most credible is shown. Once declared, a pandal stays declared
(sticky) across refreshes that find nothing new; only explicit closure evidence downgrades it.
Uncertain posts are rejected, never guessed."""
import re
FIRST_DAY = '2026-10-10'
OUTLETS = {  # X handles and web domains of news organisations
 'ani','pti_news','ians_tweets','ians_india','ei_samay','eisamay','thewalltweets','timesofindia','toikolkata','telegraph_kol','ttindia',
 'abpanandatv','abpananda','anandabazar','republic_bangla','news18bengali','zee24ghanta','thedailyjagran','indiatoday','ndtv',
 'htkolkata','suvenduwb','hindustantimes','cmowbgov','newsarenaindia','sangbadpratidin','bengalbuzz',
 'timesofindia.indiatimes.com','telegraphindia.com','anandabazar.com','eisamay.com','thewall.in','abplive.com','ndtv.com',
 'indianexpress.com','hindustantimes.com','thehindu.com','news18.com','millenniumpost.in','sangbadpratidin.in','newsarenaindia.com'}
RANK = {'outlet': 0, 'trusted': 1, 'hand': 1, 'visitor': 2}
VISIT = re.compile(r'\b(visited|went to|been to|at the pandal|pandal (was|is|looks)|crowds?|thronged|queue|darshan|open(ed)? (to|for) (the )?(public|visitors)|is open|now open|pandal hopping (at|to)|inaugurat(ed|es|ion))\b|📍', re.I)
REJECT = re.compile(r'\b(scheduled|schedule|itinerary|throwback|tbt|last year|20(1\d|2[0-5])\b|will (visit|open|be)|going to visit|plan(ning)? to|to be inaugurated|set to|tomorrow|upcoming|route|guide|map of|list of|top \d+|countdown|days? to go|preview|teaser|coming soon|khuti puja|bamboo|under construction)\b', re.I)
CLOSED = re.compile(r'\b(closed (to|for) (the )?(public|visitors)|entry (stopped|suspended|banned)|shut down|sealed|cancell?ed)\b', re.I)
INSIDE = re.compile(r'visit|crowd|queue|hopping|darshan|overflow|thronged|pandal (was|is|looks)|📍|open (to|for)', re.I)

ROUNDUP = re.compile(r'\b(gridlock|traffic|snarl|jam|commuters?|office[- ]goers|roads?|across the city|several pandals|pujas? (in|across) |series of|among others|list of|itinerary|revellers)\b', re.I)
def is_x(url: str) -> bool: return bool(re.match(r'https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/[^/]+/status/', url or ''))

def who(url: str) -> str:
    m = re.match(r'https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/([^/]+)/status', url or '')
    if m: return m.group(1).lower()
    m = re.match(r'https?://(?:www\.)?([^/]+)', url or '')
    return (m.group(1).lower() if m else '')

def classify(src: dict, trusted: set[str]) -> dict | None:
    """src: {url, at (YYYY-MM-DD...), text, hand?}. Returns src + tier/kind, or None if not evidence."""
    url, text, at = src.get('url', ''), src.get('text', '') or '', (src.get('at') or '')[:10]
    if not url or not at or at < FIRST_DAY: return None
    h = who(url)
    if CLOSED.search(text): return {**src, 'by': h, 'tier': 'outlet' if h in OUTLETS else 'hand' if src.get('hand') else 'visitor', 'kind': 'closed'}
    if ROUNDUP.search(text) and not re.search(r'📍', text): return None  # roundups/traffic pieces name pandals in passing
    if h in OUTLETS or src.get('outlet'): tier = 'outlet'
    elif src.get('hand'): tier = 'hand'
    elif h in trusted: tier = 'trusted'
    else:
        if REJECT.search(text) or not VISIT.search(text): return None
        tier = 'visitor'
    if tier != 'hand' and REJECT.search(text) and not re.search(r'inaugurat(ed|es)|visited|crowd', text, re.I): return None
    kind = 'visitors' if tier in ('visitor', 'trusted') or INSIDE.search(text) else 'inaugurated'
    return {**src, 'by': h, 'tier': tier, 'kind': kind}

def decide(prev: dict | None, srcs: list[dict]) -> dict | None:
    """Merge previous published status with newly classified sources. Sticky; closure only downgrades."""
    old = list((prev or {}).get('sources') or ([] if not prev else [{'url': prev['evidence'], 'at': prev['since'], 'text': prev.get('note', ''), 'tier': 'hand', 'kind': prev.get('kind', 'inaugurated'), 'by': who(prev['evidence'])}]))
    seen, allsrc = set(), []
    for s in old + srcs:
        if s['url'] in seen: continue
        seen.add(s['url']); allsrc.append(s)
    opens = [s for s in allsrc if s['kind'] != 'closed']
    if not any(is_x(s['url']) for s in opens): opens = []  # X evidence required; news alone never opens
    else: opens = sorted(opens, key=lambda s: not is_x(s['url']))
    closes = [s for s in allsrc if s['kind'] == 'closed']
    if closes and (not opens or max(c['at'] for c in closes) > max(o['at'] for o in opens)):
        c = max(closes, key=lambda s: s['at'])
        return {'since': c['at'][:10], 'evidence': c['url'], 'note': c.get('text', '')[:200], 'kind': 'closed', 'sources': allsrc}
    if not opens: return None
    best = min([s for s in opens if is_x(s['url'])], key=lambda s: (not s.get('primary'), RANK[s['tier']], s['at']))
    kind = 'visitors' if any(s['kind'] == 'visitors' for s in opens) else 'inaugurated'
    return {'since': min(s['at'] for s in opens)[:10], 'evidence': best['url'], 'note': (best.get('text') or '')[:200], 'kind': kind,
            'corroborated': len({s['by'] for s in opens}) >= 2, 'sources': sorted(opens, key=lambda s: (RANK[s['tier']], s['at']))[:8]}

def override(o: dict | None, d: dict | None, srcs: list[dict]) -> dict | None:
    """DP's ground truth. A 'closed' override stands until an X post dated after o['after'] (first-hand visit or dated inauguration naming it); DP 14 Oct."""
    if not o or o.get('kind') != 'closed': return d
    fresh = [s for s in srcs if is_x(s['url']) and s['kind'] in ('visitors', 'inaugurated') and s.get('tier') in ('visitor', 'trusted', 'hand', 'outlet') and (s.get('at') or '') > o['after'][:19]]
    if fresh: return decide(None, fresh)
    return {'since': o['after'][:10], 'evidence': '', 'note': o.get('note', 'Not open yet'), 'kind': 'closed', 'by': 'override', 'sources': []}
