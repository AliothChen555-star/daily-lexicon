import { useCallback, useEffect, useRef, useState } from 'react';
import { appVersion, editionLabel } from './version';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { assetUrl, content, wordById, wordIds, words, topics, families, type Word } from './content';
import { activeEvents, courseQueue, createState, currentRound, ensureDaily, migrateState, exportBackup, gradeWord, initializeEngine, parseBackup, restoreBackup, setNote, shuffle, startRound, studyDay, toggleBookmark, undoLast, updateSettings, MODE_NAMES, type AppState, type Backup, type Grade, type OrderMode, type StudyMode } from './engine';
import { latestRecovery, loadState, persistState, preserveRecovery } from './storage';
import { saveBackupFile } from './native';
import { Dialog, Icon, WordBody } from './components';
import { ArchivePage, LibraryPage, RootsPage, SettingsPage, StudyPage, TodayPage, type Session } from './pages';

type View = 'today' | 'library' | 'roots' | 'archive' | 'settings' | 'study';
const NAV: { id: View; title: string }[] = [{ id: 'today', title: '今日版' }, { id: 'library', title: '词库目录' }, { id: 'roots', title: '词根索引' }, { id: 'archive', title: '学习档案' }];
function getView(): View { const value = location.hash.slice(1); return ['today','library','roots','archive','settings','study'].includes(value) ? value as View : 'today'; }
const message = (error: unknown) => error instanceof Error ? error.message : '操作没有完成，请重试。';

export default function App() {
  const [state, setState] = useState<AppState>();
  const stateRef = useRef<AppState | undefined>(undefined);
  const writes = useRef(Promise.resolve());
  const [startupError, setStartupError] = useState('');
  const [view, setView] = useState<View>(getView);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);
  const gradingRef = useRef(false);
  const [drawer, setDrawer] = useState<Word | null>(null);
  const [note, setNoteText] = useState('');
  const [confirmMode, setConfirmMode] = useState<OrderMode | null>(null);
  const [pendingBackup, setPendingBackup] = useState<Backup | null>(null);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [recoveryDialog, setRecoveryDialog] = useState(false);
  const [about, setAbout] = useState(false);
  const [playing, setPlaying] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const navigate = useCallback((target: View) => { location.hash = target; setView(target); window.scrollTo(0, 0); }, []);
  const commit = useCallback((update: (s: AppState) => AppState): Promise<void> => {
    const operation = writes.current.catch(() => {}).then(async () => {
      if (!stateRef.current) throw new Error('学习档案还未准备好。');
      const next = update(stateRef.current);
      await persistState(next);
      stateRef.current = next; setState(next);
    });
    writes.current = operation;
    return operation;
  }, []);
  const act = useCallback((update: (s: AppState) => AppState, success?: string) => {
    void commit(update).then(() => { if (success) setToast(success); }).catch(e => setToast(message(e)));
  }, [commit]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([initializeEngine(), loadState(), latestRecovery()]).then(async ([, saved, recovery]) => {
      if (cancelled) return;
      const initial = saved ? migrateState(saved) : createState();
      const upgraded=!!saved && (saved.packId!==initial.packId || saved.contentVersion!==initial.contentVersion);
      if(saved && upgraded) await preserveRecovery(saved);
      await persistState(initial);
      if (!cancelled) { stateRef.current = initial; setState(initial); setHasRecovery(!!recovery || upgraded); }
    }).catch(e => { if (!cancelled) setStartupError(message(e)); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { const update = () => { setView(getView()); window.scrollTo(0,0); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const refresh = () => { setNow(new Date()); if (stateRef.current) act(s => ensureDaily(s)); };
    const timer = window.setInterval(refresh, 30000);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [act]);
  useEffect(() => { setNoteText(drawer ? stateRef.current?.notes[drawer.id] ?? '' : ''); }, [drawer]);

  const play = useCallback((path: string, quiet = false) => {
    const wasPlaying = audio.current?.getAttribute('data-path') === path && !audio.current.paused;
    audio.current?.pause();
    if (wasPlaying) { setPlaying(''); return; }
    const next = new Audio(assetUrl(path)); next.setAttribute('data-path', path); audio.current = next;
    next.onended = () => setPlaying('');
    next.onerror = () => { setPlaying(''); if (!quiet) setToast('发音文件未能播放，请重新打开应用后重试。'); };
    void next.play().then(() => setPlaying(path)).catch(() => { if (!quiet) setToast('请再次点击朗读按钮。'); });
  }, []);
  useEffect(() => () => audio.current?.pause(), []);

  const begin = (mode: StudyMode) => {
    if (!stateRef.current) return;
    const s = ensureDaily(stateRef.current), date = new Date();
    const queue = mode === 'course' ? courseQueue(s, date) : mode === 'review'
      ? Object.entries(s.memory).filter(([,c]) => Date.parse(c.dueAt) <= date.getTime()).sort((a,b) => Date.parse(a[1].dueAt)-Date.parse(b[1].dueAt)).map(([id]) => id)
      : shuffle(wordIds, crypto.randomUUID()).slice(0,10);
    if (mode === 'review' && queue.length === 0) { setToast('目前没有到期复习的词。'); return; }
    setSession({ mode, queue, initialCount: queue.length, graded: 0 }); setFlipped(false); navigate('study');
  };
  useEffect(() => { if (view === 'study' && state && !session) begin('course'); }, [view, !!state]);
  const studyWord = session?.queue[0] ? wordById.get(session.queue[0])! : undefined;
  useEffect(() => {
    setFlipped(false); audio.current?.pause(); setPlaying('');
    if (studyWord && view === 'study' && stateRef.current?.settings.autoAudio) play(studyWord.audio, true);
  }, [studyWord?.id, session?.mode, view, play]);
  const submitGrade = async (grade: Grade) => {
    if (!studyWord || !session || !flipped || gradingRef.current) return;
    gradingRef.current = true; setGrading(true);
    try {
      const id = studyWord.id, role = session.mode, date = new Date(), operationId = crypto.randomUUID();
      await commit(s => gradeWord(s,id,grade,role,date,operationId));
      setSession(s => s ? { ...s, queue: s.queue.slice(1), graded: s.graded+1 } : null);
      setNow(date); setFlipped(false); window.scrollTo(0,0);
    } catch (e) { setToast(message(e)); }
    finally { gradingRef.current = false; setGrading(false); }
  };
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (view !== 'study' || drawer || about || pendingBackup || confirmMode || recoveryDialog || /INPUT|TEXTAREA|SELECT|BUTTON/.test((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space' && studyWord) { e.preventDefault(); setFlipped(true); }
      if (flipped && /^[1-4]$/.test(e.key)) { e.preventDefault(); void submitGrade(Number(e.key) as Grade); }
      if (e.key === 'Escape') navigate('today');
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  });
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (drawer) setDrawer(null); else if (pendingBackup) setPendingBackup(null); else if (confirmMode) setConfirmMode(null); else if (about) setAbout(false); else if (recoveryDialog) setRecoveryDialog(false); else if (view !== 'today') navigate('today'); else void NativeApp.exitApp();
    });
    return () => { void listener.then(h => h.remove()); };
  }, [view, drawer, pendingBackup, confirmMode, about, recoveryDialog, navigate]);

  const exportProgress = async () => {
    try { await writes.current; if (stateRef.current) { await saveBackupFile(exportBackup(stateRef.current), studyDay()); setToast(Capacitor.isNativePlatform() ? '已打开备份分享面板。' : '备份已导出，请妥善保存。'); } }
    catch (e) { setToast(message(e)); }
  };
  const importProgress = async () => {
    if (!pendingBackup || !stateRef.current) return;
    try {
      await preserveRecovery(stateRef.current);
      await commit(s => restoreBackup(s, pendingBackup));
      setHasRecovery(true); setPendingBackup(null); setSession(null); setToast('备份已导入，原有档案已保留恢复副本。'); navigate('archive');
    } catch (e) { setToast(message(e)); }
  };
  const recover = async () => {
    try {
      const saved = await latestRecovery(); if (!saved) throw new Error('没有找到可恢复的档案。');
      await commit(() => migrateState(saved)); setRecoveryDialog(false); setSession(null); setToast('已恢复保留的档案并匹配当前词包。'); navigate('archive');
    } catch (e) { setToast(message(e)); }
  };
  const undo = async () => {
    try {
      const before = stateRef.current!, event = activeEvents(before).filter(e => e.deviceId === before.deviceId).at(-1);
      if (!event) { setToast('还没有可以撤销的记录。'); return; }
      await commit(s => undoLast(s));
      if (session) setSession(s => {
        if (!s) return null;
        const role = event.role === 'course' && !courseQueue(stateRef.current!).includes(event.wordId) ? 'review' : event.role;
        const rest = role === 'course' ? courseQueue(stateRef.current!).filter(id=>id!==event.wordId) : role === s.mode ? s.queue.filter(id => id !== event.wordId) : [];
        const graded = role === s.mode ? Math.max(0,s.graded-1) : 0;
        return { mode: role, queue: [event.wordId,...rest], graded, initialCount: graded+rest.length+1 };
      });
      setFlipped(false); setToast('已撤销上一条评分。');
    } catch (e) { setToast(message(e)); }
  };

  if (!state) return <div className="startup"><h1>词汇日报</h1><p>{startupError || '正在展开今天的词页…'}</p>{startupError && <button className="primary" onClick={() => location.reload()}>重新打开</button>}</div>;
  return <div className={`app ${state.settings.largeText ? 'large-text' : ''}`} data-view={view}>
    <header className="masthead">
      <div className="masthead-top"><span>一日一页，读词有序</span><span>免费开源 / 离线可读</span></div>
      <div className="masthead-main"><div className="date-block"><span>{new Intl.DateTimeFormat('zh-CN',{ year: 'numeric',month:'long',day:'numeric',timeZone:'Asia/Shanghai' }).format(now)}</span><small>{new Intl.DateTimeFormat('zh-CN',{weekday:'long',timeZone:'Asia/Shanghai'}).format(now)}　·　本地版</small></div>
        <button className="brand" onClick={() => navigate('today')} aria-label="词汇日报首页"><strong>词汇日报</strong><span lang="en">The Daily Lexicon</span></button>
        <div className="issue-block"><span className="issue-stamp">{editionLabel}</span><small>本地词库 {words.length} 词</small></div></div>
      <nav className="main-nav" aria-label="主导航"><div className="nav-sections">{NAV.map(item => <button key={item.id} className={view === item.id ? 'selected' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.title}</button>)}</div><div className="nav-tools"><span className="local-status"><i/>记录保存在本机</span><button className={`icon-button ${view === 'settings' ? 'selected' : ''}`} aria-label="学习设置" onClick={() => navigate('settings')}><Icon name="settings"/></button></div></nav>
    </header>
    {view==='today' && state.contentUpdate && !state.contentUpdate.dismissed && <aside className="content-update" aria-label="词包升级说明"><div><strong>本期增补 {state.contentUpdate.addedWords} 词，旧记录已保留。</strong><p>{currentRound(state).order.length===words.length ? '原有学习记录、收藏和笔记继续使用；今天仍按原配额安排，不重新发放一份课程。' : `当前${currentRound(state).order.length}词轮次先按原顺序读完，随后进入${words.length}词语义轮。`}</p></div><button className="icon-button" aria-label="收起词包升级说明" onClick={()=>act(s=>({...s,contentUpdate:s.contentUpdate?{...s.contentUpdate,dismissed:true}:undefined}))}><Icon name="close" size={18}/></button></aside>}
    {view === 'today' && <TodayPage state={state} now={now} begin={begin} onWord={setDrawer} play={play} navigate={navigate} onNext={() => setConfirmMode(currentRound(state).order.length!==words.length?'semantic':'random')}/>}
    {view === 'study' && <StudyPage state={state} now={now} session={session} word={studyWord} flipped={flipped} grading={grading} flip={() => setFlipped(true)} grade={submitGrade} begin={begin} onWord={setDrawer} play={play} playing={playing} onBookmark={id => act(s => toggleBookmark(s,id))} undo={undo} home={() => navigate('today')} onNext={() => setConfirmMode(currentRound(state).order.length!==words.length?'semantic':'random')}/>}
    {view === 'library' && <LibraryPage state={state} onWord={setDrawer} play={play} onBookmark={id => act(s => toggleBookmark(s,id))}/>}
    {view === 'roots' && <RootsPage onWord={setDrawer}/>}
    {view === 'archive' && <ArchivePage state={state} now={now} onWord={setDrawer} exportProgress={exportProgress} importProgress={() => file.current?.click()} begin={begin}/>}
    {view === 'settings' && <SettingsPage state={state} onSettings={settings => act(s => updateSettings(s,settings))} onMode={setConfirmMode} exportProgress={exportProgress} importProgress={() => file.current?.click()} hasRecovery={hasRecovery} recover={() => setRecoveryDialog(true)} about={() => setAbout(true)}/>}
    <footer className="paper-footer"><span>词汇日报 <span lang="en">The Daily Lexicon</span></span><span className="footer-motto">让积累，有迹可循。</span><button onClick={() => setAbout(true)}>关于本刊 · v{appVersion}</button></footer>
    <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { const chosen = e.target.files?.[0]; e.target.value = ''; if (!chosen) return; if (chosen.size > 15*1024*1024) { setToast('备份超过15MB，请检查文件是否正确。'); return; } void chosen.text().then(text => setPendingBackup(parseBackup(text))).catch(e => setToast(message(e))); }}/>
    {drawer && <Dialog title="词条详页" wide onClose={() => setDrawer(null)}><div className="word-drawer"><div className="drawer-word"><h2 lang="en">{drawer.word}</h2><button className="icon-button" aria-label="收藏当前词条" aria-pressed={state.bookmarks.includes(drawer.id)} onClick={() => act(s => toggleBookmark(s,drawer.id))}><Icon name="bookmark"/></button></div><div className="pronunciation"><span>{drawer.ipa}</span><button className="sound-button" onClick={() => play(drawer.audio)}><Icon name="sound" size={18}/> 美音</button></div><WordBody word={drawer} onWord={setDrawer} play={play}/><section className="personal-note"><label htmlFor="personal-note">我的笔记</label><textarea id="personal-note" value={note} maxLength={5000} onChange={e => setNoteText(e.target.value)} placeholder="记下一次联想，或一个自己的例句。"/><button className="secondary" onClick={() => act(s => setNote(s,drawer.id,note),'笔记已保存。')}>保存笔记</button></section></div></Dialog>}
    {confirmMode && <Dialog title="开始新一轮学习" onClose={() => setConfirmMode(null)}><p>按「{MODE_NAMES[confirmMode]}」重新排好全部 {words.length} 个词，开始一轮完整学习。</p><p className="muted">当前未完成的轮次会标为提前切换。已有学习记录、复习安排和笔记会继续保留。</p><div className="dialog-actions"><button className="secondary" onClick={() => setConfirmMode(null)}>继续当前轮次</button><button className="primary" onClick={() => { const mode=confirmMode; void commit(s => startRound(s,mode)).then(() => { setConfirmMode(null); setSession(null); navigate('today'); }).catch(e => setToast(message(e))); }}>开始新一轮</button></div></Dialog>}
    {pendingBackup && <Dialog title="导入学习备份" onClose={() => setPendingBackup(null)}><p>这份备份包含 {pendingBackup.events.length} 条学习记录、{pendingBackup.rounds.length} 轮课程和 {pendingBackup.bookmarks.length} 个收藏词。</p><p className="muted">{pendingBackup.profileId === state.profileId ? '同一档案的记录会按标识合并，重复导入不会增加学习次数。' : '这份备份属于另一个学习档案。导入后将使用该档案，当前档案会先保存恢复副本。'} 两台设备请先导入同一份备份，再交替学习与导出。</p><div className="dialog-actions"><button className="secondary" onClick={() => setPendingBackup(null)}>取消</button><button className="primary" onClick={() => void importProgress()}>确认导入</button></div></Dialog>}
    {recoveryDialog && <Dialog title="恢复保留的档案" onClose={() => setRecoveryDialog(false)}><p>将恢复最近一次导入或词包升级之前保留的档案，并匹配当前词包。若需要保留当前进度，请先导出备份。</p><div className="dialog-actions"><button className="secondary" onClick={() => void exportProgress()}>先导出当前档案</button><button className="primary" onClick={() => void recover()}>恢复旧档案</button></div></Dialog>}
    {about && <Dialog title="关于词汇日报" onClose={() => setAbout(false)}><div className="about-copy"><p className="serif">每天三十词，慢慢读出自己的词汇地图。</p><p>本刊免费、开源，无广告、无账户。所有词卡、音频与学习记录都可以离线使用。</p><p>当前为1.0开发阶段，已收录 {words.length} 词：{topics.length} 个语义主题，{families.length} 组构词线索。语义目录按主题、场景和概念分为三层。基础、四级、六级标签仅供参考，尚未对照正式词表逐条审核。</p><p>释义、搭配和双语例句为原创内容草稿（CC BY-SA 4.0）。美音由 Piper / LJSpeech 在本地合成；音标、重音与内容仍待完整人工校审。词根与现代词族分开标注，独立词的语境分组不表示共同词源。</p><p>学习安排采用 FSRS-6。程序以 GPL-3.0 开源，字体采用 OFL。支持旧版档案升级和文件备份互通；完整词库校审、正式发行验证和自动同步正在按开发任务推进。</p><p><a href="https://github.com/OHF-Voice/piper1-gpl" target="_blank" rel="noreferrer">Piper 项目</a><a href="https://en.wiktionary.org/" target="_blank" rel="noreferrer">构词参考：Wiktionary</a></p></div></Dialog>}
    {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
  </div>;
}
