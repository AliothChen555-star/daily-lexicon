"""Fetch a pinned ECDICT snapshot, retaining only spellings and factual level tags."""
from pathlib import Path
from urllib.request import Request, urlopen
import csv, hashlib, json, unicodedata, re, argparse
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--revision',default='master')
args=parser.parse_args()
headers={'User-Agent':'DailyLexicon-Content/0.2'}
def read(url):
    with urlopen(Request(url,headers=headers),timeout=120) as response: return response.read()
commit=json.loads(read('https://api.github.com/repos/skywind3000/ECDICT/commits/'+args.revision))['sha']
cache=ROOT/'.toolchain/sources'/commit
cache.mkdir(parents=True,exist_ok=True)
url=f'https://raw.githubusercontent.com/skywind3000/ECDICT/{commit}/ecdict.csv'
raw=cache/'ecdict.csv'
if not raw.exists():
    raw.write_bytes(read(url))
    print('Downloaded pinned ECDICT snapshot',flush=True)
license_bytes=read(f'https://raw.githubusercontent.com/skywind3000/ECDICT/{commit}/LICENSE')
selected={}
spellings={}
raw_count=0
accepted_tags={'zk','gk','cet4','cet6'}
rejected=[]
with raw.open(encoding='utf-8-sig',newline='') as f:
    for row in csv.DictReader(f):
        raw_count+=1
        tags=set(row.get('tag','').split()) & accepted_tags
        if not tags: continue
        spelling=unicodedata.normalize('NFKC',row['word']).strip()
        word=spelling.lower()
        if not re.fullmatch(r"[a-z]+(?:[-'][a-z]+)*",word):
            rejected.append({'word':word,'tags':sorted(tags),'reason':'requires-entry-type-review'})
            continue
        selected.setdefault(word,set()).update(tags)
        spellings.setdefault(word,set()).add(spelling)
out=ROOT/'content/scope'
out.mkdir(parents=True,exist_ok=True)
(out/'ecdict-words.tsv').write_text('word\ttags\n'+''.join(w+'\t'+' '.join(sorted(tags))+'\n' for w,tags in sorted(selected.items())),encoding='utf-8',newline='\n')
(out/'ECDICT-LICENSE').write_bytes(license_bytes)
case_variants={word:sorted(values) for word,values in sorted(spellings.items()) if values!={word}}
(out/'spelling-variants.json').write_text(json.dumps(case_variants,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
manifest={
    'id':'ecdict-scope','title':'ECDICT spellings and level labels','repository':'https://github.com/skywind3000/ECDICT',
    'revision':commit,'url':url,'fetchedAt':datetime.now(timezone.utc).isoformat(),
    'rawSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'license':'MIT','licenseFile':'ECDICT-LICENSE',
    'adoptedFields':['word','tag'],'omittedFields':['definition','translation','phonetic','pos','collins','oxford','bnc','frq','exchange','detail','audio'],
    'rawRows':raw_count,'candidateWords':len(selected),'deferredEntries':rejected,
    'normalization':'NFKC、去除首尾空白、小写作为去重键。源大小写拼写保存在spelling-variants.json，制作词卡时按原拼写人工裁定。',
    'caseVariantWords':len(case_variants),'caseVariantsFile':'spelling-variants.json',
    'officialVerification':'pending','notes':'仅用于候选范围清点；不复制上游释义、例句或发音，不声称已与正式大纲逐条核对。保留所有级别标签，基础、四级、六级取并集。',
}
(out/'source.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Candidate spellings:',len(selected),'Deferred entries:',len(rejected),flush=True)
