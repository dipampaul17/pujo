"""X poller, budget-aware. Two modes:
  plan    -> pipeline/state/xplan.json : <=3 OR-batched queries for this run (rotation: top-ranked every run, rest by staleness)
  ingest FILE... -> parse raw search_posts_all results, keep strict matches, update pipeline/state/xlive.json
X calls themselves are made by the scheduled agent via the X connector (no X credential on the box).
Budget: 3 calls/run * 288 runs/day = 864 < 1000/day; 3/run << 30/min."""
import json, re, sys, os, math, datetime as dt
H=os.path.dirname(os.path.abspath(__file__)); ST=f'{H}/state'; os.makedirs(ST,exist_ok=True)
D=json.load(open(f'{H}/../src/data/dhaak.v1.json'))['pandals']
P=[p for p in D if p.get('lat')]
PASS=set(json.load(open(f'{H}/../src/data/passport.json'))['ids'])  # Pujor Passport pandals: searched every run
now=dt.datetime.now(dt.UTC)
def load(f,d):
    try: return json.load(open(f))
    except Exception: return d
live=load(f'{ST}/xlive.json',{'polled':{},'posts':{},'crowd':{},'open':{}})
sys.path.insert(0,H)
from aliases import aliases, hits as alias_hits, matches as alias_match
import signals as SIG
ALIAS={}  # legacy name kept for scoring below
def names(p): return aliases(p)
SEASON='2026-10-05T00:00:00Z'  # pre-Mahalaya: anything older is not a 2026 opening
OPEN_FLOOR='2026-10-10T00:00:00Z'  # Mahalaya 2026: no inauguration evidence counts before this
QMAX=1000  # X query length cap
FIELDS={'expansions':'attachments.media_keys,author_id','media.fields':'url,preview_image_url,type,width,height','user.fields':'username,name,profile_image_url','post.fields':'created_at,text,note_tweet,attachments,public_metrics'}
def q_of(ps,tail=' -is:retweet'):
    return '('+' OR '.join(f'"{n}"' for p in ps for n in names(p))+')'+tail
def pack(ps,tail=' -is:retweet'):
    """Greedy-pack pandals into OR-queries under QMAX chars."""
    out=[[]]
    for p in ps:
        if out[-1] and len(q_of(out[-1]+[p],tail))>QMAX: out.append([])
        out[-1].append(p)
    return [g for g in out if g]
INTENT=' (inaugurated OR inaugurates OR inauguration OR opened OR visited OR crowd OR queue OR darshan OR "pandal hopping" OR উদ্বোধন) -is:retweet'
SIGNAL_Q=('((Kolkata OR pandal OR pujo OR puja OR কলকাতা OR পুজো OR Behala OR Gariahat OR Ballygunge OR Kalighat OR Chetla OR Jadavpur OR Tollygunge OR Bhowanipore OR "Park Street" OR Sealdah OR Shyambazar OR "Lake Town" OR "Salt Lake") '
  '(crowd OR queue OR "long line" OR rush OR packed OR stampede OR barricade OR bheer OR bhir OR bhid OR ভিড় OR "লম্বা লাইন" OR "road closed" OR diversion OR "one way" OR jaam OR যানজট OR waterlogging OR brishti OR বৃষ্টি OR "jol jomeche" OR "no cabs" OR "uber surge" OR "power cut" OR "entry closed" OR "gate closed")'
  ' OR from:KPTrafficDept OR from:KolkataPolice) -is:retweet')
# Wide openings search, not tied to known names: English, Bengali, Banglish. Window overlaps the 10-min cadence.
WIDE_MIN=30
WIDE_Q=('((inaugurated OR inaugurates OR inauguration OR udbodhon OR "udbodhon holo" OR উদ্বোধন OR উদ্বোধনে OR "pandal open" OR "pandal opened" OR "opened to public" OR "open for visitors" OR "khule geche")'
  ' (Kolkata OR Calcutta OR কলকাতা OR "durga puja" OR "durga pujo" OR দুর্গাপুজো OR দুর্গাপূজা OR pandal OR pujo OR পুজো)) -is:retweet')
def plan(n=3):
    """Run plan: q1 = top-ranked (last 24h, for fresh photos/crowd); q2..n = stalest pandals packed densely,
    searched back to SEASON so an opening is caught even if nobody posted in the last day. Open pandals that
    are already confirmed are deprioritised for discovery (their evidence is sticky)."""
    top=sorted(P,key=lambda p:-(p.get('worth') or 0))[:6]
    opened=set(live.get('open',{}))|set(k for k in load(f'{H}/raw/x_status.json',{}) if not k.startswith('_'))
    leads={k for k in load(f'{H}/raw/news_leads.json',{}) if not k.startswith('_')}  # news says inaugurated: confirm on X first
    stale=lambda p:(p['id'] not in leads,live['polled'].get(p['id'],''),p['id'] in opened)
    pas=sorted([p for p in P if p not in top and p['id'] in PASS],key=stale)
    rest=sorted([p for p in P if p not in top and p['id'] not in PASS],key=stale)
    since=(now-dt.timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')
    k=int(now.timestamp()//300)%2  # alternate discovery flavour per run: opening/visit words, or any photo post
    tail=INTENT if k==0 else ' (puja OR pujo OR pandal OR durga OR দুর্গা OR পুজো) has:images -is:retweet'
    tq=' OR '.join(f'from:{h}' for h in sorted(TRUSTED|INAUGURATORS))
    # slot 1: top + trusted visitors; slot 2: stalest pass pandals (every run); slot 3: stalest of the rest,
    # except every other run, when slot 3 is the live street-signal query.
    # Two-run cycle, 3 calls each. Even run: top+trusted visitors, pass pandals, WIDE openings search.
    # Odd run: stalest other pandals, pass pandals, live street signals. Pass pandals are searched every run.
    q=lambda g,st,t,trusted=False:{'ids':[p['id'] for p in g],'args':{'query':(q_of(g,t)[:-len(t)]+' OR '+tq+')'+t).replace('(','((',1) if trusted else q_of(g,t),'max_results':25,'sort_order':'recency','start_time':st,**FIELDS}}
    pq=[q(g,OPEN_FLOOR,tail) for g in pack(pas,tail)[:1]]
    if k==0:
        qs=[q(top,since,' -is:retweet',True)]+pq+[{'ids':[],'kind':'wide','args':{'query':WIDE_Q,'max_results':50,'sort_order':'recency','start_time':(now-dt.timedelta(minutes=WIDE_MIN)).strftime('%Y-%m-%dT%H:%M:%SZ'),**FIELDS}}]
    else:
        qs=[q(g,OPEN_FLOOR,tail) for g in pack(rest,tail)[:1]]+pq+[{'ids':[],'kind':'signal','args':{'query':SIGNAL_Q,'max_results':25,'sort_order':'recency','start_time':(now-dt.timedelta(hours=SIG.WINDOW_H)).strftime('%Y-%m-%dT%H:%M:%SZ'),**FIELDS}}]
    qs=qs[:n]
    json.dump({'at':now.isoformat(),'queries':qs},open(f'{ST}/xplan.json','w'),indent=1,ensure_ascii=False); print(json.dumps(qs,ensure_ascii=False)); return qs
PROMO=re.compile(r'\b(offer|discount|sale|book now|giveaway|sponsor|promo|ad\b|link in bio|watch live|subscribe|tickets?|to arrive|will inaugurate|to inaugurate|scheduled|throwback|last year|2025|2024|#tbt|AI generated|AI art|how to reach|walking route|route guide|kivabe)\b',re.I)
OPEN=re.compile(r'(\b(inaugurat(ed|es|ing|ion)|opened|open (for|to) (the )?(public|visitors)|crowds?|queues?|visited|visiting|darshan|pandal[- ]hopping|thronged|footfall|(the )?pandal (was|is|looks)|we went|i went)\b|\budbodhon (holo|hoye gelo|korlen|korlo)\b|উদ্বোধন (করলেন|করেন|হল|হলো)|উদ্বোধনে|উদ্বোধনী|ভিড়)',re.I)
FUTURE=re.compile(r'\b(to (be )?inaugurat\w*|will (be )?(inaugurat\w*|open)|set to|scheduled|upcoming|countdown|days? to go|coming soon|last year|throwback|#tbt|(puja|pujo|durgapuja)\s?202[0-5]|will be open|opens? on|open for public \d|khuti|getting ready|still wip|wip|work in progress|walking route|route guide|how to reach|durga temple|mandir darshan|কীভাবে|khuti puja|kathamo|under construction|being built|preparation|preparing|work in progress)\b|উদ্বোধন করবেন|খুঁটি পুজো',re.I)
CTX=re.compile(r'puja|pujo|pandal|durga|kolkata|calcutta|দুর্গা|পুজো|পূজা|মণ্ডপ',re.I)
def open_hits(txt,c):
    """Pandals a post proves are open: dated >= SEASON, past-tense opening/visit language, no future/old framing.
    News lists ("inaugurated X and Y") may name several pandals."""
    if c<dt.datetime.fromisoformat(OPEN_FLOOR.replace('Z','+00:00')) or FUTURE.search(txt) or not OPEN.search(txt) or not (CTX.search(txt) or re.search(r'\bvisited\b',txt,re.I)): return []
    h=alias_hits(P,txt)
    return h if len(h)==1 or re.search(r'inaugurat|উদ্বোধন',txt,re.I) else []
VISIT=re.compile(r'\b(today|tonight|this evening|right now|just (went|visited)|went to|visited|we are at|at the pandal|first day|i am at)\b',re.I)
BOTS={'grok','threadreaderapp','pikaso_me'}
# Hand-vetted visitors who post first-hand pandal visits ("📍 <pandal>" + own photos). One pinned pandal + photo + no future framing = a visit.
TRUSTED={'abasu4ever','sudhanidhib',
  'an1sh123','goonereol','indicontractor','_epinephrine_'}  # _Epinephrine_ (vetted 14 Oct): personal '📍 <pandal>' thread with own photos (Tridhara, Singhi Park, Ballygunge Cultural, Badamtala, Hindustan Park); goonereol (vetted 13 Oct): personal pandal-hopping thread with own photos (Telipukur, Tala, Nalin Sarkar, Barisha, Dum Dum Park Bharat Chakra); an1sh123 (vetted 13 Oct): personal account, numbered '#N <pandal>' first-hand reviews with own photos, critical not promo; IndiContractor (vetted 13 Oct): 📍 <pandal> + own video visits (Ballygunge Cultural, Tala Barowari, Nalin Sarkar Street)
# Inauguration sources: the CM and his office post dated '📍 <pandal>' lists of pujas he inaugurated. Searched every
# even run inside the trusted-visitor slot (no extra X call).
INAUGURATORS={'suvenduwb','cmowbgov'}  # '📍 <pandal>' threads; '#N Visited <pandal>' series
def trusted_visit(u,txt,has_photo,c):
    return u.lower() in TRUSTED and has_photo and (txt.lstrip().startswith('📍') or re.match(r'\s*#\d+\s+(visited\b)?',txt,re.I)) and c>=dt.datetime.fromisoformat(OPEN_FLOOR.replace('Z','+00:00')) and not FUTURE.search(re.sub(r'\b(19|20)\d\d\b','',txt))
QUEUE=re.compile(r'\b(queue|long line|waiting line)\b(?:.{0,30}?(\d{1,3})\s*(min|mins|minutes|hours?|hrs?))?',re.I)
CLOSED=re.compile(r'\b(entry (closed|stopped|suspended)|closed for (the )?public|pandal (closed|shut)|gates? closed)\b',re.I)
TRAFFIC=re.compile(r'\b(traffic jam|road (closed|blocked)|diversion|gridlock|no[- ]entry)\b',re.I)
CROWD=re.compile(r'\b(crowd(ed)?|queue|long line|packed|jam[- ]?packed|huge rush|overflow\w*)\b',re.I)
KOL=re.compile(r'kolkata|calcutta|কলকাতা|howrah|হাওড়া|salt ?lake|new ?town|behala|dum ?dum|south kolkata|north kolkata',re.I)
CNAME=re.compile(r"\b((?:[A-Z0-9][\w'.&-]*\s){0,4}(?:Sarbojanin|Sarbajanin|Sarbojonin|Club|Sangha|Sangh|Samity|Samiti|Pally|Palli|Park|Square|Sammilani|Durgotsab|Durgotsav|Rajbari))\b")
CANDS=f'{H}/raw/x_candidates.json'
def CAND_OK(txt,c,u):
    return (c>=dt.datetime.fromisoformat(OPEN_FLOOR.replace('Z','+00:00')) and not txt.startswith('@') and u.lower() not in BOTS
            and re.search(r'inaugurat|উদ্বোধন|udbodhon|pandal open|opened',txt,re.I) and KOL.search(txt) and not FUTURE.search(txt) and not alias_hits(P,txt))
def cand(txt,c,u,xid):
    """Unmatched Kolkata opening: log for a human, never add to the app."""
    d=load(CANDS,{'_':'Openings on X naming no app pandal. Review only; nothing here is shown in the app.','items':[]})
    url=f'https://x.com/{u}/status/{xid}'
    if any(i['url']==url for i in d['items']): return
    names=sorted({m.strip() for m in CNAME.findall(txt) if m.strip().lower() not in {'park','club','square'}})
    d['items'].append({'at':c.isoformat(),'url':url,'names':names,'text':re.sub(r'\s+',' ',txt)[:240]})
    d['items']=d['items'][-500:]; json.dump(d,open(CANDS,'w'),ensure_ascii=False,indent=1)
def ingest(files):
    for f in files:
        try: t=open(f).read(); d=json.loads(t[t.find('{'):t.rfind('}')+1])
        except Exception as e: print('skip',f,e); continue
        if not isinstance(d,dict): continue
        media={m['media_key']:m for m in d.get('includes',{}).get('media',[])}; users={u['id']:u for u in d.get('includes',{}).get('users',[])}
        for p in P: live['polled'][p['id']]=live['polled'].get(p['id'],'')
        for x in sorted(d.get('data',[]),key=lambda x:x['created_at']):
            txt=(x.get('note_tweet') or {}).get('text') or x['text']; c=dt.datetime.fromisoformat(x['created_at'].replace('Z','+00:00'))
            if c.year!=2026 or txt.startswith('RT @'): continue
            u0=users.get(x.get('author_id'),{}).get('username','i')
            if not txt.startswith('@') and u0.lower() not in BOTS:
                for p in open_hits(txt,c):
                    if p['id'] not in live['open']:
                        live['open'][p['id']]={'since':c.date().isoformat(),'evidence':f"https://x.com/{u0}/status/{x['id']}",'note':re.sub(r'\s+',' ',re.sub(r'https://t\.co/\S+','',txt)).strip()[:140]}
            if CAND_OK(txt,c,u0): cand(txt,c,u0,x['id'])
            hit0=alias_hits(P,txt); ph0=any(media.get(k,{}).get('type')=='photo' for k in x.get('attachments',{}).get('media_keys',[]))
            tv=len(hit0)==1 and trusted_visit(u0,txt,ph0,c)
            if tv and hit0[0]['id'] not in live['open']:
                live['open'][hit0[0]['id']]={'since':c.date().isoformat(),'evidence':f"https://x.com/{u0}/status/{x['id']}",'note':'Visited (@'+u0+', with photos): '+re.sub(r'\s+',' ',re.sub(r'https://t\.co/\S+','',txt)).strip()[:110]}
            if not txt.startswith('@') and u0.lower() not in BOTS:
                cd=SIG.candidate(txt,u0,x['created_at'],f"https://x.com/{u0}/status/{x['id']}",[p['id'] for p in hit0])
                if cd and cd['url'] not in {q['url'] for q in live.setdefault('sigc',[])}: live['sigc'].append(cd)
            if not tv and (txt.startswith('@') or PROMO.search(txt)) or re.search(r'\btemple\b|mandir darshan',txt,re.I): continue  # replies are chatter, not reports
            hit=alias_hits(P,txt)
            if len(hit)!=1: continue  # ambiguous multi-pandal posts never get a photo
            p=hit[0]; u=users.get(x.get('author_id'),{}); pid=p['id']
            if u.get('username','').lower() in BOTS: continue
            ph=[media[k] for k in x.get('attachments',{}).get('media_keys',[]) if k in media and media[k].get('type')=='photo' and media[k].get('url','').startswith('https://pbs.twimg.com/')]
            if not u.get('username'): continue
            m=x.get('public_metrics',{}); eng=m.get('like_count',0)+2*m.get('retweet_count',0)
            age=(now-c).total_seconds()/3600
            score=(3 if alias_match(p,txt) else 2) \
                  +(3 if VISIT.search(txt) else 0)+(2 if ph or any(m.get('preview_image_url') for m in [media.get(k,{}) for k in x.get('attachments',{}).get('media_keys',[])]) else 0)+(2 if age<6 else 1 if age<24 else 0)+min(2,math.log10(1+eng))
            nonlatin=sum(1 for ch in txt if ord(ch)>0x24F and ch.isalpha())/max(1,sum(ch.isalpha() for ch in txt))
            if not tv and (score<6 or not VISIT.search(txt) or nonlatin>0.15): continue  # first-hand visit, English text only
            clean=re.sub(r'[ \t]*\n\s*',' ',re.sub(r'[\u0900-\u09FF]+[^\nA-Za-z]*','',re.sub(r'https://t\.co/\S+','',txt))).strip()  # English only on screen
            item={'id':x['id'],'at':x['created_at'],'handle':u['username'],'avatar':u.get('profile_image_url',''),'score':round(score,2),
                  'text':clean if len(clean)<=280 else clean[:280].rsplit(' ',1)[0]+'…','url':f"https://x.com/{u['username']}/status/{x['id']}"}
            big=lambda u:u.split('?')[0]+'?format='+(u.rsplit('.',1)[-1].split('?')[0] if '.' in u.rsplit('/',1)[-1] else 'jpg')+'&name=large'
            allm=[media[k] for k in x.get('attachments',{}).get('media_keys',[]) if k in media]
            pics=[{'src':big(m.get('url') or m.get('preview_image_url')),'w':m.get('width'),'h':m.get('height'),'video':m.get('type')!='photo'} for m in allm if (m.get('url') or m.get('preview_image_url') or '').startswith('https://pbs.twimg.com/')][:4]
            if pics: item.update(photo=pics[0]['src'],w=pics[0]['w'],h=pics[0]['h'],media=pics)
            lst=[q for q in live['posts'].get(pid,[]) if isinstance(q,dict)] if isinstance(live['posts'].get(pid),list) else []
            key=re.sub(r'\W+','',clean.lower())[:60]
            if any(q['id']==item['id'] or q['handle']==item['handle'] or re.sub(r'\W+','',q['text'].lower())[:60]==key for q in lst): continue
            live['posts'][pid]=sorted(lst+[item],key=lambda q:(-q['score'],q['at']),reverse=False)[:3]
    for v in live['posts'].values():
        for q in v:
            if q.get('photo') and '?' not in q['photo']: q['photo']=q['photo']+'?format='+q['photo'].rsplit('.',1)[-1]+'&name=large'
    stamp=now.isoformat()
    for f in files: pass
    plan_ids=load(f'{ST}/xplan.json',{'queries':[]})['queries']
    for q in plan_ids:
        for i in q['ids']: live['polled'][i]=stamp
    # live signals: keep raw reports for the window, publish only corroborated ones
    live['sigc']=[q for q in live.get('sigc',[]) if (now-dt.datetime.fromisoformat(q['at'].replace('Z','+00:00'))).total_seconds()<SIG.WINDOW_H*3600]
    acc=SIG.accept(live['sigc'],now)
    live['crowd']={i:{k:v[k] for k in ('kind','label','at','url','n')} for (pl,i),v in acc.items() if pl=='pandal'}
    live['area']=[{k:v[k] for k in ('kind','label','at','url','n','zone')}|{'area':i} for (pl,i),v in acc.items() if pl=='area']
    fresh=lambda q:(now-dt.datetime.fromisoformat(q['at'].replace('Z','+00:00'))).total_seconds()<48*3600
    live['posts']={k:[q for q in v if fresh(q)] for k,v in live['posts'].items() if isinstance(v,list)}
    live['posts']={k:v for k,v in live['posts'].items() if v}
    json.dump(live,open(f'{ST}/xlive.json','w'),ensure_ascii=False,indent=1)
    print('posts',list(live['posts']),'crowd',list(live['crowd']),'open',list(live['open']))
if __name__=='__main__':
    plan() if sys.argv[1]=='plan' else ingest(sys.argv[2:])
