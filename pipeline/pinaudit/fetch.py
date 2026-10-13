import re,json,subprocess,concurrent.futures as cf
urls=open('urls.txt').read().split()
def get(u):
    h=subprocess.run(['curl','-s','-m','20','-A','Mozilla/5.0',u],capture_output=True,text=True).stdout
    t=re.search(r'<h1[^>]*>(.*?)</h1>',h,re.S); c=re.findall(r'(2[12]\.\d{4,}),\s?(88\.\d{4,})',h)
    c=[x for x in c if x!=('22.5726','88.3639')]
    a=re.search(r'Address:\s*([^<]+)',h)
    return {'url':u,'name':re.sub('<.*?>','',t.group(1)).strip() if t else '', 'pin':[float(c[0][0]),float(c[0][1])] if c else None,'addr':a.group(1).strip() if a else ''}
with cf.ThreadPoolExecutor(8) as ex: out=list(ex.map(get,urls))
json.dump(out,open('agamoni.json','w'),indent=0);print(sum(1 for o in out if o['pin']),len(out))
