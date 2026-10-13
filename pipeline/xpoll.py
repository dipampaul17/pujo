"""X poller, budget-aware. Two modes:
  plan    -> pipeline/state/xplan.json : <=3 OR-batched queries for this run (rotation: top-ranked every run, rest by staleness)
  ingest FILE... -> parse raw search_posts_all results, keep strict matches, update pipeline/state/xlive.json
X calls themselves are made by the scheduled agent via the X connector (no X credential on the box).
Budget: 3 calls/run * 288 runs/day = 864 < 1000/day; 3/run << 30/min."""
import json, re, sys, os, math, datetime as dt
H=os.path.dirname(os.path.abspath(__file__)); ST=f'{H}/state'; os.makedirs(ST,exist_ok=True)
D=json.load(open(f'{H}/../src/data/dhaak.v1.json'))['pandals']
P=[p for p in D if p.get('lat')]
now=dt.datetime.now(dt.UTC)
def load(f,d):
    try: return json.load(open(f))
    except Exception: return d
live=load(f'{ST}/xlive.json',{'polled':{},'posts':{},'crowd':{},'open':{}})
sys.path.insert(0,H)
from aliases import aliases, hits as alias_hits, matches as alias_match
ALIAS={}  # legacy name kept for scoring below
def names(p): return aliases(p)
SEASON='2026-10-05T00:00:00Z'  # pre-Mahalaya: anything older is not a 2026 opening
OPEN_FLOOR='2026-10-10T00:00:00Z'  # Mahalaya 2026: no inauguration evidence counts before this
QMAX=1000  # X query length cap
FIELDS={'expansions':'attachments.media_keys,author_id','media.fields':'url,preview_image_url,type,width,height','user.fields':'username,name,profile_image_url','post.fields':'created_at,text,attachments,public_metrics'}
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
def plan(n=3):
    """Run plan: q1 = top-ranked (last 24h, for fresh photos/crowd); q2..n = stalest pandals packed densely,
    searched back to SEASON so an opening is caught even if nobody posted in the last day. Open pandals that
    are already confirmed are deprioritised for discovery (their evidence is sticky)."""
    top=sorted(P,key=lambda p:-(p.get('worth') or 0))[:6]
    opened=set(live.get('open',{}))|set(k for k in load(f'{H}/raw/x_status.json',{}) if not k.startswith('_'))
    rest=sorted([p for p in P if p not in top],key=lambda p:(live['polled'].get(p['id'],''),p['id'] in opened))
    since=(now-dt.timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')
    k=int(now.timestamp()//300)%2  # alternate discovery flavour per run: opening/visit words, or any photo post
    tail=INTENT if k==0 else ' (puja OR pujo OR pandal OR durga OR দুর্গা OR পুজো) has:images -is:retweet'
    groups=[(top,since,' -is:retweet')]+[(g,OPEN_FLOOR,tail) for g in pack(rest,tail)[:n-1]]
    qs=[{'ids':[p['id'] for p in g],'args':{'query':q_of(g,t),'max_results':25,'sort_order':'recency','start_time':st,**FIELDS}} for g,st,t in groups]
    json.dump({'at':now.isoformat(),'queries':qs},open(f'{ST}/xplan.json','w'),indent=1,ensure_ascii=False); print(json.dumps(qs,ensure_ascii=False)); return qs
PROMO=re.compile(r'\b(offer|discount|sale|book now|giveaway|sponsor|promo|ad\b|link in bio|watch live|subscribe|tickets?|to arrive|will inaugurate|to inaugurate|scheduled|throwback|last year|2025|2024|#tbt|AI generated|AI art|how to reach|walking route|route guide|kivabe)\b',re.I)
OPEN=re.compile(r'(\b(inaugurat(ed|es|ing|ion)|opened|open (for|to) (the )?(public|visitors)|crowds?|queues?|visited|visiting|darshan|pandal[- ]hopping|thronged|footfall|(the )?pandal (was|is|looks)|we went|i went)\b|উদ্বোধন (করলেন|করেন|হল|হলো)|উদ্বোধনে|ভিড়)',re.I)
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
QUEUE=re.compile(r'\b(queue|long line|waiting line)\b(?:.{0,30}?(\d{1,3})\s*(min|mins|minutes|hours?|hrs?))?',re.I)
CLOSED=re.compile(r'\b(entry (closed|stopped|suspended)|closed for (the )?public|pandal (closed|shut)|gates? closed)\b',re.I)
TRAFFIC=re.compile(r'\b(traffic jam|road (closed|blocked)|diversion|gridlock|no[- ]entry)\b',re.I)
CROWD=re.compile(r'\b(crowd(ed)?|queue|long line|packed|jam[- ]?packed|huge rush|overflow\w*)\b',re.I)
def ingest(files):
    for f in files:
        try: t=open(f).read(); d=json.loads(t[t.find('{'):t.rfind('}')+1])
        except Exception as e: print('skip',f,e); continue
        if not isinstance(d,dict): continue
        media={m['media_key']:m for m in d.get('includes',{}).get('media',[])}; users={u['id']:u for u in d.get('includes',{}).get('users',[])}
        for p in P: live['polled'][p['id']]=live['polled'].get(p['id'],'')
        for x in sorted(d.get('data',[]),key=lambda x:x['created_at']):
            txt=x['text']; c=dt.datetime.fromisoformat(x['created_at'].replace('Z','+00:00'))
            if c.year!=2026 or txt.startswith('RT @'): continue
            u0=users.get(x.get('author_id'),{}).get('username','i')
            if not txt.startswith('@') and u0.lower() not in BOTS:
                for p in open_hits(txt,c):
                    if p['id'] not in live['open']:
                        live['open'][p['id']]={'since':c.date().isoformat(),'evidence':f"https://x.com/{u0}/status/{x['id']}",'note':re.sub(r'\s+',' ',re.sub(r'https://t\.co/\S+','',txt)).strip()[:140]}
            if txt.startswith('@') or PROMO.search(txt) or re.search(r'\btemple\b|mandir darshan',txt,re.I): continue  # replies are chatter, not reports
            hit=alias_hits(P,txt)
            if len(hit)!=1: continue  # ambiguous multi-pandal posts never get a photo
            p=hit[0]; u=users.get(x.get('author_id'),{}); pid=p['id']
            if u.get('username','').lower() in BOTS: continue
            if (now-c).total_seconds()<3*3600:
                url=f"https://x.com/{u.get('username','i')}/status/{x['id']}"
                q=QUEUE.search(txt)
                for kind,rx,label in (('closed',CLOSED,'Entry closed'),('queue',QUEUE,'Long queue'),('crowd',CROWD,'Crowded'),('traffic',TRAFFIC,'Traffic nearby')):
                    if rx.search(txt):
                        live['crowd'][pid]={'kind':kind,'label':label+(f' · {q.group(2)} {q.group(3)} wait' if kind=='queue' and q and q.group(2) else ''),'at':x['created_at'],'url':url}; break
            ph=[media[k] for k in x.get('attachments',{}).get('media_keys',[]) if k in media and media[k].get('type')=='photo' and media[k].get('url','').startswith('https://pbs.twimg.com/')]
            if not u.get('username'): continue
            m=x.get('public_metrics',{}); eng=m.get('like_count',0)+2*m.get('retweet_count',0)
            age=(now-c).total_seconds()/3600
            score=(3 if alias_match(p,txt) else 2) \
                  +(3 if VISIT.search(txt) else 0)+(2 if ph or any(m.get('preview_image_url') for m in [media.get(k,{}) for k in x.get('attachments',{}).get('media_keys',[])]) else 0)+(2 if age<6 else 1 if age<24 else 0)+min(2,math.log10(1+eng))
            nonlatin=sum(1 for ch in txt if ord(ch)>0x24F and ch.isalpha())/max(1,sum(ch.isalpha() for ch in txt))
            if score<6 or not VISIT.search(txt) or nonlatin>0.15: continue  # first-hand visit, English text only
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
    # expire: crowd >3h, posts >48h
    live['crowd']={k:v for k,v in live['crowd'].items() if (now-dt.datetime.fromisoformat(v['at'].replace('Z','+00:00'))).total_seconds()<3*3600}
    fresh=lambda q:(now-dt.datetime.fromisoformat(q['at'].replace('Z','+00:00'))).total_seconds()<48*3600
    live['posts']={k:[q for q in v if fresh(q)] for k,v in live['posts'].items() if isinstance(v,list)}
    live['posts']={k:v for k,v in live['posts'].items() if v}
    json.dump(live,open(f'{ST}/xlive.json','w'),ensure_ascii=False,indent=1)
    print('posts',list(live['posts']),'crowd',list(live['crowd']),'open',list(live['open']))
if __name__=='__main__':
    plan() if sys.argv[1]=='plan' else ingest(sys.argv[2:])
