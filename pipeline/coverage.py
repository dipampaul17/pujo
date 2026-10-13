"""Coverage report: every pandal -> aliases, last polled, open evidence, posts. Usage: python3 pipeline/coverage.py"""
import json,os,sys
H=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,H)
from aliases import aliases
D=json.load(open(f'{H}/../src/data/dhaak.v1.json'))['pandals']
L=json.load(open(f'{H}/state/xlive.json')); S=json.load(open(f'{H}/../public/live/status.json'))['open']
rows=[];o=0
for p in sorted(D,key=lambda p:-(p.get('worth') or 0)):
    ev=S.get(p['id']); o+=bool(ev)
    rows.append(f"{'OPEN ' if ev else '  -  '} {p['id'][:30]:30} polled={L['polled'].get(p['id'],'never')[:16]:16} posts={len(L['posts'].get(p['id'],[]))} pinned={'y' if p.get('lat') else 'n'} aliases={len(aliases(p))} {ev['evidence'] if ev else ''}")
print('\n'.join(rows)); never=[p['id'] for p in D if p.get('lat') and not L['polled'].get(p['id'])]
print(f"\n{o}/{len(D)} open with evidence; never polled: {len(never)} {never}")
