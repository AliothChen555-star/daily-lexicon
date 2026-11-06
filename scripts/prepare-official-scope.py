"""Extract spellings/printed grade marks from the official PDF, never its other prose."""
from pathlib import Path
from urllib.request import Request,urlopen
from importlib.metadata import version
from collections import Counter
import argparse, csv, hashlib, json, difflib
from official_scope import PDF_SHA256, PDF_URL, PAGE_START, PAGE_END, parse_layout, compare_text
from content_core import ROOT, atomic_json, read_json

parser=argparse.ArgumentParser()
parser.add_argument('--pdf',type=Path,default=ROOT/'.toolchain/sources/cet-2016/outline.pdf')
parser.add_argument('--refresh-cache',action='store_true')
args=parser.parse_args()
if not args.pdf.exists():
    args.pdf.parent.mkdir(parents=True,exist_ok=True)
    with urlopen(Request(PDF_URL,headers={'User-Agent':'DailyLexicon-Scope/1.0'}),timeout=60) as response:args.pdf.write_bytes(response.read())
if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=PDF_SHA256:raise SystemExit('Official PDF differs from the pinned source; review before importing.')
import pdfplumber
from pypdf import PdfReader
reader=PdfReader(args.pdf)
if len(reader.pages)!=215:raise SystemExit('Unexpected official PDF page count.')
cache=args.pdf.parent/'parsed-glyphs.json'
tool_versions={'pdfplumber':version('pdfplumber'),'pypdf':version('pypdf')}
cached=read_json(cache) if cache.exists() and not args.refresh_cache else None
if cached and cached.get('tools')==tool_versions:
    parsed=cached
    if parsed['pdfSha256']!=PDF_SHA256:raise SystemExit('Stale glyph cache.')
    pages=parsed['pages']
else:
    pages=[]
    with pdfplumber.open(args.pdf) as pdf:
        for number in range(PAGE_START,PAGE_END+1):
            page=pdf.pages[number-1]
            chars=[{'t':c['text'],'x':c['x0'],'r':c['x1'],'b':c['matrix'][5]} for c in page.chars if 9<c['size']<10.5]
            pages.append({'pdfPage':number,'chars':chars});page.close()
            if number%20==0:print('Extracted PDF page',number,flush=True)
    atomic_json(cache,{'pdfSha256':PDF_SHA256,'tools':tool_versions,'pages':pages})
with (ROOT/'content/scope/ecdict-words.tsv').open(encoding='utf-8',newline='') as stream:known={r['word'] for r in csv.DictReader(stream,delimiter='\t')}
records,page_text=parse_layout(pages,known)
for number in range(PAGE_START,PAGE_END+1):
    if sum(r['pdfPage']==number for r in records)!=(1 if number==PAGE_END else 42):
        raise SystemExit('Unexpected physical row count on PDF page '+str(number))
raw_pages={n:reader.pages[n-1].extract_text() or '' for n in range(PAGE_START,PAGE_END+1)}
cross_check=compare_text(page_text,raw_pages)
failures=[r for r in cross_check if not r['matched']]
if failures:raise SystemExit('Independent text comparison failed on pages: '+','.join(str(r['pdfPage']) for r in failures))
out=ROOT/'content/scope'
record_file=out/'cet2016-records.json'
atomic_json(record_file,{'schemaVersion':1,'sourceId':'cet-2016-official','pdfSha256':PDF_SHA256,'records':records})
source={'id':'cet-2016-official','title':'全国大学英语四、六级考试大纲（2016年修订版）词表',
        'reference':'https://cet.neea.edu.cn/html1/folder/16113/1588-1.htm','url':PDF_URL,'rawSha256':PDF_SHA256,
        'retrievedDate':'2026-11-06','pdfPages':215,'vocabularyPdfPages':[PAGE_START,PAGE_END],
        'printedPages':[16,144],'parserVersion':'cet-layout-v1','tools':{'pdfplumber':version('pdfplumber'),'pypdf':version('pypdf')},
        'declaredHeadwords':5418,'declaredListedForms':2551,'extractedPhysicalRows':len(records),
        'extractedListedCells':sum(len(r['forms'])-1 for r in records),
        'starredRows':sum(r['starred'] for r in records),'crossCheckedPages':len(cross_check),'crossCheckMismatches':len(failures),
        'recordsFile':record_file.name,'adoptedSha256':hashlib.sha256(record_file.read_bytes()).hexdigest(),
        'adoptedFields':['spelling','printed-star','head-or-listed-form','page','row'],
        'scopeStatus':'mechanically-extracted-pending-adjudication',
        'notes':['原PDF不随项目再分发；只保存词形、级别符号及定位事实，不引入其他正文。',
                 '星号直接标记词目；附列形式的六级归属是按所在行继承的编排推定，保留继承依据。',
                 '不把作者公布的词目/附列计数与物理行/单元格数等同；所有计数分别保存，差异尚待裁定。',
                 '斜线、括号及缩写式替换的展开是机械建议；同形异义多行不会被丢弃，不据此宣称完成所有义项。']}
observations={
    'Celsius/-cius':'原文的缩写式展开得到Celcius；已查看原页，原文确为该形式，另行核对后再裁定。',
    'sober/-re':'原文展开得到sobre；已查看原页，原文确为该形式，保留可疑拼写观察，不自动改写为其他词。',
}
source['sourceObservations']=[{'recordId':record['id'],'pdfPage':record['pdfPage'],'expression':form['expression'],
                             'note':observations[form['expression']],'status':'pending-adjudication','observationBy':'Codex visual inspection; not human approval'}
                            for record in records for form in record['forms'] if form['expression'] in observations]
atomic_json(out/'cet2016-source.json',source)
print('Official table:',len(records),'physical rows;',source['extractedListedCells'],'listed cells;',len(cross_check),'pages independently matched.',flush=True)
