import unittest, tempfile, json, sqlite3, threading, urllib.request, urllib.error, hashlib
from pathlib import Path
from contextlib import closing
from http.server import ThreadingHTTPServer
from fixtures import make_fixture,make_official_fixture
from content_core import REVIEW_AXES, atomic_json, read_json, workspace, review_status, submit_review, build_database, release_report, digest
from importlib.util import spec_from_file_location, module_from_spec
server_spec=spec_from_file_location('editorial_server',Path(__file__).resolve().parents[2]/'scripts/editorial-server.py')
server_module=module_from_spec(server_spec);server_spec.loader.exec_module(server_module)

class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='lexicon-unit-')
        self.root=make_fixture(Path(self.temp.name))

    def tearDown(self):self.temp.cleanup()

    def approval(self):
        ws=workspace(self.root)
        return {'wordId':'dl-see','fingerprint':ws['fingerprints']['dl-see'],'decision':'approved','reviewer':'isolated-test-reviewer','checks':{k:True for k in REVIEW_AXES},'evidence':'隔离自动测试记录，不是对真实词卡的人工审核。'}

    def test_database_preserves_cards_and_separates_missing_candidates(self):
        report=build_database(self.root)
        with closing(sqlite3.connect(self.root/'public/lexicon.sqlite')) as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM candidates').fetchone()[0],2)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM words').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM examples').fetchone()[0],2)
            saved=json.loads(db.execute("SELECT data FROM words WHERE id='dl-see'").fetchone()[0])
            self.assertEqual(saved,read_json(self.root/'src/data/content.json')['words'][0])
        self.assertEqual(report['missingCards'],1)
        self.assertEqual(report['targetCards']+report['missingCards'],report['targetWords'])
        self.assertFalse(report['ready'])

    def test_approval_requires_signature_evidence_and_all_six_checks(self):
        for field,value in [('reviewer',''),('evidence','太短'),('checks',{'meaning':True})]:
            request=self.approval();request[field]=value
            with self.assertRaises(ValueError):submit_review(self.root,request)
        request=self.approval();request['checks']['pronunciation']=False
        with self.assertRaises(ValueError):submit_review(self.root,request)
        self.assertEqual(read_json(self.root/'content/reviews.json')['records'],[])

    def test_append_only_reviews_survive_rebuild_and_changes_request_supersedes(self):
        submit_review(self.root,self.approval())
        self.assertEqual(review_status(workspace(self.root),'dl-see'),'approved')
        request=self.approval();request['decision']='changes-requested';request['checks']['usage']=False
        submit_review(self.root,request)
        ws=workspace(self.root)
        self.assertEqual(len(ws['reviews']['records']),2)
        self.assertEqual(review_status(ws,'dl-see'),'changes-requested')
        self.assertEqual(release_report(ws)['approvedCards'],0)

    def test_changed_audio_or_content_invalidates_approval_and_stale_submission(self):
        request=self.approval();submit_review(self.root,request)
        sound=self.root/'public/audio/see.wav';sound.write_bytes(sound.read_bytes()+b'changed')
        ws=workspace(self.root)
        self.assertEqual(review_status(ws,'dl-see'),'stale')
        self.assertEqual(release_report(ws)['approvedCards'],0)
        self.assertTrue(ws['audioIssues'])
        with self.assertRaises(ValueError):submit_review(self.root,request)

    def test_changed_family_or_translation_invalidates_approval(self):
        request=self.approval();submit_review(self.root,request)
        data=read_json(self.root/'src/data/content.json');data['families'][0]['note']+=' 更改构词说明。'
        data['words'][0]['examples'][0]['zh']+=' 校订。'
        data['hash']=digest({k:v for k,v in data.items() if k!='hash'})
        atomic_json(self.root/'src/data/content.json',data)
        self.assertEqual(review_status(workspace(self.root),'dl-see'),'stale')

    def test_stale_structure_report_and_fake_platform_evidence_cannot_pass(self):
        policy=read_json(self.root/'content/release-policy.json')
        for item in policy['platforms'].values():
            item.update(status='approved',appVersion='1.0.0-dev.1',contentHash=workspace(self.root)['data']['hash'],artifactSha256='a'*64,evidence='隔离测试的虚构平台证据，不存在对应安装包。',artifactFile='release/missing.zip')
        atomic_json(self.root/'content/release-policy.json',policy)
        atomic_json(self.root/'content/reports/scope.json',{'contentHash':'stale','structuralIssues':[]})
        report=release_report(workspace(self.root));checks={c['id']:c for c in report['checks']}
        self.assertFalse(report['ready'])
        for key in ['structure','windows','android','version']:self.assertFalse(checks[key]['passed'])

    def test_undeclared_content_edits_and_scope_file_edits_are_rejected(self):
        data=read_json(self.root/'src/data/content.json');data['words'][0]['meaning']='changed'
        atomic_json(self.root/'src/data/content.json',data)
        with self.assertRaises(ValueError):workspace(self.root)
        make_fixture(self.root)
        with (self.root/'content/scope/ecdict-words.tsv').open('ab') as stream:stream.write(b'changed\n')
        with self.assertRaises(ValueError):workspace(self.root)

    def test_complete_isolated_evidence_passes_and_changed_artifact_blocks_again(self):
        submit_review(self.root,self.approval())
        atomic_json(self.root/'package.json',{'version':'1.0.0'})
        policy=read_json(self.root/'content/release-policy.json')
        ws=workspace(self.root)
        policy['officialScope'].update(status='approved',reviewer='isolated-test-reviewer',evidence='隔离测试来源已核对，不能作为项目实际验收。',adoptedSha256=ws['source']['adoptedSha256'])
        policy['scopeDecisions']=[{'word':'abandon','decision':'exclude','reviewer':'isolated-test-reviewer','evidence':'隔离测试范围只有see，本测试排除另一个候选词。'}]
        (self.root/'release').mkdir()
        for name,result in policy['platforms'].items():
            file=self.root/'release'/f'{name}.test';file.write_bytes(b'isolated-test-artifact')
            result.update(status='approved',appVersion='1.0.0',contentHash=ws['data']['hash'],artifactFile='release/'+file.name,artifactSha256=hashlib.sha256(file.read_bytes()).hexdigest(),evidence='隔离测试产物的验证记录，非实际平台验收。')
        policy['distribution'].update(status='approved',evidence='隔离测试的许可与签名记录，非实际正式发行依据。')
        atomic_json(self.root/'content/release-policy.json',policy)
        self.assertTrue(release_report(workspace(self.root))['ready'])
        (self.root/'release/windows.test').write_bytes(b'changed-artifact')
        self.assertFalse(release_report(workspace(self.root))['ready'])

class BundledDatabaseTests(unittest.TestCase):
    def test_bundled_database_matches_the_current_content_snapshot(self):
        from content_core import ROOT
        data=read_json(ROOT/'src/data/content.json')
        current=workspace(ROOT)
        with closing(sqlite3.connect(ROOT/'public/lexicon.sqlite')) as db:
            content_hash=json.loads(db.execute("SELECT value FROM metadata WHERE key='contentHash'").fetchone()[0])
            self.assertEqual(content_hash,data['hash'])
            self.assertEqual([json.loads(row[0]) for row in db.execute('SELECT data FROM words ORDER BY ordinal')],data['words'])
            self.assertEqual(dict(db.execute('SELECT id,fingerprint FROM words')),current['fingerprints'])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])

class EditorialAPITests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='lexicon-api-');self.root=make_fixture(Path(self.temp.name))
        build_database(self.root)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),server_module.handler_for(self.root,'test-token'))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.base=f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()

    def request(self,path,body=None,headers=None):
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers or {})
        with urllib.request.urlopen(req) as response:return json.load(response)

    def test_search_handles_quote_and_missing_entry_without_fake_card(self):
        result=self.request('/api/entries?q=abandon&status=missing')
        self.assertEqual(result['total'],1);self.assertIsNone(result['entries'][0]['id'])
        self.assertEqual(self.request('/api/entries?q=%27%20OR%201%3D1')['total'],0)
        self.assertEqual(self.request('/api/cards/dl-see')['word']['word'],'see')

    def test_official_evidence_and_reference_only_filter_are_available(self):
        make_official_fixture(self.root);build_database(self.root)
        result=self.request('/api/entries?q=smartphone&scope=target')
        self.assertEqual(result['total'],1)
        self.assertTrue(result['entries'][0]['required'])
        self.assertTrue(json.loads(result['entries'][0]['evidence']))
        self.assertEqual(self.request('/api/entries?q=fauxreferenceword&scope=target')['total'],0)
        self.assertEqual(self.request('/api/entries?q=fauxreferenceword&scope=reference')['total'],1)
        self.assertTrue(self.request('/api/cards/dl-see')['scope']['evidence'])

    def test_cross_origin_or_missing_token_cannot_write(self):
        for headers in [{'Origin':'http://example.com','X-Lexicon-Token':'test-token'}, {'Origin':self.base}]:
            with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/reviews',{},headers)
            self.assertEqual(caught.exception.code,403)
        self.assertEqual(read_json(self.root/'content/reviews.json')['records'],[])

    def test_valid_review_persists_and_is_returned_by_api(self):
        card=self.request('/api/cards/dl-see')
        request={'wordId':'dl-see','fingerprint':card['fingerprint'],'decision':'approved','reviewer':'isolated-test-reviewer','checks':{k:True for k in REVIEW_AXES},'evidence':'隔离接口自动测试，非真实词卡人工审核通过记录。'}
        self.request('/api/reviews',request,{'Origin':self.base,'X-Lexicon-Token':'test-token','Content-Type':'application/json'})
        self.assertEqual(self.request('/api/cards/dl-see')['status'],'approved')
        self.assertEqual(self.request('/api/summary')['approvedCards'],1)
        self.assertEqual(len(self.request('/api/cards/dl-see')['history']),1)

if __name__=='__main__':unittest.main()
