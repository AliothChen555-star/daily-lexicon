from pathlib import Path
import json, hashlib, shutil, sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_core import ROOT, digest, read_json, atomic_json

def make_fixture(root):
    root=Path(root)
    data=read_json(ROOT/'src/data/content.json')
    word=next(w for w in data['words'] if w['id']=='dl-see')
    data['words']=[word]
    for table,key in [('topics','topic'),('scenes','scene'),('concepts','concept'),('families','family')]:
        data[table]=[g for g in data[table] if g['id']==word[key]]
    data['hash']=digest({k:v for k,v in data.items() if k!='hash'})
    atomic_json(root/'src/data/content.json',data)
    (root/'content/editorial').mkdir(parents=True,exist_ok=True)
    original=next(line for line in (ROOT/'content/editorial'/f"{word['topic']}.tsv").read_text(encoding='utf-8').splitlines() if line.startswith(word['word']+'|'))
    (root/'content/editorial'/f"{word['topic']}.tsv").write_text(original+'\n',encoding='utf-8',newline='\n')
    raw='word\ttags\nabandon\tcet4 cet6\nsee\tgk cet4 cet6\n'.encode()
    (root/'content/scope').mkdir(parents=True,exist_ok=True)
    (root/'content/scope/ecdict-words.tsv').write_bytes(raw)
    source=read_json(ROOT/'content/scope/source.json')
    source.update(id='isolated-test-fixture',candidateWords=2,adoptedSha256=hashlib.sha256(raw).hexdigest())
    atomic_json(root/'content/scope/source.json',source)
    atomic_json(root/'content/reviews.json',{'schemaVersion':1,'records':[]})
    atomic_json(root/'content/release-policy.json',read_json(ROOT/'content/release-policy.json'))
    atomic_json(root/'package.json',{'version':'1.0.0-dev.1'})
    audio=root/'public/audio';audio.mkdir(parents=True,exist_ok=True)
    names={Path(p).name for p in [word['audio'],*[e['audio'] for e in word['examples']]]}
    for name in names:shutil.copyfile(ROOT/'public/audio'/name,audio/name)
    manifest=[a for a in read_json(ROOT/'public/audio/manifest.json') if a['file'] in names]
    atomic_json(audio/'manifest.json',manifest)
    atomic_json(root/'content/reports/scope.json',{'contentHash':data['hash'],'structuralIssues':[]})
    return root
