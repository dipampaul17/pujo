"""Step 1: parse the PDF text into pandals with station/area/circuit tags. Deterministic."""
import json, re, sys
t = open(sys.argv[1]).read().replace('\u200b','')
lines=[l.strip() for l in t.splitlines()]
def norm(s): return re.sub(r'[^a-z0-9]','',s.lower())
pandals={}
def add(name, **tags):
    name=name.strip(' ●→↓');
    if not name: return
    k=norm(name); p=pandals.setdefault(k,{"name":name,"stations":[],"circuits":[],"line":None})
    for f,v in tags.items():
        if f in("stations","circuits"):
            if v and v not in p[f]: p[f].append(v)
        elif v: p[f]=v
# metro section
a=next(i for i,l in enumerate(lines) if l.startswith('🚇 7.')); b=next(i for i,l in enumerate(lines) if l.startswith('🔄'))
station=None; line='blue'
SKIP=re.compile(r'(Useful for|Use this|^surrounding|Metro can|This is|especially|One of the|This belt|You can|^\W)',re.I)
for l in lines[a:b]:
    if not l: continue
    if 'GREEN LINE' in l: line='green'
    if l.startswith('🚇') or l.startswith('🟢') or l.startswith('🔵'): continue
    if l.isupper() and len(l)>2: station=l.title().replace('Mg Road','MG Road'); continue
    if SKIP.search(l) or l.endswith('.') : continue
    if station: add(l, stations=station, line=line)
# circuits
cur=None
for l in lines[:a]:
    if l.startswith('⭐'): cur=l.strip('⭐ ').title(); continue
    if l.startswith('📍') : cur=None; continue
    if not cur or not l or l=='↓' or SKIP.search(l) or l.endswith(('.',':')) or 'Suggested' in l or 'Best for' in l or 'look out' in l: continue
    if len(l)<45: add(l, circuits=cur)
out=sorted(pandals.values(),key=lambda p:p['name'])
json.dump(out,open(sys.argv[2],'w'),indent=1,ensure_ascii=False); print(len(out),'pandals')
