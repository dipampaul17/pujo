"""Pinned posts: the X posts behind each pandal's open-status evidence, plus every post ever shown.
Built only from saved X results (live-runs/*.json), no API calls. Never expires; merged, never overwritten.
  pinned.py [STATUS_JSON]  -> updates pipeline/state/pinned.json"""
import json, os, re, glob, sys
H=os.path.dirname(os.path.abspath(__file__)); ST=f'{H}/state'; RUNS=f'{H}/../live-runs'
CAP=4
def load(f,d):
    try: return json.load(open(f))
    except Exception: return d
def big(u): return u.split('?')[0]+'?format='+(u.rsplit('.',1)[-1].split('?')[0] if '.' in u.rsplit('/',1)[-1] else 'jpg')+'&name=large'
def index():
    tw={}
    for f in sorted(glob.glob(f'{RUNS}/*.json')):
        t=open(f).read()
        try: d=json.loads(t[t.find('{'):t.rfind('}')+1])
        except Exception: continue
        media={m['media_key']:m for m in d.get('includes',{}).get('media',[])}; users={u['id']:u for u in d.get('includes',{}).get('users',[])}
        for x in d.get('data',[]): tw[x['id']]=(x,media,users)
    return tw
def item(x,media,users):
    u=users.get(x.get('author_id'),{})
    if not u.get('username'): return None
    clean=re.sub(r'[ \t]*\n\s*',' ',re.sub(r'[\u0900-\u09FF]+[^\nA-Za-z]*','',re.sub(r'https://t\.co/\S+','',x['text']))).strip()
    clean=re.sub(r'^(@\w+\s*)+','',clean)
    it={'id':x['id'],'at':x['created_at'],'handle':u['username'],'avatar':u.get('profile_image_url',''),'score':99,'evidence':True,
        'text':clean if len(clean)<=280 else clean[:280].rsplit(' ',1)[0]+'…','url':f"https://x.com/{u['username']}/status/{x['id']}"}
    pics=[{'src':big(m.get('url') or m.get('preview_image_url')),'w':m.get('width'),'h':m.get('height'),'video':m.get('type')!='photo'}
          for m in (media.get(k) for k in x.get('attachments',{}).get('media_keys',[])) if m and (m.get('url') or m.get('preview_image_url') or '').startswith('https://pbs.twimg.com/')][:4]
    if pics: it.update(photo=pics[0]['src'],w=pics[0]['w'],h=pics[0]['h'],media=pics)
    return it
def merge(a,b,cap=CAP):
    out,seen=[],set()
    for q in a+b:
        if q['id'] in seen: continue
        seen.add(q['id']); out.append(q)
    return out[:cap]
if __name__=='__main__':
    st=load(sys.argv[1] if len(sys.argv)>1 else f'{H}/../public/live/status.json',{}).get('open',{})
    xl=load(f'{ST}/xlive.json',{}).get('posts',{})
    pin=load(f'{ST}/pinned.json',{}); tw=index()
    for pid,v in st.items():
        m=re.search(r'/status/(\d+)',v.get('evidence') or '')
        if m and m.group(1) in tw and v.get('kind')!='official':
            it=item(*tw[m.group(1)])
            if it: pin[pid]=merge([it],pin.get(pid,[]))
    tr={k:v for k,v in load(f'{H}/raw/x_trusted.json',{}).items() if not k.startswith('_')}
    for pid,ids in tr.items():  # hand-checked first-hand visit posts from trusted visitors
        its=[it for it in (item(*tw[i]) for i in ids if i in tw) if it]
        if its: pin[pid]=merge([q for q in pin.get(pid,[]) if q.get('evidence')][:1]+its,pin.get(pid,[]))
    for pid,v in xl.items():  # anything once shown stays (live list fills remaining slots)
        pin[pid]=merge(pin.get(pid,[]),[dict(q,score=q.get('score',0)) for q in v])
    json.dump(pin,open(f'{ST}/pinned.json','w'),ensure_ascii=False,indent=1)
    print({k:len(v) for k,v in pin.items()})
