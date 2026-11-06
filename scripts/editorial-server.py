"""A local-only review desk. Review writes never access a learner's progress database."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
from pathlib import Path
from contextlib import closing
import argparse, json, sqlite3, secrets, tempfile, re
from content_core import ROOT, REVIEW_AXES, build_database, submit_review, read_json, workspace, review_status, release_report

def handler_for(root, token):
    root=Path(root)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass

        def send(self,status,value,mime='application/json; charset=utf-8'):
            body=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.end_headers();self.wfile.write(body)

        def allowed_host(self):
            return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')

        def do_GET(self):
            if not self.allowed_host(): return self.send(403,{'error':'仅支持本机访问。'})
            url=urlparse(self.path)
            try:
                if url.path=='/api/session': return self.send(200,{'token':token})
                if url.path=='/api/summary':
                    with closing(sqlite3.connect(root/'public/lexicon.sqlite')) as db:
                        report=json.loads(db.execute("SELECT value FROM metadata WHERE key='releaseReport'").fetchone()[0])
                    return self.send(200,{**report,'reviewAxes':REVIEW_AXES})
                if url.path=='/api/entries':
                    query=parse_qs(url.query)
                    term=query.get('q',[''])[0][:100].strip().lower()
                    status=query.get('status',[''])[0]
                    offset=max(0,min(100000,int(query.get('offset',['0'])[0])))
                    limit=max(1,min(100,int(query.get('limit',['40'])[0])))
                    sql='''WITH entries AS (
                      SELECT c.word key,c.display word,c.level reference_level,w.id,w.meaning,w.level,COALESCE(w.review_status,'missing') status
                      FROM candidates c LEFT JOIN words w ON lower(w.word)=c.word
                      UNION ALL SELECT lower(w.word),w.word,'扩展',w.id,w.meaning,w.level,w.review_status
                      FROM words w WHERE NOT EXISTS(SELECT 1 FROM candidates c WHERE c.word=lower(w.word))
                    ) SELECT * FROM entries WHERE (?='' OR instr(lower(word),?)>0 OR instr(COALESCE(meaning,''),?)>0) AND (?='' OR status=?)'''
                    params=(term,term,term,status,status)
                    with closing(sqlite3.connect(root/'public/lexicon.sqlite')) as db:
                        db.row_factory=sqlite3.Row
                        total=db.execute('SELECT COUNT(*) FROM ('+sql+')',params).fetchone()[0]
                        rows=[dict(r) for r in db.execute(sql+' ORDER BY key LIMIT ? OFFSET ?',(*params,limit,offset))]
                    return self.send(200,{'total':total,'entries':rows,'offset':offset,'limit':limit})
                if url.path.startswith('/api/cards/'):
                    word_id=unquote(url.path.removeprefix('/api/cards/'))
                    with closing(sqlite3.connect(root/'public/lexicon.sqlite')) as db:
                        row=db.execute('SELECT data,fingerprint,review_status FROM words WHERE id=?',(word_id,)).fetchone()
                        if not row:return self.send(404,{'error':'这个词尚未制作词卡。'})
                        word=json.loads(row[0])
                        family=db.execute('SELECT label,kind,note FROM families WHERE id=?',(word['family'],)).fetchone()
                        location=[db.execute('SELECT label FROM '+table+' WHERE id=?',(word[field],)).fetchone()[0] for table,field in [('topics','topic'),('scenes','scene'),('concepts','concept')]]
                        history=[json.loads(r[0]) for r in db.execute('SELECT data FROM reviews WHERE word_id=? ORDER BY ordinal DESC',(word_id,))]
                    return self.send(200,{'word':word,'fingerprint':row[1],'status':row[2],'family':{'label':family[0],'kind':family[1],'note':family[2]},'location':location,'history':history})
                if url.path.startswith('/audio/'):
                    name=unquote(url.path.removeprefix('/audio/'))
                    if not re.fullmatch(r'[a-z]+(?:--[12])?\.wav',name):return self.send(404,{'error':'找不到音频。'})
                    return self.send(200,(root/'public/audio'/name).read_bytes(),'audio/wav')
                static={'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript; charset=utf-8'),'/editorial.css':('editorial.css','text/css; charset=utf-8')}
                if url.path in static:
                    name,mime=static[url.path];return self.send(200,(ROOT/'editorial'/name).read_bytes(),mime)
                if url.path=='/font.woff2':return self.send(200,(ROOT/'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2').read_bytes(),'font/woff2')
                return self.send(404,{'error':'页面不存在。'})
            except (ValueError,KeyError) as error:return self.send(400,{'error':str(error)})
            except (OSError,sqlite3.Error):return self.send(503,{'error':'词库文件暂不可用，请先运行内容构建。'})

        def do_POST(self):
            origins={f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}
            if not self.allowed_host() or self.headers.get('Origin') not in origins or not secrets.compare_digest(self.headers.get('X-Lexicon-Token',''),token):
                return self.send(403,{'error':'请在本机校审页面提交。'})
            if self.path!='/api/reviews':return self.send(404,{'error':'接口不存在。'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=20000:return self.send(413,{'error':'校审记录大小无效。'})
                if self.headers.get_content_type()!='application/json':return self.send(415,{'error':'请提交JSON格式。'})
                request=json.loads(self.rfile.read(length))
                if not isinstance(request,dict):raise ValueError('校审记录必须为对象。')
                record=submit_review(root,request)
                return self.send(200,{'record':record})
            except (ValueError,TypeError,KeyError) as error:return self.send(409,{'error':str(error)})
            except (OSError,sqlite3.Error):return self.send(500,{'error':'保存未完成，请查看校审记录后重试。'})
    return Handler

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=4175)
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--test-fixture',action='store_true')
    args=parser.parse_args()
    temp=None
    if args.test_fixture:
        import sys
        sys.path.insert(0,str(ROOT/'tests/editorial'))
        from fixtures import make_fixture
        temp=tempfile.TemporaryDirectory(prefix='lexicon-editorial-test-')
        args.root=Path(temp.name)
        make_fixture(args.root)
    build_database(args.root)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler_for(args.root,secrets.token_hex(32)))
    print(f'校审工作台 http://127.0.0.1:{args.port} （仅本机；学习档案不受影响）',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        if temp:temp.cleanup()
