"""Combine a pinned official spelling index with the retained school-level reference."""
from pathlib import Path
from collections import defaultdict, Counter
import csv, hashlib, json

ROOT=Path(__file__).resolve().parents[1]
def read_json(path):return json.loads(Path(path).read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def reference_level(tags):
    return '基础' if set(tags)&{'zk','gk'} else '四级' if 'cet4' in tags else '六级'

def load_scope(root=ROOT):
    root=Path(root);base=root/'content/scope'
    source=read_json(base/'source.json')
    if sha(base/'ecdict-words.tsv')!=source['adoptedSha256']:raise ValueError('候选词文件与固定来源校验值不一致。')
    with (base/'ecdict-words.tsv').open(encoding='utf-8',newline='') as stream:
        reference={r['word']:r['tags'].split() for r in csv.DictReader(stream,delimiter='\t')}
    if len(reference)!=source['candidateWords']:raise ValueError('固定来源词数不一致。')
    study_file=base/'study-source.json'
    if not study_file.exists():
        entries={w:{'word':w,'display':'I' if w=='i' else w,'level':reference_level(tags),'required':True,'tags':tags,'origins':['reference'],'evidence':[]} for w,tags in reference.items()}
        return {'source':source,'reference':reference,'entries':entries,'official':None,'study':None}
    study=read_json(study_file);official=read_json(base/'cet2016-source.json')
    if study['referenceSha256']!=source['adoptedSha256'] or sha(base/'study-scope.tsv')!=study['adoptedSha256']:
        raise ValueError('学习范围与固定来源不一致，请重新生成范围索引。')
    if sha(base/'cet2016-records.json')!=official['adoptedSha256'] or study['officialRecordsSha256']!=official['adoptedSha256']:
        raise ValueError('官方词表索引与来源校验值不一致。')
    if official['crossCheckMismatches'] or official['crossCheckedPages']!=129:
        raise ValueError('官方词表提取尚未通过完整页核对。')
    entries={}
    with (base/'study-scope.tsv').open(encoding='utf-8',newline='') as stream:
        for row in csv.DictReader(stream,delimiter='\t'):
            if row['word'] in entries:raise ValueError('学习范围含有重复拼写键。')
            entries[row['word']]={'word':row['word'],'display':row['display'],'level':row['level'],'required':row['required']=='yes',
                                 'tags':row['tags'].split(),'origins':row['origins'].split(),
                                 'evidence':json.loads(row['evidence'])}
    if len(entries)!=study['candidateWords'] or sum(e['required'] for e in entries.values())!=study['targetWords']:
        raise ValueError('学习范围计数不一致。')
    return {'source':source,'reference':reference,'entries':entries,'official':official,'study':study}

def build_scope(root=ROOT):
    root=Path(root);base=root/'content/scope'
    source=read_json(base/'source.json');official=read_json(base/'cet2016-source.json')
    records=read_json(base/'cet2016-records.json')['records']
    if sha(base/'cet2016-records.json')!=official['adoptedSha256']:raise ValueError('官方索引发生未登记的改动。')
    with (base/'ecdict-words.tsv').open(encoding='utf-8',newline='') as stream:
        reference={r['word']:r['tags'].split() for r in csv.DictReader(stream,delimiter='\t')}
    evidence=defaultdict(list);spellings=defaultdict(list)
    for record in records:
        for form in record['forms']:
            for spelling in form['variants']:
                key=spelling.casefold()
                if spelling not in spellings[key]:spellings[key].append(spelling)
                evidence[key].append({'recordId':record['id'],'pdfPage':record['pdfPage'],'printedPage':record['printedPage'],
                                      'role':form['role'],'grade':record['grade'],'gradeBasis':'printed-head-mark' if form['role']=='head' else 'inherited-from-row',
                                      'expression':form['expression'],'slot':form['slot'],'expansion':form['expansion']})
    rows=[]
    for word in sorted(set(reference)|set(evidence)):
        tags=reference.get(word,[]);basic=bool(set(tags)&{'zk','gk'});facts=evidence.get(word,[])
        origins=(['official'] if facts else [])+(['basic'] if basic else [])+(['reference'] if tags else [])
        grades={e['grade'] for e in facts}
        level='基础' if basic else '四级' if 'cet4' in grades else '六级' if grades else '扩展'
        display=spellings[word][0] if facts else 'I' if word=='i' else word
        rows.append([word,display,level,'yes' if basic or facts else 'no',' '.join(tags),' '.join(origins),json.dumps(facts,ensure_ascii=False,separators=(',',':'))])
    with (base/'study-scope.tsv').open('w',encoding='utf-8',newline='') as stream:
        writer=csv.writer(stream,delimiter='\t',lineterminator='\n');writer.writerow(['word','display','level','required','tags','origins','evidence']);writer.writerows(rows)
    basic={w for w,tags in reference.items() if set(tags)&{'zk','gk'}}
    required=set(evidence)|basic
    normalization=[{'recordId':r['id'],'pdfPage':r['pdfPage'],'slot':f['slot'],'expression':f['expression'],'variants':f['variants'],'status':'pending-adjudication'} for r in records for f in r['forms'] if f['expansion']=='proposed']
    homographs={word:sorted({e['recordId'] for e in facts if e['role']=='head'}) for word,facts in evidence.items()}
    homographs={w:ids for w,ids in homographs.items() if len(ids)>1}
    comparison={
        'schemaVersion':1,'id':'cet2016-basic-scope-v1','status':'provisional-pending-adjudication',
        'referenceSha256':source['adoptedSha256'],'officialRecordsSha256':official['adoptedSha256'],
        'file':'study-scope.tsv','adoptedSha256':sha(base/'study-scope.tsv'),'candidateWords':len(rows),
        'targetWords':len(required),'referenceWords':len(reference),'basicWords':len(basic),'officialSpellings':len(evidence),
        'officialOnlyWords':len(set(evidence)-set(reference)),'referenceOnlyWords':len(set(reference)-required),
        'normalizationCells':len(normalization),'homographSpellings':len(homographs),
        'policy':'基础取固定参考来源的zk/gk；合并官方所有词目、附列形式及显式变体机械展开。参考来源独有的四六级标签不自动进入目标；保留为可检索参考项。此目标待范围裁定，不表示所有义项已成卡。',
        'countConvention':'官方标示5418词目、2551附列形式；提取的5377物理行、2519附列单元格、展开去重拼写分别计数，尚未将其计数口径视为一致。',
    }
    for file,value in [('study-source.json',comparison),('normalization-queue.json',normalization),('homographs.json',homographs)]:
        (base/file).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    out=root/'content/reports';out.mkdir(parents=True,exist_ok=True)
    with (out/'scope-comparison.tsv').open('w',encoding='utf-8',newline='') as stream:
        writer=csv.writer(stream,delimiter='\t',lineterminator='\n');writer.writerow(['word','scope','displayLevel','referenceTags','officialGrades','roles','pdfPages'])
        for word,display,level,required_flag,tags,origins,facts in rows:
            facts=json.loads(facts)
            kind='official-only' if word in evidence and word not in reference else 'official-and-reference' if word in evidence else 'basic-supplement' if word in basic else 'reference-only'
            writer.writerow([word,kind,level,tags,' '.join(sorted({f['grade']for f in facts})),' '.join(sorted({f['role']for f in facts})),' '.join(map(str,sorted({f['pdfPage']for f in facts})))])
    report=f'''# 官方词表提取与学习范围核对

来源：[考试院大纲入口]({official['reference']})、[2016年修订版原PDF]({official['url']})。PDF SHA-256：`{official['rawSha256']}`。提取版本：`{official['parserVersion']}`。

## 提取事实

| 项目 | 数量或范围 |
| --- | ---: |
| PDF页码／书内页码 | 21–149／16–144 |
| 交叉核对通过的词表页 | {official['crossCheckedPages']} |
| 提取的物理词目行 | {len(records)} |
| 提取的附列单元格 | {sum(len(r['forms'])-1 for r in records)} |
| 原书标示的词目／附列计数 | 5418／2551 |
| 全部形式与变体展开后的去重拼写 | {len(evidence)} |
| 斜线、括号等变体单元 | {len(normalization)} |
| 词目分列的同形拼写 | {len(homographs)} |

129页均有原始文字提取与按版面重组的文字序列逐页对齐。128页各有42个物理行，末页1行。物理行、单元格、作者公布计数和去重拼写是不同统计口径，仍需裁定，不强行凑数。

## 当前学习范围

| 项目 | 数量 |
| --- | ---: |
| 固定ECDICT参考拼写 | {len(reference)} |
| 其中基础标签zk/gk | {len(basic)} |
| 官方展开中旧参考名单未出现的拼写 | {len(set(evidence)-set(reference))} |
| 官方展开＋基础参考形成的目标拼写 | {len(required)} |
| 旧参考独有、未自动纳入目标的拼写 | {len(set(reference)-required)} |
| 全部可查询索引拼写 | {len(rows)} |

目标目前为待裁定集合，不能当成最终官方六级词数。旧参考来源的四六级标签只用作对照；基础标签与官方词形结合。附列形式的级别按所在行继承，这是编排推定，保留依据。同一拼写在多个词目行或不同级别出现时，全部记录保留，不能据单张卡的拼写就认定义项齐全。

## 保留的依据与待办

`../scope/cet2016-records.json`记录每行、每个词形、星号、角色及页码；`scope-comparison.tsv`逐词列出来源、级别、角色和页码。变体展开明细在`../scope/normalization-queue.json`，同形词目在`../scope/homographs.json`。

原PDF中的`Celsius/-cius`与`sober/-re`已查看原页，分别记录在来源观察中；机械展开产生的可疑形式保留待裁定，不擅自改写原文或视为审核通过。其余变体、同形异义、计数口径与现有非目标卡的去留同样需要裁定。

仓库仅保存词形、级别符号和定位事实；原PDF缓存于本机工具目录，不随项目再分发。此词表本身不提供词性、释义或读音，完整词卡仍需独立制作与校审。现有卡数及缺词情况见`scope.md`，正式发行条件见`release.json`。
'''
    (out/'official-scope.md').write_text(report,encoding='utf-8',newline='\n')
    return comparison

if __name__=='__main__':
    report=build_scope();print('Study target:',report['targetWords'],'Official spellings:',report['officialSpellings'],'Reference-only:',report['referenceOnlyWords'])
