"""Local content production: review evidence, a portable SQLite catalogue, release gates."""
from pathlib import Path
import csv, hashlib, json, re, sqlite3, tempfile, os, threading, wave
from datetime import datetime, timezone
from contextlib import closing
from study_scope import load_scope

ROOT = Path(__file__).resolve().parents[1]
REVIEW_AXES = {
    'meaning': '词性与核心释义', 'pronunciation': '音标与三段发音',
    'usage': '搭配与英文例句', 'translation': '中文翻译',
    'classification': '语义位置与构词关系', 'license': '来源与再分发许可',
}
LOCK = threading.RLock()

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=path.name+'.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

def workspace(root=ROOT):
    root = Path(root)
    data = read_json(root/'src/data/content.json')
    unhashed = {k:v for k,v in data.items() if k != 'hash'}
    if data['hash'] != digest(unhashed):
        raise ValueError('词包内容与校验值不一致，请先重新生成词包。')
    source = read_json(root/'content/scope/source.json')
    raw = (root/'content/scope/ecdict-words.tsv').read_bytes()
    if hashlib.sha256(raw).hexdigest() != source['adoptedSha256']:
        raise ValueError('候选词文件与固定来源校验值不一致。')
    with (root/'content/scope/ecdict-words.tsv').open(encoding='utf-8', newline='') as stream:
        candidates = {r['word']:r['tags'].split() for r in csv.DictReader(stream, delimiter='\t')}
    if len(candidates) != source['candidateWords']:
        raise ValueError('候选词数量与固定来源记录不一致。')
    scope=load_scope(root)
    if data.get('scopeId') and not scope['study']:
        raise ValueError('当前词包需要正式范围索引，请先生成学习范围。')
    candidates={w:e['tags'] for w,e in scope['entries'].items()}
    groups = {g['id']:g for g in data['families']}
    locations = {g['id']:g for name in ('topics','scenes','concepts') for g in data[name]}
    manifest = read_json(root/'public/audio/manifest.json')
    by_file = {a['file']:a for a in manifest}
    originals={}
    for file in (root/'content/editorial').glob('*.tsv'):
        for line in file.read_text(encoding='utf-8').splitlines():
            if line.strip(): originals[line.split('|')[0].lower()]=line
    fingerprints, issues, source_issues = {}, [], []
    for word in data['words']:
        original=originals.get(word['word'].lower())
        parts=original.split('|') if original else []
        expected=[word['word'],word['ipa'],word['pos'],word['meaning'],word['level'],word['family'],
                  ';'.join(p['en']+'::'+p['zh'] for p in word['phrases']),
                  *[e['en']+'::'+e['zh'] for e in word['examples']]]
        if parts!=expected:source_issues.append(word['id'])
        assets = []
        for asset, text in [(word['audio'],word['word']+'.'), *[(e['audio'],e['en']) for e in word['examples']]]:
            path = (root/'public'/asset).resolve()
            if not path.is_relative_to((root/'public/audio').resolve()):
                raise ValueError('音频路径超出了内容目录。')
            sha = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
            entry = by_file.get(path.name, {})
            if not sha or sha != entry.get('sha256') or text != entry.get('text'):
                issues.append({'word':word['word'],'asset':asset,'issue':'audio-missing-or-changed'})
            if sha:
                try:
                    with wave.open(str(path),'rb') as sound:
                        valid = .15 < sound.getnframes()/sound.getframerate() < 30
                    if not valid: raise ValueError('audio-duration')
                except (wave.Error,EOFError,ValueError):
                    issues.append({'word':word['word'],'asset':asset,'issue':'audio-format-or-duration'})
            assets.append({'path':asset,'sha256':sha})
        # A change to a related group, classification, source, or actual WAV invalidates approval.
        fingerprints[word['id']] = digest({
            'word':{k:v for k,v in word.items() if k != 'reviewStatus'},
            'family':groups[word['family']],
            'location':[locations[word[k]] for k in ('topic','scene','concept')],
            'source':{'reference':source,'official':scope['official'],'study':scope['study']}, 'license':data['license'], 'audio':assets, 'editorialLine':original,
        })
    reviews = read_json(root/'content/reviews.json')
    if reviews.get('schemaVersion') != 1 or not isinstance(reviews.get('records'), list):
        raise ValueError('校审记录格式不兼容。')
    return {'root':root,'data':data,'source':source,'candidates':candidates,
            'fingerprints':fingerprints,'reviews':reviews,'audioIssues':issues,'sourceIssues':source_issues,'scope':scope}

def valid_approval(record):
    return (record.get('decision') == 'approved' and
            isinstance(record.get('reviewer'),str) and bool(record['reviewer'].strip()) and
            isinstance(record.get('evidence'),str) and len(record['evidence'].strip()) >= 10 and
            set(record.get('checks',{})) == set(REVIEW_AXES) and
            all(value is True for value in record['checks'].values()) and
            bool(re.fullmatch(r'[0-9a-f]{64}',record.get('fingerprint',''))) and
            bool(re.fullmatch(r'\d{4}-\d\d-\d\dT.*(?:Z|\+00:00)',record.get('reviewedAt',''))))

def review_status(ws, word_id):
    records = [r for r in ws['reviews']['records'] if r.get('wordId') == word_id]
    if not records: return 'pending'
    record = records[-1]
    if record.get('fingerprint') != ws['fingerprints'][word_id]: return 'stale'
    if record.get('decision') == 'changes-requested': return 'changes-requested'
    return 'approved' if valid_approval(record) else 'pending'

def reference_level(tags):
    return '基础' if set(tags)&{'zk','gk'} else '四级' if 'cet4' in tags else '六级'

def release_report(ws):
    root, data = ws['root'], ws['data']
    policy = read_json(root/'content/release-policy.json')
    app_version = read_json(root/'package.json')['version']
    cards = {w['word'].lower():w for w in data['words']}
    decisions = {d['word']:d for d in policy['scopeDecisions'] if d.get('reviewer','').strip() and len(d.get('evidence','').strip()) >= 10 and d.get('decision') in ('include','exclude')}
    expected = {w for w,e in ws['scope']['entries'].items() if e['required'] and decisions.get(w,{}).get('decision') != 'exclude'}
    expected.update(w for w,d in decisions.items() if d['decision'] == 'include')
    missing = sorted(expected-set(cards))
    outside = sorted(set(cards)-{w for w,e in ws['scope']['entries'].items() if e['required']})
    unresolved = [w for w in outside if w not in decisions]
    invalid_included = [w for w in cards if decisions.get(w,{}).get('decision') == 'exclude']
    level_issues = [w for w,card in cards.items() if card['level'] != ws['scope']['entries'].get(w,{}).get('level','扩展')]
    approved = sum(review_status(ws,w['id']) == 'approved' for w in data['words'])
    stale = sum(review_status(ws,w['id']) == 'stale' for w in data['words'])
    scope = policy['officialScope']
    scope_hash=ws['scope']['study']['adoptedSha256'] if ws['scope']['study'] else ws['source']['adoptedSha256']
    def check(key, label, ok, detail): return {'id':key,'label':label,'passed':bool(ok),'detail':detail}
    checks = [
        check('version','正式发行版本',app_version==policy['targetVersion'],f'当前为{app_version}，目标为{policy["targetVersion"]}'),
        check('official-scope','正式范围裁定与验收',scope['status']=='approved' and scope.get('adoptedSha256')==scope_hash and scope.get('reviewer','').strip() and len(scope.get('evidence','').strip())>=10,scope.get('note','')),
        check('coverage','目标词卡覆盖',not missing,f'{len(expected)}个当前目标拼写，{len(missing)}个尚未成卡'),
        check('scope-decisions','差异词裁定',not unresolved and not invalid_included,f'{len(unresolved)}个扩展词未裁定，{len(invalid_included)}个已排除词仍在课程中'),
        check('levels','参考层级核对',not level_issues,f'{len(level_issues)}张卡与当前范围参考层级不一致'),
        check('reviews','词卡逐项人工校审',approved==len(cards),f'{approved}/{len(cards)}张有效通过，{stale}张因内容变更待重审'),
        check('source-snapshot','原稿与词包一致',not ws['sourceIssues'],f'{len(ws["sourceIssues"])}张卡与原稿不同，需重新生成内容'),
        check('audio','离线音频完整且匹配正文',not ws['audioIssues'],f'{len(ws["audioIssues"])}项缺失、文本或校验值问题'),
    ]
    if ws['scope']['official']:
        official=ws['scope']['official']
        checks.insert(1,check('official-extraction','官方词表提取校验',official['crossCheckedPages']==129 and official['crossCheckMismatches']==0,'129页文字序列交叉核对通过；变体、同形异义及公布计数口径待裁定'))
    audit_path = root/'content/reports/scope.json'
    audit = read_json(audit_path) if audit_path.exists() else {}
    checks.append(check('structure','词卡结构校验',audit.get('contentHash')==data['hash'] and audit.get('structuralIssues')==[], '要求当前词包的结构报告，无旧报告替代'))
    for platform, label in [('windows','Windows安装与升级'),('android','安卓真机与升级')]:
        result = policy['platforms'][platform]
        artifact=(root/result.get('artifactFile','')).resolve()
        allowed=any(artifact.is_relative_to((root/directory).resolve()) for directory in ('release','android/app/build/outputs'))
        actual=hashlib.sha256(artifact.read_bytes()).hexdigest() if allowed and artifact.is_file() else None
        ok = result['status']=='approved' and result.get('appVersion')==app_version and result.get('contentHash')==data['hash'] and actual is not None and actual==result.get('artifactSha256') and len(result.get('evidence','').strip())>=10
        checks.append(check(platform,label,ok,result.get('evidence') or '待本次发行产物的验证记录'))
    distribution = policy['distribution']
    checks.append(check('distribution','正式签名与开源分发',distribution['status']=='approved' and len(distribution.get('evidence','').strip())>=10,distribution.get('evidence') or '待正式签名、许可与下载产物核验'))
    return {'schemaVersion':1,'appVersion':app_version,'contentVersion':data['version'],
            'catalogVersion':data.get('catalogVersion',data['version']),'contentHash':data['hash'],
            'candidateWords':len(ws['candidates']),'targetWords':len(expected),'referenceWords':len(ws['scope']['reference']),
            'officialScope':ws['scope']['official'],'studyScope':ws['scope']['study'],
            'cards':len(cards),'targetCards':len(set(cards)&expected),'nonTargetCards':len(set(cards)-expected),'missingCards':len(missing),
            'approvedCards':approved,'staleCards':stale,'levelIssues':level_issues,
            'unresolvedScopeWords':unresolved,'ready':all(c['passed'] for c in checks),'checks':checks}

SCHEMA = '''
PRAGMA foreign_keys=ON;
PRAGMA user_version=2;
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sources(id TEXT PRIMARY KEY, license TEXT NOT NULL, revision TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE candidates(word TEXT PRIMARY KEY, display TEXT NOT NULL, level TEXT NOT NULL, tags TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id),required INTEGER NOT NULL CHECK(required IN (0,1)),evidence TEXT NOT NULL);
CREATE TABLE topics(id TEXT PRIMARY KEY,label TEXT NOT NULL,ordinal INTEGER NOT NULL);
CREATE TABLE scenes(id TEXT PRIMARY KEY,label TEXT NOT NULL,topic_id TEXT NOT NULL REFERENCES topics(id));
CREATE TABLE concepts(id TEXT PRIMARY KEY,label TEXT NOT NULL,scene_id TEXT NOT NULL REFERENCES scenes(id));
CREATE TABLE families(id TEXT PRIMARY KEY,label TEXT NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL);
CREATE TABLE words(id TEXT PRIMARY KEY, word TEXT UNIQUE COLLATE NOCASE NOT NULL, ipa TEXT NOT NULL,pos TEXT NOT NULL,meaning TEXT NOT NULL,level TEXT NOT NULL,topic_id TEXT NOT NULL REFERENCES topics(id),scene_id TEXT NOT NULL REFERENCES scenes(id),concept_id TEXT NOT NULL REFERENCES concepts(id),family_id TEXT NOT NULL REFERENCES families(id),audio TEXT NOT NULL,ordinal INTEGER UNIQUE NOT NULL,fingerprint TEXT NOT NULL,review_status TEXT NOT NULL,source TEXT NOT NULL REFERENCES sources(id),data TEXT NOT NULL);
CREATE TABLE phrases(word_id TEXT NOT NULL REFERENCES words(id),ordinal INTEGER NOT NULL,en TEXT NOT NULL,zh TEXT NOT NULL,PRIMARY KEY(word_id,ordinal));
CREATE TABLE examples(word_id TEXT NOT NULL REFERENCES words(id),ordinal INTEGER NOT NULL,en TEXT NOT NULL,zh TEXT NOT NULL,audio TEXT NOT NULL,PRIMARY KEY(word_id,ordinal));
CREATE TABLE forms(word_id TEXT NOT NULL REFERENCES words(id),ordinal INTEGER NOT NULL,text TEXT NOT NULL,PRIMARY KEY(word_id,ordinal));
CREATE TABLE reviews(ordinal INTEGER PRIMARY KEY,word_id TEXT NOT NULL REFERENCES words(id),fingerprint TEXT NOT NULL,decision TEXT NOT NULL,reviewer TEXT NOT NULL,reviewed_at TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX words_topic ON words(topic_id);
CREATE INDEX words_status ON words(review_status);
'''

def build_database(root=ROOT):
    ws = workspace(root)
    root, data = ws['root'], ws['data']
    output = root/'public/lexicon.sqlite'
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='lexicon.',suffix='.sqlite.tmp',dir=output.parent)
    os.close(fd)
    try:
        with closing(sqlite3.connect(name)) as db:
            db.executescript(SCHEMA)
            report = release_report(ws)
            metadata = {'schemaVersion':2,'packId':data['id'],'contentVersion':data['version'],'catalogVersion':data.get('catalogVersion',data['version']),'contentHash':data['hash'],'releaseReport':report}
            db.executemany('INSERT INTO metadata VALUES (?,?)',[(k,json.dumps(v,ensure_ascii=False)) for k,v in metadata.items()])
            source = ws['source']
            db.execute('INSERT INTO sources VALUES (?,?,?,?)',(source['id'],source['license'],source['revision'],json.dumps(source,ensure_ascii=False)))
            official=ws['scope']['official']
            if official:
                db.execute('INSERT INTO sources VALUES (?,?,?,?)',(official['id'],'spelling-and-grade-facts',official['rawSha256'],json.dumps(official,ensure_ascii=False)))
            for source_id in sorted({w['source'] for w in data['words']}):
                origin={'id':source_id,'kind':'original-editorial','license':data['license'],'attribution':'Daily Lexicon contributors','provenance':'content/editorial/README.md'}
                db.execute('INSERT INTO sources VALUES (?,?,?,?)',(source_id,data['license'],source_id,json.dumps(origin,ensure_ascii=False)))
            db.executemany('INSERT INTO candidates VALUES (?,?,?,?,?,?,?)',[(w,e['display'],e['level'],' '.join(e['tags']),official['id'] if official and 'official' in e['origins'] else source['id'],int(e['required']),json.dumps(e['evidence'],ensure_ascii=False)) for w,e in sorted(ws['scope']['entries'].items())])
            db.executemany('INSERT INTO topics VALUES (?,?,?)',[(t['id'],t['label'],i) for i,t in enumerate(data['topics'])])
            db.executemany('INSERT INTO scenes VALUES (?,?,?)',[(s['id'],s['label'],s['topic']) for s in data['scenes']])
            db.executemany('INSERT INTO concepts VALUES (?,?,?)',[(c['id'],c['label'],c['scene']) for c in data['concepts']])
            db.executemany('INSERT INTO families VALUES (?,?,?,?)',[(f['id'],f['label'],f['kind'],f['note']) for f in data['families']])
            for i,word in enumerate(data['words']):
                status = review_status(ws,word['id'])
                db.execute('INSERT INTO words VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(word['id'],word['word'],word['ipa'],word['pos'],word['meaning'],word['level'],word['topic'],word['scene'],word['concept'],word['family'],word['audio'],i,ws['fingerprints'][word['id']],status,word['source'],json.dumps(word,ensure_ascii=False)))
                db.executemany('INSERT INTO phrases VALUES (?,?,?,?)',[(word['id'],n,x['en'],x['zh']) for n,x in enumerate(word['phrases'])])
                db.executemany('INSERT INTO examples VALUES (?,?,?,?,?)',[(word['id'],n,x['en'],x['zh'],x['audio']) for n,x in enumerate(word['examples'])])
                db.executemany('INSERT INTO forms VALUES (?,?,?)',[(word['id'],n,x) for n,x in enumerate(word['forms'])])
            ids = {w['id'] for w in data['words']}
            db.executemany('INSERT INTO reviews VALUES (?,?,?,?,?,?,?)',[(i,r['wordId'],r['fingerprint'],r['decision'],r['reviewer'],r['reviewedAt'],json.dumps(r,ensure_ascii=False)) for i,r in enumerate(ws['reviews']['records']) if r['wordId'] in ids])
            db.commit()
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
        os.replace(name,output)
        atomic_json(root/'content/reports/release.json',report)
        return report
    finally:
        if os.path.exists(name): os.unlink(name)

def submit_review(root, request):
    with LOCK:
        ws = workspace(root)
        word_id = request.get('wordId')
        if word_id not in ws['fingerprints']: raise ValueError('只能校审已制作的词卡，待制词尚无正文。')
        if request.get('fingerprint') != ws['fingerprints'][word_id]: raise ValueError('词卡或音频已发生变化，请刷新后重新校审。')
        record = {key:request.get(key) for key in ('wordId','fingerprint','decision','reviewer','checks','evidence')}
        if record['decision'] not in ('approved','changes-requested'): raise ValueError('校审决定无效。')
        if not isinstance(record['reviewer'],str) or not 1 <= len(record['reviewer'].strip()) <= 80: raise ValueError('请填写校审署名。')
        if not isinstance(record['evidence'],str) or not 10 <= len(record['evidence'].strip()) <= 5000: raise ValueError('请填写至少10字的核对依据或修改意见。')
        if not isinstance(record['checks'],dict) or set(record['checks']) != set(REVIEW_AXES) or any(type(v) is not bool for v in record['checks'].values()): raise ValueError('逐项校审字段不完整。')
        record['reviewer'] = record['reviewer'].strip()
        record['evidence'] = record['evidence'].strip()
        record['reviewedAt'] = datetime.now(timezone.utc).isoformat()
        if record['decision']=='approved' and not valid_approval(record): raise ValueError('标为通过前，请完成六项校对与校听。')
        if record['decision']=='approved' and word_id in ws['sourceIssues']:
            raise ValueError('原稿与词包不一致，请重新生成内容后校审。')
        word=next(w for w in ws['data']['words'] if w['id']==word_id)
        if record['decision']=='approved' and any(issue['word']==word['word'] for issue in ws['audioIssues']):
            raise ValueError('本卡发音文件缺失或与清单不符，请修复后重新校审。')
        ws['reviews']['records'].append(record)
        atomic_json(Path(root)/'content/reviews.json',ws['reviews'])
        build_database(root)
        return record
