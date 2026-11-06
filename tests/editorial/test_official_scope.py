import unittest, json, hashlib, csv
from collections import Counter
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from content_core import ROOT
from official_scope import variants,normalize,parse_layout,compare_text,PDF_SHA256
from study_scope import load_scope,build_scope

class OfficialParserTests(unittest.TestCase):
    def test_variant_expansion_preserves_source_spellings_without_claiming_approval(self):
        cases={'organize/Ｇise':['organize','organise'],'advisor/Ｇer':['advisor','adviser'],
               'judg(e)ment':['judgment','judgement'],'a/an':['a','an'],
               "coup(d\U001001b3état)":['coup',"coup d'état"],
               'Celsius/Ｇcius':['Celsius','Celcius']}
        for original,expected in cases.items():self.assertEqual(variants(original),expected)
        with self.assertRaises(ValueError):variants('word/-too-long-for-the-word')

    def test_layout_keeps_star_and_listed_form_when_glyph_baselines_differ(self):
        def chars(text,x,y):return [{'t':c,'x':x+5*i,'r':x+5*i+9.7,'b':y+1.5 if c=='/' else y-.7 if c in 'gpqy' else y} for i,c in enumerate(text)]
        glyphs=chars('a/an',81,668.8)+chars('able',81,654.6)+chars('ability',168.429,654.6)+chars('abide',81,640.4)
        glyphs.append({'t':'★','x':69.5,'r':79.2,'b':640.4})
        records,_=parse_layout([{'pdfPage':21,'chars':glyphs}],{'able','ability','abide'})
        self.assertEqual(len(records),3)
        self.assertEqual(records[0]['forms'][0]['variants'],['a','an'])
        self.assertEqual(records[1]['forms'][1]['role'],'listed-form')
        self.assertEqual(records[1]['forms'][1]['variants'],['ability'])
        self.assertEqual(records[2]['grade'],'cet6')

    def test_independent_text_comparison_handles_superscript_before_a_slash(self):
        self.assertTrue(compare_text({41:'check/cheque'},{41:'check\n２/cheque\n'})[0]['matched'])
        self.assertFalse(compare_text({41:'check/cheque'},{41:'check\n２/check\n'})[0]['matched'])

class OfficialScopeArtifactTests(unittest.TestCase):
    def test_source_hash_and_complete_page_inventory_match(self):
        base=ROOT/'content/scope'
        source=json.loads((base/'cet2016-source.json').read_text(encoding='utf-8'))
        payload=(base/'cet2016-records.json').read_bytes();data=json.loads(payload)
        self.assertEqual(hashlib.sha256(payload).hexdigest(),source['adoptedSha256'])
        self.assertEqual(data['pdfSha256'],PDF_SHA256)
        counts=Counter(r['pdfPage'] for r in data['records'])
        self.assertEqual(set(counts),set(range(21,150)))
        for page,count in counts.items():self.assertEqual(count,1 if page==149 else 42)
        self.assertEqual(len(data['records']),5377)
        self.assertEqual(sum(len(r['forms'])-1 for r in data['records']),2519)
        self.assertEqual(source['declaredHeadwords'],5418)
        self.assertEqual(source['crossCheckedPages'],129)
        self.assertEqual(source['scopeStatus'],'mechanically-extracted-pending-adjudication')

    def test_combined_target_keeps_new_official_words_and_reference_only_items_separate(self):
        scope=load_scope();entries=scope['entries']
        self.assertEqual(sum(e['required'] for e in entries.values()),8375)
        for word in ['a','the','smartphone','podcast','swipe','accountability']:
            self.assertTrue(entries[word]['required'],word)
        self.assertFalse(entries['frequently']['required'])
        self.assertIn('reference',entries['frequently']['origins'])
        self.assertEqual({e['grade'] for e in entries['appropriate']['evidence']},{'cet4','cet6'})
        self.assertEqual(len({e['recordId'] for e in entries['appropriate']['evidence'] if e['role']=='head'}),2)
        self.assertTrue(any(e['role']=='listed-form' and e['gradeBasis']=='inherited-from-row' for e in entries['accountability']['evidence']))
        self.assertEqual(entries['april']['display'],'April')
