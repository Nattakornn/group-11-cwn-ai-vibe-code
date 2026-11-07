import json,sys
s=open(sys.argv[1]).read(); s=s[s.index('"['):]; s=s[:s.rindex(']"')+2]
for r in json.loads(json.loads(s)):
    flags=[]
    if r['lang']=='en' and (r['thai'] or r['thaiTitle']): flags.append(f"TH{r['thai']}/title{r['thaiTitle']}:{r['sample'][:2]}")
    if not (r['disTh'] if r['lang']=='th' else r['disEn']): flags.append('NO-DISCLAIMER')
    if r['over']>0: flags.append(f"OVERFLOW+{r['over']}")
    if r['noId'] or r['dup']: flags.append(f"noId{r['noId']} dup{r['dup']}")
    if r['bad']: flags.append(f"BAD{r['bad']}")
    print(r['w'],r['lang'],r['p'] or '/',r['st'],' | '.join(flags) or 'ok')
