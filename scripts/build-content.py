from pathlib import Path
import json, hashlib, re

ROOT = Path(__file__).resolve().parents[1]
topic_data = [
    ('mind','观察与思考','从看见到理解','把观察、感知与判断放在同一条线索里。','认识世界'),
    ('learning','学习与表达','把想法说清楚','沿着阅读、书写与交流，积累表达的词汇。','理解与交流'),
    ('living','生活与关系','与日常重新相遇','认识身边的人，也学会描述关系与感受。','人与生活'),
    ('society','社会与发展','看见变化的力量','从建造与运输，读到社会的发展和转变。','社会观察'),
]
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
}
words=[]
topics=[]
for topic_id,label,subtitle,description,column in topic_data:
    lines=(ROOT/'content/editorial'/f'{topic_id}.tsv').read_text(encoding='utf-8').splitlines()
    topic_words=[]
    for line in lines:
        if not line.strip(): continue
        parts=line.split('|')
        assert len(parts)==9,(topic_id,line)
        word,ipa,pos,meaning,level,family,phrases,example1,example2=parts
        assert family in roots,(word,family)
        def bilingual(item):
            en,zh=item.split('::',1)
            return {'en':en,'zh':zh}
        item={'id':'dl-'+word,'word':word,'ipa':ipa,'pos':pos,'meaning':meaning,'level':level,'topic':topic_id,'family':family,
              'phrases':[bilingual(x) for x in phrases.split(';')], 'examples':[{**bilingual(example1),'audio':'audio/'+word+'--1.wav'},{**bilingual(example2),'audio':'audio/'+word+'--2.wav'}],
              'forms':forms.get(word,[]),'audio':'audio/'+word+'.wav', 'source':'daily-lexicon-editorial-0.1', 'reviewStatus':'initial-editorial'}
        words.append(item)
        topic_words.append(item['id'])
    assert len(topic_words)==30,(topic_id,len(topic_words))
    topics.append({'id':topic_id,'label':label,'subtitle':subtitle,'description':description,'column':column,'words':topic_words})
assert len(words)==120
assert len({w['id'] for w in words})==120
families=[]
for key,(label,meaning,kind,note) in roots.items():
    members=[w['id'] for w in words if w['family']==key]
    if members:
        families.append({'id':key,'label':label,'meaning':meaning,'kind':kind,'note':note,'words':members,'reference':'https://en.wiktionary.org/wiki/'+next(w['word'] for w in words if w['family']==key)})
families.sort(key=lambda r:({'root':0,'family':1,'independent':2}[r['kind']],-len(r['words']),r['id']))
content={'version':'0.1.0','id':'daily-lexicon-editorial-120','title':'基础与四六级试用词包','license':'CC-BY-SA-4.0','words':words,'topics':topics,'families':families,
         'notice':'120词试用包。释义、搭配与例句为本项目编写；分层为学习参考，完整大纲核对和人工复核仍在后续任务中。词根与现代词族分别标注。'}
content['hash']=hashlib.sha256(json.dumps(content,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
target=ROOT/'src/data'
target.mkdir(parents=True,exist_ok=True)
(target/'content.json').write_text(json.dumps(content,ensure_ascii=False,indent=2),encoding='utf-8')
print('Built',len(words),'words,',len(topics),'topics,',len(families),'families.')
