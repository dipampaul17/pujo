"""Live street signals from X (English, Bengali, Benglish): crowd surges, queues, entry closures, rain/waterlogging,
road closures/diversions, metro/parking chaos, no cabs/surge, power cuts.
A signal is shown only when it is
  recent      : posted within the last 2 h,
  placed      : names exactly one guide pandal, or one known area,
  first-hand  : present-tense report, not advice/forecast/politics/throwback,
  corroborated: from a credible handle (police, established news, trusted visitor) OR >=2 different people
                reporting the same kind of thing at the same place within the window."""
import re, datetime as dt
WINDOW_H = 2
CREDIBLE = {'kolkatapolice', 'kptrafficdept', 'abpanandatv', 'ei_samay', 'ttindia', 'thewalltweets', 'ani', 'abasu4ever', 'sudhanidhib'}
B = lambda en, bn='': re.compile(r'(\b(' + en + r')\b' + (r'|' + bn if bn else '') + ')', re.I)
KINDS = [  # most actionable first
    ('closed', 'Entry closed', B(r'entry (closed|stopped|suspended|band)|gates? (closed|shut)|closed for (the )?(public|visitors)|pandal (closed|shut)|temporarily closed|entry bondho|gate bondho', r'প্রবেশ বন্ধ|গেট বন্ধ|মণ্ডপ বন্ধ')),
    ('queue', 'Long queue', B(r'queue|long line|lambaa? line|lomba line|line e (dara|dar)\w*|waiting (time|line)|\d+\s*(min|mins|minutes|hours?|hrs?) (wait|in line|line)', r'লম্বা লাইন|লাইনে দাঁড়িয়ে|লাইন পড়েছে')),
    ('crowd', 'Crowd surge', B(r'crowd(ed| surge)?|huge rush|rush|jam[- ]?packed|packed|stampede|barricades?|over-?crowd\w*|bheer|bhe?ir|bhid|bhir', r'উপচে পড়া ভিড়|ভিড়|ভিড়|ঠাসা')),
    ('rain', 'Rain', B(r'raining|heavy rain|downpour|waterlog\w*|water-?logg\w*|brishti( porche| hocche)?|jol jomeche|jol jome', r'বৃষ্টি হচ্ছে|বৃষ্টি পড়ছে|জল জমেছে|জলমগ্ন')),
    ('traffic', 'Traffic', B(r'traffic jam|gridlock|jaam|road (closed|blocked)|rasta (block\w*|bondho|bandh)|diversion|diverted|one[- ]way|no[- ]entry|police (restriction|barricade)s?|standstill', r'যানজট|রাস্তা বন্ধ|একমুখী|ডাইভারশন')),
    ('cabs', 'No cabs', B(r'no cabs?|cabs? not available|uber surge|surge pricing|(uber|ola|rapido) (not|unavailable|cancel\w*)|parking (full|chaos|nightmare)|metro (packed|chaos|crowd\w*|jam)', r'ক্যাব পাওয়া যাচ্ছে না|মেট্রোয় ভিড়')),
    ('power', 'Power cut', B(r'power cut|load ?shedding|blackout|bijli gone|current chole gech\w*', r'লোডশেডিং|বিদ্যুৎ নেই')),
]
WAIT = re.compile(r'(\d{1,3})\s*(min|mins|minutes|hours?|hrs?)', re.I)
NOT_LIVE = B(r'might|may|will|would|could|should|be wary|expect\w*|likely|forecast|predict\w*|tomorrow|next week|later this|last year|throwback|tips?|advice|guide|how to|plan(ning)? (your|to)|beware|avoid going|if you|in case|alert(s)? for|advisory|engineered|conspiracy|#\w*disrupts\w*|remember when|used to', r'হতে পারে|পূর্বাভাস|আগামীকাল|সম্ভাবনা')
AREAS = {  # area -> zone; Bengali spellings included
    'Behala': 'south', 'বেহালা': 'south', 'Chetla': 'south', 'চেতলা': 'south', 'Ballygunge': 'south', 'বালিগঞ্জ': 'south',
    'Gariahat': 'south', 'গড়িয়াহাট': 'south', 'Jadavpur': 'south', 'যাদবপুর': 'south', 'Tollygunge': 'south', 'টালিগঞ্জ': 'south',
    'Kalighat': 'south', 'কালীঘাট': 'south', 'Bhowanipore': 'south', 'Bhowanipur': 'south', 'ভবানীপুর': 'south', 'Rashbehari': 'south',
    'Lake Market': 'south', 'Deshapriya': 'south', 'Garia': 'south', 'Kasba': 'south', 'Naktala': 'south', 'Santoshpur': 'south', 'Hazra': 'south',
    'Park Street': 'central', 'পার্ক স্ট্রিট': 'central', 'Esplanade': 'central', 'Sealdah': 'central', 'শিয়ালদহ': 'central', 'College Street': 'central',
    'Bowbazar': 'central', 'Park Circus': 'central', 'Rajabazar': 'central', 'Maniktala': 'central', 'Moulali': 'central',
    'Shyambazar': 'north', 'শ্যামবাজার': 'north', 'Bagbazar': 'north', 'Baghbazar': 'north', 'বাগবাজার': 'north', 'Kumartuli': 'north', 'Kumortuli': 'north',
    'Lake Town': 'north', 'লেকটাউন': 'north', 'Baguiati': 'north', 'Salt Lake': 'north', 'Dum Dum': 'north', 'Ultadanga': 'north', 'Shobhabazar': 'north', 'Sovabazar': 'north',
}
_AREA = [(a, z, re.compile(r'(?<![A-Za-z])' + re.escape(a) + r'(?![A-Za-z])', re.I)) for a, z in AREAS.items()]
CANON = {'বেহালা': 'Behala', 'চেতলা': 'Chetla', 'বালিগঞ্জ': 'Ballygunge', 'গড়িয়াহাট': 'Gariahat', 'যাদবপুর': 'Jadavpur', 'টালিগঞ্জ': 'Tollygunge',
         'কালীঘাট': 'Kalighat', 'ভবানীপুর': 'Bhowanipore', 'Bhowanipur': 'Bhowanipore', 'পার্ক স্ট্রিট': 'Park Street', 'শিয়ালদহ': 'Sealdah',
         'শ্যামবাজার': 'Shyambazar', 'বাগবাজার': 'Bagbazar', 'Baghbazar': 'Bagbazar', 'Kumortuli': 'Kumartuli', 'লেকটাউন': 'Lake Town', 'Sovabazar': 'Shobhabazar'}

def classify(txt):
    """(kind, label) of the most actionable live signal in a post, or None."""
    t = re.sub(r'https?://\S+', '', txt)
    if NOT_LIVE.search(t): return None
    for kind, label, rx in KINDS:
        if rx.search(t):
            w = WAIT.search(t) if kind == 'queue' else None
            return kind, label + (f' · {w.group(1)} {w.group(2)} wait' if w else '')
    return None

def areas_in(txt):
    out = []
    for a, z, rx in _AREA:
        if rx.search(txt):
            c = CANON.get(a, a)
            if c not in [x for x, _ in out]: out.append((c, z))
    return out

def candidate(txt, author, at, url, pandal_ids):
    """One raw report, or None. pandal_ids = guide pandals named in the post."""
    if txt.startswith('RT @'): return None
    s = classify(txt)
    if not s: return None
    ar = areas_in(txt)
    if len(pandal_ids) == 1: place = ('pandal', pandal_ids[0])
    elif not pandal_ids and len(ar) == 1: place = ('area', ar[0][0])
    else: return None  # unplaced or ambiguous
    return {'kind': s[0], 'label': s[1], 'place': place[0], 'id': place[1], 'zone': ar[0][1] if place[0] == 'area' else None,
            'author': author.lower(), 'at': at, 'url': url}

def accept(cands, now):
    """Corroborated, recent signals keyed by (place, id). Newest report wins the link."""
    recent = [c for c in cands if 0 <= (now - dt.datetime.fromisoformat(c['at'].replace('Z', '+00:00'))).total_seconds() < WINDOW_H * 3600]
    groups = {}
    for c in recent: groups.setdefault((c['place'], c['id'], c['kind']), []).append(c)
    out = {}
    for (place, pid, kind), cs in groups.items():
        authors = {c['author'] for c in cs}
        if not (authors & CREDIBLE or len(authors) >= 2): continue
        best = max(cs, key=lambda c: c['at'])
        rank = [k for k, _, _ in KINDS].index(kind)
        cur = out.get((place, pid))
        if cur is None or rank < cur['_r']:
            out[(place, pid)] = {**best, 'n': len(authors), '_r': rank}
    return {k: {kk: vv for kk, vv in v.items() if kk != '_r'} for k, v in out.items()}
