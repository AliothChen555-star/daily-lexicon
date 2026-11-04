from pathlib import Path
import json, hashlib, re

ROOT = Path(__file__).resolve().parents[1]
roots = {
 'spect':('spec / spect','看，观察','root','inspect、aspect、perspective等词的词源与拉丁语“看”的构词形式有关。词形有变化，不按字母相同判断词根。'),
 'scrib':('scrib / script','写','root','scrib与script是“写”的常见构词形式，可联系describe、prescribe与manuscript。'),
 'dict':('dict','说，表达','root','与拉丁语“说”有关。predict可用“提前说出”辅助理解，contradict可用“反着说”辅助理解。'),
 'cred':('cred','相信','root','credible是“可信的”，incredible引申为“难以置信的、极好的”。credit的多个现代义项需结合语境理解。'),
 'struct':('struct','建造，排列','root','construct、structure、reconstruct与infrastructure可联系“建造、组织”的构词线索。'),
 'port':('port','携带，运送','root','transport、portable、support与report的词源中包含“携带、运送”的线索；现代含义结合例句记忆。'),
 'ject':('ject','投，掷','root','reject可联系“往回投”，inject可联系“向内注入”。这是简化的构词记忆线索。'),
 'tract':('tract','拉，引','root','attract可联系“拉向”，distract可联系“拉开注意力”。注意搭配中介词的使用。'),
 'tribut':('tribut','分配，给予','root','contribute与distribute具有共同的历史构词线索，分别联系“贡献”与“分配”。'),
 'form':('form','形状，形成','root','transform、transformation与reform可联系形式或状态的改变。'),
 'flex':('flex','弯曲','root','flexible从“可弯曲”发展出“灵活”的含义，flexibility是相应名词。'),
 'independent':('独立词','按用法理解','independent','这些词本版不作词根拆解，仍完整参加词根轮。使用搭配与例句建立联系。')
}
family_meanings = {
'see':'看见与理解','look':'看与寻找','notice':'察觉变化','observe':'观察与观察者','perceive':'感知与看法',
'think':'思考与想法','consider':'考虑与重新考虑','reflect':'反映与深思','analyze':'分析与分析结果','assume':'假定与假设','infer':'推断与推论','reason':'理由与合理性',
'learn':'学习','teach':'教学','read':'阅读','write':'写作','explain':'解释','express':'表达','communicate':'交流','discuss':'讨论','conclude':'结论',
'friend':'朋友与友谊','help':'帮助','care':'关心与小心','trust':'信任','believe':'相信与信念','create':'创造','connect':'联系','comfort':'舒适与安慰','patient':'耐心','adapt':'适应','sustain':'持续与可持续性','work':'工作','build':'建造'
}
for key,meaning in family_meanings.items():
    roots[key] = (key+' 词族',meaning,'family','按现代派生或相关词形联系记忆。这是词族分组，不将整个英语单词强行称为古典词根。')

modern = {
 'live':'生活与生命','gradual':'逐渐的与逐渐地','frequent':'频繁的与频繁地','occur':'发生与发生的事',
 'breathe':'呼吸的动词与名词','environment':'环境与环境的','pollute':'污染的行为与结果','protect':'保护的行为与措施',
 'nutrition':'营养与营养物质','immune':'免疫的与免疫力','diagnose':'诊断的行为与结果','ecology':'生态与生态相关构词','conserve':'节约与保护',
 'science':'科学与研究用语','method':'方法与方法论','measure':'测量与测得的数值','accurate':'准确的与准确性',
 'empirical':'实证的与实证方式','vary':'可变的与差异','correlate':'相关与相关性','cause':'因果的与因果关系',
 'verify':'核实与验证','replicate':'重复实验与重现','legislate':'立法与法律','democracy':'民主与民主的',
 'autonomy':'自主权与自主的','collaborate':'合作与合作过程','coordinate':'协调与协调过程','integrate':'整合与整合过程',
 'diverse':'不同、多样与多样性','allocate':'分配与分配结果','implement':'落实与实施','transparent':'透明的与透明度','legitimate':'正当的与正当性',
}
for key,meaning in modern.items():
    roots[key]=(key+' 词族',meaning,'family','把相关的现代词形或构词成分放在一起记忆；不将整个单词强行解释为古典词根。')
roots['ecology']=('eco- 相关词','生态与环境','family','ecology与ecological是相关词形；ecosystem使用相同的eco-生态构词成分，不是ecology的直接派生词。')
roots['nutrition']=('nutri- 相关词','营养与养分','family','nutrition与nutrient是词义和历史词形相关的词，不把nutrient当作nutrition的规则派生。')
roots['sequ']=('sequ / secu','跟随，接续','root','sequence与consequence的词源均可联系拉丁语“跟随”的线索；consequence由此发展出“后果”的含义。')
independent = {
 'function-reference':'指代与限定词','function-links':'连接词与时间用语','function-relations':'关系与方向用语',
 'everyday-actions':'日常动作独立词','everyday-places':'日常生活独立词','say':'say','know':'know','use':'use',
 'time-basics':'基础时间独立词','time-change':'过程与持续独立词','health':'健康相关独立词',
 'nature-resources':'资源与环境独立词','measurement':'测量相关独立词','scientific-reasoning':'研究与推理独立词','civic-practices':'公共生活独立词',
}
for key,label in independent.items():
    roots[key]=(label,'按用法理解','independent','这些词按学习语境归置，不认定具有共同词根或直接派生关系。第二轮仍包含本组的每一个词。')

forms = {
 'see':['过去式 saw','过去分词 seen','第三人称 sees'],
 'think':['过去式与过去分词 thought'],
 'thought':['复数 thoughts','也是think的过去式与过去分词'],
 'teach':['过去式与过去分词 taught'],
 'read':['过去式 read /red/','过去分词 read /red/','本卡主读音为原形 /riːd/'],
 'write':['过去式 wrote','过去分词 written','现在分词 writing'],
 'build':['过去式与过去分词 built'],
 'learn':['过去式 learned 或 learnt','过去分词 learned 或 learnt'],
 'analysis':['复数 analyses /əˈnæləsiːz/'],
 'belief':['复数 beliefs'],
 'family':['复数 families'],
 'manuscript':['复数 manuscripts'],
 'vocabulary':['复数 vocabularies（表示多套词汇时）'],
 'transport':['本卡重点为名词','动词读音的重音可能不同'],
 'suspect':['本卡重点为动词','名词 suspect 的重音不同'],
 'this':['复数 these'], 'that':['复数 those'], 'they':['宾格 them','所有格 their'], 'we':['宾格 us','所有格 our'],
 'he':['宾格 him','所有格 his'], 'she':['宾格 her','所有格 her'], 'it':['所有格 its'],
 'go':['过去式 went','过去分词 gone','现在分词 going'], 'come':['过去式 came','过去分词 come'],
 'take':['过去式 took','过去分词 taken'], 'give':['过去式 gave','过去分词 given'],
 'make':['过去式与过去分词 made'], 'get':['过去式 got','美式过去分词常用 gotten'],
 'have':['过去式与过去分词 had','第三人称 has'], 'do':['过去式 did','过去分词 done','第三人称 does'],
 'say':['过去式与过去分词 said /sed/'], 'know':['过去式 knew','过去分词 known'],
 'find':['过去式与过去分词 found'], 'leave':['过去式与过去分词 left'],
 'bring':['过去式与过去分词 brought'], 'keep':['过去式与过去分词 kept'], 'put':['过去式与过去分词 put'],
 'eat':['过去式 ate','过去分词 eaten'], 'drink':['过去式 drank','过去分词 drunk'],
 'live':['本卡为动词 /lɪv/','形容词live常读 /laɪv/'], 'life':['复数 lives /laɪvz/'],
 'house':['本卡为名词 /haʊs/','动词house读 /haʊz/'], 'person':['常用复数 people','persons用于特定正式语境'],
 'child':['复数 children'], 'good':['比较级 better','最高级 best'],
 'use':['本卡为动词 /juːz/','名词use读 /juːs/'], 'begin':['过去式 began','过去分词 begun'],
 'breathe':['动词 /briːð/','名词breath读 /breθ/'], 'diagnosis':['复数 diagnoses'],
 'hypothesis':['复数 hypotheses'], 'phenomenon':['复数 phenomena'],
 'frequent':['本卡为形容词，重音在首音节','动词frequent的重音不同'],
 'coordinate':['本卡为动词，词尾读 /neɪt/','名词和形容词的词尾常读 /nət/'],
 'legitimate':['本卡为形容词，词尾读 /mət/','动词legitimate的词尾读 /meɪt/'],
}
words=[]
topics=[]
scenes=[]
concepts=[]
taxonomy=json.loads((ROOT/'content/semantic.json').read_text(encoding='utf-8'))
seen=set()
legacy=json.loads((ROOT/'content/catalogs/0.1.0.json').read_text(encoding='utf-8'))
for topic in taxonomy:
    topic_id,label,subtitle=topic['id'],topic['label'],topic['subtitle']
    lines=(ROOT/'content/editorial'/f'{topic_id}.tsv').read_text(encoding='utf-8').splitlines()
    topic_words=[]
    parsed={}
    for line in lines:
        if not line.strip(): continue
        parts=line.split('|')
        assert len(parts)==9,(topic_id,line)
        word,ipa,pos,meaning,level,family,phrases,example1,example2=parts
        assert family in roots,(word,family)
        def bilingual(item):
            en,zh=item.split('::',1)
            return {'en':en,'zh':zh}
        assert word not in seen,(word,'duplicate word')
        seen.add(word)
        item={'id':'dl-'+word,'word':word,'ipa':ipa,'pos':pos,'meaning':meaning,'level':level,'topic':topic_id,'family':family,
              'phrases':[bilingual(x) for x in phrases.split(';')], 'examples':[{**bilingual(example1),'audio':'audio/'+word+'--1.wav'},{**bilingual(example2),'audio':'audio/'+word+'--2.wav'}],
              'forms':forms.get(word,[]),'audio':'audio/'+word+'.wav', 'source':'daily-lexicon-editorial-0.1' if 'dl-'+word in legacy['wordIds'] else 'daily-lexicon-editorial-0.2', 'reviewStatus':'editorial-draft'}
        parsed[word]=item
    assigned=set()
    for scene in topic['scenes']:
        scene_words=[]
        for concept in scene['concepts']:
            ids=[]
            for word in concept['words']:
                assert word in parsed and word not in assigned,(word,'invalid semantic position')
                assigned.add(word)
                item=parsed[word]
                item.update({'scene':scene['id'],'concept':concept['id']})
                words.append(item)
                ids.append(item['id'])
            concepts.append({'id':concept['id'],'label':concept['label'],'topic':topic_id,'scene':scene['id'],'words':ids})
            scene_words.extend(ids)
        scenes.append({'id':scene['id'],'label':scene['label'],'topic':topic_id,'concepts':[c['id'] for c in scene['concepts']],'words':scene_words})
        topic_words.extend(scene_words)
    assert assigned==set(parsed),(topic_id,'unclassified words')
    assert len(topic_words)==30,(topic_id,len(topic_words))
    topics.append({'id':topic_id,'label':label,'subtitle':subtitle,'description':subtitle,'column':label,'scenes':[s['id'] for s in topic['scenes']],'words':topic_words})
assert len(words)==300
assert len({w['id'] for w in words})==300
assert set(legacy['wordIds'])<=set(w['id'] for w in words),'stable IDs must be preserved'
families=[]
for key,(label,meaning,kind,note) in roots.items():
    members=[w['id'] for w in words if w['family']==key]
    if members:
        families.append({'id':key,'label':label,'meaning':meaning,'kind':kind,'note':note,'words':members,'reference':'https://en.wiktionary.org/wiki/'+next(w['word'] for w in words if w['family']==key)})
families.sort(key=lambda r:({'root':0,'family':1,'independent':2}[r['kind']],-len(r['words']),r['id']))
content={'version':'0.2.0','id':'daily-lexicon-editorial','title':'基础与四六级300词试用包','license':'CC-BY-SA-4.0','words':words,'topics':topics,'scenes':scenes,'concepts':concepts,'families':families,
         'notice':'300词试用包，基础、四级、六级参考层级各100词。三级语义目录覆盖全部词条；正式大纲核对和完整人工校审仍在进行，不能视为完整六级词库。词根、现代词族和独立词分别标注。'}
content['hash']=hashlib.sha256(json.dumps(content,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
target=ROOT/'src/data'
target.mkdir(parents=True,exist_ok=True)
(target/'content.json').write_text(json.dumps(content,ensure_ascii=False,indent=2),encoding='utf-8')
print('Built',len(words),'words,',len(topics),'topics,',len(families),'families.')
