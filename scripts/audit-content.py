"""Produce reproducible scope and card-quality reports without promoting drafts to reviewed."""
from pathlib import Path
from collections import Counter
import csv, hashlib, json, re, wave
from content_core import workspace, review_status, release_report

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'src/data/content.json').read_text(encoding='utf-8'))
source=json.loads((ROOT/'content/scope/source.json').read_text(encoding='utf-8'))
variants=json.loads((ROOT/'content/scope/spelling-variants.json').read_text(encoding='utf-8'))
with (ROOT/'content/scope/ecdict-words.tsv').open(encoding='utf-8',newline='') as f:
    candidates={r['word']:set(r['tags'].split()) for r in csv.DictReader(f,delimiter='\t')}
assert len(candidates)==source['candidateWords']
source['adoptedSha256']=hashlib.sha256((ROOT/'content/scope/ecdict-words.tsv').read_bytes()).hexdigest()
source['licenseSha256']=hashlib.sha256((ROOT/'content/scope/ECDICT-LICENSE').read_bytes()).hexdigest()
(ROOT/'content/scope/source.json').write_text(json.dumps(source,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
tags=Counter(tag for group in candidates.values() for tag in sorted(group))
stages=Counter('基础' if group & {'zk','gk'} else '四级' if 'cet4' in group else '六级' for group in candidates.values())
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
missing=sorted(set(candidates)-set(app_words))
extra=sorted(set(app_words)-set(candidates))
report={
 'version':data['version'],'catalogVersion':data['catalogVersion'],'contentHash':data['hash'],'sourceId':source['id'],'sourceRevision':source['revision'],'sourceRawSha256':source['rawSha256'],
 'candidateWords':len(candidates),'sourceTagCounts':dict(tags),'minimumReferenceLevelCounts':dict(stages),
 'multiTagWords':sum(len(group)>1 for group in candidates.values()),'deferredEntries':len(source['deferredEntries']),
 'cards':len(app_words),'levels':dict(Counter(w['level'] for w in data['words'])),
 'candidateMatches':len(set(app_words)&set(candidates)),'missingCards':len(missing),'outsideCandidateScope':extra,
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
    writer.writerows([w,' / '.join(variants.get(w,[w])),' '.join(sorted(candidates[w])),'candidate-card-needed'] for w in missing)
text=f'''# 词库范围与词卡清点

内容版本：{data['version']}。范围来源：[ECDICT]({source['repository']})，固定提交 `{source['revision']}`。保留的字段仅为拼写和级别标签；未复制释义、例句、音标或音频。原始文件SHA-256：`{source['rawSha256']}`。MIT许可见 `../scope/ECDICT-LICENSE`。

| 项目 | 数量 |
| --- | ---: |
| 基础、四级、六级候选拼写并集 | {len(candidates)} |
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

保留各词所有标签。基础层取 `zk` 或 `gk`，其余有 `cet4` 标签的归四级候选，再将其余 `cet6` 词归六级候选。这是来源标签的合并规则，不能代替官方大纲核对。

拼写以小写作为去重键；I及专有名词等源大小写保存在`../scope/spelling-variants.json`，未制作词清单也保留源拼写。制作正式卡片时需要裁定显示形式，不把小写去重键直接当作正确显示拼写。

- 来源标签计数（可能重叠）：{dict(tags)}。
- 最低参考层级去重计数：{dict(stages)}。
- 当前词卡参考层级：{report['levels']}。
- 当前未在本次候选并集出现的词：{', '.join(extra) if extra else '无'}。这些保留为公开标明的扩展词，后续决定是否进入正式必学集合。

## 尚待完成

[考试院大纲页面](https://cet.neea.edu.cn/html1/folder/16113/1588-1.htm)目前列出英语2016年修订版。本报告尚未逐条对照该大纲，因此没有给出官方覆盖率。

{len(app_words)}张卡片为原创辅助编写草稿，不能自动标为人工审核通过。`card-audit.tsv`逐卡记录分组、标签与缺项；`missing-cards.tsv`列出全部待制作候选词。音标、词义、搭配、词根证据与每段音频仍需要完整校审。
'''
(out/'scope.md').write_text(text,encoding='utf-8',newline='\n')
print('Candidate words:',len(candidates),'Cards:',len(app_words),'Missing cards:',len(missing),'Structural issues:',len(problems),flush=True)
if problems:
    print(json.dumps(problems,ensure_ascii=True),flush=True)
    raise SystemExit(1)
