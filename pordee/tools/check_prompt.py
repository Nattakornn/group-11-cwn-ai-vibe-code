import re, sys
p = open('BUILD-PROMPT.md', encoding='utf-8').read(); r = open('REQUIREMENTS.md', encoding='utf-8').read()
def expand(s):
    out = set()
    for m in re.finditer(r'\b(FR|BR|NFR)-(\d+)\s*(?:–|ถึง)\s*(?:(?:FR|BR|NFR)-)?(\d+)', s):
        out |= {f'{m.group(1)}-{i:02d}' for i in range(int(m.group(2)), int(m.group(3)) + 1)}
    return out | set(re.findall(r'\b(?:FR|BR|NFR)-\d+', s))
got = expand(p)
for kind in ('FR', 'BR', 'NFR'):
    allc = re.findall(rf'^\| ({kind}-\d+) \|', r, re.M)
    miss = [c for c in allc if c not in got]
    print(f'{kind} {len(allc)-len(miss)}/{len(allc)}', 'missing:', miss or '-')
print('lines', p.count('\n') + (0 if p.endswith('\n') else 1))
