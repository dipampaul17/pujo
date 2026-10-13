import re,json,subprocess,concurrent.futures as cf,html
def get(u):
    h=subprocess.run(['curl','-s','-m','20','-A','Mozilla/5.0',u],capture_output=True,text=True).stdout
    t=re.search(r'<h1[^>]*>(.*?)</h1>',h,re.S); la=re.search(r'"latitude":\s*(2[12]\.\d+)',h); lo=re.search(r'"longitude":\s*(88\.\d+)',h)
    return {'url':u,'name':html.unescape(re.sub('<.*?>','',t.group(1)).strip()) if t else '','pin':[float(la.group(1)),float(lo.group(1))] if la and lo else None}
with cf.ThreadPoolExecutor(8) as ex: out=list(ex.map(get,open('ppg.txt').read().split()))
json.dump(out,open('ppg.json','w'),indent=0); print(sum(1 for o in out if o['pin']),len(out))
