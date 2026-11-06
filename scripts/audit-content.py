"""Produce reproducible scope and card-quality reports without promoting drafts to reviewed."""
from pathlib import Path
from collections import Counter
import csv, hashlib, json, re, wave
from content_core import workspace, review_status, release_report
from study_scope import load_scope

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'src/data/content.json').read_text(encoding='utf-8'))
source=json.loads((ROOT/'content/scope/source.json').read_text(encoding='utf-8'))
variants=json.loads((ROOT/'content/scope/spelling-variants.json').read_text(encoding='utf-8'))
with (ROOT/'content/scope/ecdict-words.tsv').open(encoding='utf-8',newline='') as f:
    candidates={r['word']:set(r['tags'].split()) for r in csv.DictReader(f,delimiter='\t')}
assert len(candidates)==source['candidateWords']
scope=load_scope(ROOT)
reference_candidates=candidates
candidates={w:set(e['tags']) for w,e in scope['entries'].items()}
required={w for w,e in scope['entries'].items() if e['required']}
source['adoptedSha256']=hashlib.sha256((ROOT/'content/scope/ecdict-words.tsv').read_bytes()).hexdigest()
source['licenseSha256']=hashlib.sha256((ROOT/'content/scope/ECDICT-LICENSE').read_bytes()).hexdigest()
(ROOT/'content/scope/source.json').write_text(json.dumps(source,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
tags=Counter(tag for group in candidates.values() for tag in sorted(group))
stages=Counter(e['level'] for e in scope['entries'].values() if e['required'])
app_words={w['word'].lower():w for w in data['words']}
audio_manifest=json.loads((ROOT/'public/audio/manifest.json').read_text(encoding='utf-8'))
audio_by_file={x['file']:x for x in audio_manifest}
problems=[]
rows=[]
workspace_data=workspace(ROOT)
release_state=release_report(workspace_data)
for word in data['words']:
    issues=[]
    if not word['meaning'] or not word['ipa']: issues.append('missing-core-field')
    if len(word['phrases'])<2 or len(word['examples'])<2: issues.append('missing-usage')
    base=word['word'].lower()
    forms={base,base+'s',base+'es',base+'d',base+'ed',base+'ing',base+"'s"}
    if base.endswith('e'): forms.add(base[:-1]+'ing')
    if base.endswith('y'): forms.update({base[:-1]+'ies',base[:-1]+'ied'})
    for form in word['forms']:
        forms.update(re.findall(r'\b[a-z]+\b',form.lower()))
    for index,example in enumerate(word['examples']):
        tokens=set(re.findall(r"[a-z]+(?:'[a-z]+)?",example['en'].lower()))
        if not forms & tokens: issues.append('example-target-'+str(index+1))
        if not example['zh'].strip(): issues.append('missing-translation')
    for asset in [word['audio']]+[x['audio'] for x in word['examples']]:
        file=ROOT/'public'/asset
        entry=audio_by_file.get(file.name)
        if not file.is_file() or not entry: issues.append('missing-audio'); continue
        if hashlib.sha256(file.read_bytes()).hexdigest()!=entry['sha256']: issues.append('audio-hash')
        with wave.open(str(file),'rb') as sound:
            if not .15<sound.getnframes()/sound.getframerate()<30: issues.append('audio-duration')
    if issues: problems.append({'word':base,'issues':issues})
    rows.append([word['id'],base,word['level'],word['topic'],word['scene'],word['concept'],word['family'],review_status(workspace_data,word['id']),' '.join(sorted(candidates.get(base,set()))),';'.join(issues) or 'none'])
missing=sorted(required-set(app_words))
extra=sorted(set(app_words)-required)
report={
 'version':data['version'],'catalogVersion':data['catalogVersion'],'contentHash':data['hash'],'sourceId':scope['study']['id'] if scope['study'] else source['id'],'sourceRevision':source['revision'],'sourceRawSha256':source['rawSha256'],
 'candidateWords':len(candidates),'targetWords':len(required),'referenceWords':len(reference_candidates),
 'officialScope':scope['official'],'studyScope':scope['study'],'sourceTagCounts':dict(tags),'targetLevelCounts':dict(stages),
 'multiTagWords':sum(len(group)>1 for group in candidates.values()),'deferredEntries':len(source['deferredEntries']),
 'cards':len(app_words),'levels':dict(Counter(w['level'] for w in data['words'])),
 'candidateMatches':len(set(app_words)&required),'missingCards':len(missing),'outsideCandidateScope':extra,
 'topics':len(data['topics']),'scenes':len(data['scenes']),'concepts':len(data['concepts']),
 'rootGroups':sum(f['kind']=='root' for f in data['families']),'modernFamilies':sum(f['kind']=='family' for f in data['families']),
 'independentGroups':sum(f['kind']=='independent' for f in data['families']),'groupedWords':sum(len(f['words']) for f in data['families']),
 'audioFiles':len(audio_manifest),'audioSeconds':round(sum(a['seconds'] for a in audio_manifest),3),
 'structuralIssues':problems,'humanApprovedCards':sum(review_status(workspace_data,w['id'])=='approved' for w in data['words']),
 'officialScopeVerification':'approved' if next(c for c in release_state['checks'] if c['id']=='official-scope')['passed'] else 'pending',
 'notice':'候选拼写并集与已制作词卡分别统计；正式范围、逐卡校审和发行验证由release.json记录。',
}
out=ROOT/'content/reports'
out.mkdir(parents=True,exist_ok=True)
(out/'scope.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
with (out/'card-audit.tsv').open('w',encoding='utf-8',newline='') as f:
    writer=csv.writer(f,delimiter='\t',lineterminator='\n')
    writer.writerow(['id','word','referenceLevel','topic','scene','concept','family','reviewStatus','sourceTags','issues'])
    writer.writerows(rows)
with (out/'missing-cards.tsv').open('w',encoding='utf-8',newline='') as f:
    writer=csv.writer(f,delimiter='\t',lineterminator='\n')
    writer.writerow(['word','sourceSpellings','sourceTags','status'])
    writer.writerows([w,scope['entries'][w]['display'],' '.join(sorted(candidates[w])),'target-card-needed'] for w in missing)
text=f'''# 词库范围与词卡清点

内容版本：{data['version']}。范围采用[官方词表](https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf)与[ECDICT基础及参考标签]({source['repository']})。ECDICT固定提交 `{source['revision']}`。保留的字段仅为拼写和级别标签；未复制释义、例句、音标或音频。原始文件SHA-256：`{source['rawSha256']}`。MIT许可见 `../scope/ECDICT-LICENSE`。

| 项目 | 数量 |
| --- | ---: |
| 旧参考来源拼写 | {len(reference_candidates)} |
| 官方索引与参考来源拼写并集 | {len(candidates)} |
| 当前待裁定目标拼写 | {len(required)} |
| 至少两个级别标签的候选词 | {report['multiTagWords']} |
| 需另行裁定的短语或特殊拼写 | {report['deferredEntries']} |
| 本版可学习词卡 | {len(app_words)} |
| 已制卡与候选名单相交 | {report['candidateMatches']} |
| 候选名单中尚未制作的词卡 | {len(missing)} |
| 主题 / 场景 / 概念 | {report['topics']} / {report['scenes']} / {report['concepts']} |
| 构词归组覆盖 | {report['groupedWords']} |
| 古典词根 / 现代词族 / 独立词组 | {report['rootGroups']} / {report['modernFamilies']} / {report['independentGroups']} |
| 本地音频 | {len(audio_manifest)} |
| 结构、目标词与音频问题 | {len(problems)} |
| 完整人工审核通过的卡片 | {report['humanApprovedCards']} |

## 分层口径

基础层保留固定参考来源的`zk/gk`，再并入官方词目、附列形式与显式变体的机械展开。基础标签优先，其余优先采用官方所在行的四级／六级标记；附列形式的级别按行继承，保留推定依据。同一拼写的多行与多级记录不被丢弃。旧来源独有的四六级标签仅保留为参考，不自动进入目标。

拼写以小写作为去重键；原始大小写及变体保存在`../scope/cet2016-records.json`和参考来源的`../scope/spelling-variants.json`，未制作词清单也保留源拼写。制作正式卡片时需要裁定显示形式，不把小写去重键直接当作正确显示拼写。

- 来源标签计数（可能重叠）：{dict(tags)}。
- 目标参考层级去重计数：{dict(stages)}。
- 当前词卡参考层级：{report['levels']}。
- 当前目标范围外保留的词：{', '.join(extra) if extra else '无'}。这些保留为公开标明的扩展词，后续决定是否进入正式必学集合。

## 尚待完成

已经从[官方大纲](https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf)提取PDF21至149页（书内16至144页）。129页的两种文字提取序列逐页对齐。索引保留5377个物理词目行和2519个附列单元格；原书公布的5418词目与2551附列计数分别保存，不将它们视为同一计数口径。212个变体单元和计数差异仍待裁定。

完整提取与当前卡片义项覆盖是两回事；{len(app_words)}张卡不能据拼写相交就视为覆盖所有官方义项。详见`scope-comparison.tsv`、`../scope/normalization-queue.json`与`../scope/homographs.json`。

{len(app_words)}张卡片为原创辅助编写草稿，不能自动标为人工审核通过。`card-audit.tsv`逐卡记录分组、标签与缺项；`missing-cards.tsv`列出全部待制作目标词。音标、词义、搭配、词根证据与每段音频仍需要完整校审。
'''
(out/'scope.md').write_text(text,encoding='utf-8',newline='\n')
print('Candidate words:',len(candidates),'Cards:',len(app_words),'Missing cards:',len(missing),'Structural issues:',len(problems),flush=True)
if problems:
    print(json.dumps(problems,ensure_ascii=True),flush=True)
    raise SystemExit(1)
