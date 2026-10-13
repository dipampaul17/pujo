"""X poller, budget-aware. Two modes:
  plan    -> pipeline/state/xplan.json : <=3 OR-batched queries for this run (rotation: top-ranked every run, rest by staleness)
  ingest FILE... -> parse raw search_posts_all results, keep strict matches, update pipeline/state/xlive.json
X calls themselves are made by the scheduled agent via the X connector (no X credential on the box).
Budget: 3 calls/run * 288 runs/day = 864 < 1000/day; 3/run << 30/min."""
import json, re, sys, os, datetime as dt
H=os.path.dirname(os.path.abspath(__file__)); ST=f'{H}/state'; os.makedirs(ST,exist_ok=True)
D=json.load(open(f'{H}/../src/data/dhaak.v1.json'))['pandals']
P=[p for p in D if p.get('lat')]
now=dt.datetime.now(dt.UTC)
def load(f,d):
    try: return json.load(open(f))
    except Exception: return d
live=load(f'{ST}/xlive.json',{'polled':{},'posts':{},'crowd':{},'open':{}})
def short(n):  # searchable distinctive name
    n=re.sub(r'\b(Sarbojanin|Sarbajanin|Durgotsab|Samity|Samiti|Club|Committee|Sangha)\b','',n,flags=re.I)
    return re.sub(r'\s+',' ',n.split('/')[0]).strip()
ALIAS={'sree-bhumi-sporting-club':['Sreebhumi','Sree Bhumi'],'santosh-mitra-square':['Santosh Mitra Square']}
def names(p): return ALIAS.get(p['id'],[short(p['name'])])
def plan():
    top=sorted(P,key=lambda p:-(p.get('worth') or 0))[:6]
    rest=sorted([p for p in P if p not in top],key=lambda p:live['polled'].get(p['id'],''))[:16]
    groups=[top,rest[:8],rest[8:16]]
    since=(now-dt.timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')
    qs=[]
    for g in groups:
        terms=' OR '.join(f'"{n}"' for p in g for n in names(p))
        qs.append({'ids':[p['id'] for p in g],'args':{'query':f'({terms}) -is:retweet -is:quote','max_results':25,'sort_order':'recency','start_time':since,
          'expansions':'attachments.media_keys,author_id','media.fields':'url,preview_image_url,type,width,height','user.fields':'username,name,profile_image_url','post.fields':'created_at,text,attachments'}})
    json.dump({'at':now.isoformat(),'queries':qs},open(f'{ST}/xplan.json','w'),indent=1); print(json.dumps(qs))
PROMO=re.compile(r'\b(offer|discount|sale|book now|giveaway|sponsor|promo|ad\b|link in bio|watch live|subscribe|tickets?|to arrive|will inaugurate|to inaugurate|scheduled|throwback|last year|2025|2024|#tbt|AI generated|AI art)\b',re.I)
OPEN=re.compile(r'\b(inaugurat\w*|opened|open for (the )?public|crowd|queue|visited|visiting|pandal hopping|darshan)\b',re.I)
VISIT=re.compile(r'\b(today|tonight|this evening|right now|just (went|visited)|went to|visited|we are at|at the pandal|first day|i am at)\b',re.I)
CROWD=re.compile(r'\b(crowd(ed)?|queue|long line|packed|jam[- ]?packed|huge rush|overflow\w*)\b',re.I)
def ingest(files):
    for f in files:
        t=open(f).read(); d=json.loads(t[t.find('{'):t.rfind('}')+1])
        media={m['media_key']:m for m in d.get('includes',{}).get('media',[])}; users={u['id']:u for u in d.get('includes',{}).get('users',[])}
        for p in P: live['polled'][p['id']]=live['polled'].get(p['id'],'')
        for x in sorted(d.get('data',[]),key=lambda x:x['created_at']):
            txt=x['text']; c=dt.datetime.fromisoformat(x['created_at'].replace('Z','+00:00'))
            if c.year!=2026 or txt.startswith('RT @') or PROMO.search(txt): continue
            hit=[p for p in P if any(re.search(r'\b'+re.escape(n)+r'\b',txt,re.I) for n in names(p))]
            if len(hit)!=1: continue  # ambiguous multi-pandal posts never get a photo
            p=hit[0]; u=users.get(x.get('author_id'),{}); pid=p['id']
            if OPEN.search(txt): live['open'][pid]={'since':c.date().isoformat(),'evidence':x['url'] if 'url' in x else f"https://x.com/i/status/{x['id']}",'note':'Visitor/ news post on X'}
            if CROWD.search(txt) and (now-c).total_seconds()<3*3600: live['crowd'][pid]={'at':x['created_at'],'url':f"https://x.com/{u.get('username','i')}/status/{x['id']}"}
            ph=[media[k] for k in x.get('attachments',{}).get('media_keys',[]) if k in media and media[k].get('type')=='photo' and media[k].get('url','').startswith('https://pbs.twimg.com/')]
            if ph and u.get('username') and VISIT.search(txt):
                live['posts'][pid]={'id':x['id'],'at':x['created_at'],'handle':u['username'],'name':u.get('name',''),'avatar':u.get('profile_image_url',''),
                  'text':(lambda s:s if len(s)<=140 else s[:140].rsplit(' ',1)[0]+'…')(re.sub(r'https://t\.co/\S+','',txt).strip()),'photo':ph[0]['url'],'w':ph[0].get('width'),'h':ph[0].get('height'),'url':f"https://x.com/{u['username']}/status/{x['id']}"}
    stamp=now.isoformat()
    for f in files: pass
    plan_ids=load(f'{ST}/xplan.json',{'queries':[]})['queries']
    for q in plan_ids:
        for i in q['ids']: live['polled'][i]=stamp
    # expire: crowd >3h, posts >48h
    live['crowd']={k:v for k,v in live['crowd'].items() if (now-dt.datetime.fromisoformat(v['at'].replace('Z','+00:00'))).total_seconds()<3*3600}
    live['posts']={k:v for k,v in live['posts'].items() if (now-dt.datetime.fromisoformat(v['at'].replace('Z','+00:00'))).total_seconds()<48*3600}
    json.dump(live,open(f'{ST}/xlive.json','w'),ensure_ascii=False,indent=1)
    print('posts',list(live['posts']),'crowd',list(live['crowd']),'open',list(live['open']))
if __name__=='__main__':
    plan() if sys.argv[1]=='plan' else ingest(sys.argv[2:])
