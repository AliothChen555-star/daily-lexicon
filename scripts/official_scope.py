"""Pure parsing helpers for the pinned CET-2016 vocabulary table (no PDF dependency)."""
from collections import defaultdict
from statistics import median
import re, unicodedata

PDF_SHA256 = '9166d3c03b7bc43abd9d9df91bd2ef8085b4419286f1e5ca100dea68f3cfd1f1'
PDF_URL = 'https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf'
PAGE_START, PAGE_END = 21, 149

def normalize(text):
    # The PDF maps the printed hyphen/apostrophe to these glyph codes.
    return unicodedata.normalize('NFKC',text.replace('Ｇ','-').replace('\U001001b3',"'")).strip()

def variants(expression):
    expression=normalize(expression)
    alternatives=expression.split('/')
    result=[]
    for part in alternatives:
        if part.startswith('-'):
            suffix=part[1:]
            if not suffix or len(suffix)>len(alternatives[0]):raise ValueError('Invalid abbreviated variant: '+expression)
            part=alternatives[0][:-len(suffix)]+suffix
        match=re.search(r'\(([^()]+)\)',part)
        if match:
            before,optional,after=part[:match.start()],match.group(1),part[match.end():]
            values=[before+after,before+optional+after]
            if expression=="coup(d'état)":values=['coup',"coup d'état"]
        else:values=[part]
        for value in values:
            if not re.fullmatch(r"[A-Za-zé]+(?:[- '][A-Za-zé]+)*(?:\.)?",value):
                raise ValueError('Unresolved expression: '+expression+' => '+value)
            if value not in result:result.append(value)
    return result

def cluster_rows(chars):
    groups=[]
    for char in sorted(chars,key=lambda c:-c['b']):
        if not groups or groups[-1][0]['b']-char['b']>3:groups.append([])
        groups[-1].append(char)
    return groups

def split_cells(group,left):
    # The pinned source has five aligned columns, with long cells skipping a column.
    stops=[left+87.429,left+169.619,left+251.810,left+334.000]
    cells=[];cell=[]
    for char in sorted(group,key=lambda c:c['x']):
        if cell and (any(abs(char['x']-s)<.015 for s in stops) or char['x']-cell[-1]['x']>20):
            cells.append(cell);cell=[]
        cell.append(char)
    if cell:cells.append(cell)
    return cells

def parse_layout(pages,known_words):
    all_pairs,word_pairs=defaultdict(list),defaultdict(list)
    prepared=[]
    for page in pages:
        groups=cluster_rows(page['chars'])
        left=min(c['x'] for group in groups for c in group if re.match('[A-Za-z]',c['t']))
        rows=[]
        for group in groups:
            cells=split_cells(group,left)
            for chars in cells:
                text=''.join(c['t'] for c in chars).removeprefix('★')
                for a,b in zip(chars,chars[1:]):
                    delta=b['x']-a['x']
                    if .1<delta<13:
                        all_pairs[(a['t'],b['t'])].append(delta)
                        if text.lower() in known_words:word_pairs[(a['t'],b['t'])].append(delta)
            rows.append((group,cells))
        prepared.append((page['pdfPage'],rows))
    # Embedded glyph boxes overlap; pair advances recover spaces without splitting
    # wide letters such as m/w. No spellings are taken from the reference lexicon.
    advances={k:median(v) for k,v in all_pairs.items()}
    advances.update({k:median(v) for k,v in word_pairs.items()})
    records=[];page_text={}
    for pdf_page,rows in prepared:
        row_number=0;page_expressions=[]
        for group,cells in rows:
            expressions=[]
            for chars in cells:
                text=''
                for i,char in enumerate(chars):
                    if i:
                        prev=chars[i-1]
                        if char['x']-prev['x']>advances.get((prev['t'],char['t']),5)+1.6 and not {prev['t'],char['t']}&set('/()Ｇ★'):
                            text+=' '
                    text+=char['t']
                expressions.append(text)
            if not re.match(r'^(★\s*)?[A-Za-z]',expressions[0]):continue
            row_number+=1
            starred=expressions[0].startswith('★')
            expressions[0]=expressions[0].removeprefix('★').strip()
            forms=[]
            for slot,expression in enumerate(expressions):
                expression=normalize(expression)
                forms.append({'slot':slot,'role':'head' if slot==0 else 'listed-form',
                              'expression':expression,'variants':variants(expression),
                              'expansion':'proposed' if '/' in expression or '(' in expression else 'literal'})
            records.append({'id':f'cet16-{pdf_page:03}-{row_number:02}',
                            'pdfPage':pdf_page,'printedPage':pdf_page-5,'row':row_number,
                            'grade':'cet6' if starred else 'cet4','starred':starred,
                            'baseline':round(sum(c['b'] for c in group)/len(group),2),'forms':forms})
            page_expressions.append(('★' if starred else '')+''.join(expressions))
        page_text[pdf_page]=''.join(page_expressions)
    return records,page_text

def comparable(text):
    return re.sub(r'\s+','',normalize(text))

def compare_text(records_text,extracted_pages):
    result=[]
    for page,text in records_text.items():
        lines=[]
        for line in extracted_pages[page].splitlines():
            line=re.sub(r'^\d+','',normalize(line))
            if re.match(r'^(★\s*)?/?[A-Za-z]',line):lines.append(line)
        other=''.join(lines)
        result.append({'pdfPage':page,'matched':comparable(text)==comparable(other)})
    return result
