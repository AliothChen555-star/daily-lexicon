import { useEffect, useRef, type ReactNode } from 'react';
import { familyById, wordById, type Bilingual, type Word } from './content';
import { activeEvents, studyDay, type AppState } from './engine';

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sound: <><path d="m11 5-6 4H2v6h3l6 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4z"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, back: <path d="M20 12H4m6-6-6 6 6 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, check: <path d="m5 12 4 4L19 6"/>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>,
    upload: <path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>,
    undo: <><path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12"/></>,
    leaf: <><path d="M20 3C8 2 2 8 5 15c4 8 16 3 15-12Z"/><path d="M4 21 15 9"/></>,
    book: <><path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-1-7-2-10 1Z"/><path d="M12 5v16"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.arrow}</svg>;
}
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className={`paper-dialog ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><Icon name="close"/></button></div>{children}
  </dialog>;
}
export function Highlight({ text, word }: { text: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return <>{text.split(new RegExp(`(\\b${escaped}\\b)`, 'ig')).map((part, i) => part.toLowerCase() === word.toLowerCase() ? <mark key={i}>{part}</mark> : part)}</>;
}
export function WordBody({ word, play, onWord }: { word: Word; play: (path: string) => void; onWord: (word: Word) => void }) {
  const family = familyById.get(word.family)!;
  return <div className="word-body">
    <div className="definition"><span className="part-of-speech">{word.pos}</span><p>{word.meaning}</p></div>
    <section><h3>常用搭配</h3><ul className="phrase-list">{word.phrases.map((p: Bilingual) => <li key={p.en}><span lang="en">{p.en}</span><span>{p.zh}</span></li>)}</ul></section>
    <section><h3>在句子里认识它</h3>{word.examples.map((example: Bilingual) => <div className="example" key={example.en}><div className="example-en"><p lang="en"><Highlight text={example.en} word={word.word}/></p>{example.audio && <button className="icon-button small" aria-label={`朗读例句：${example.en}`} onClick={() => play(example.audio!)}><Icon name="sound" size={18}/></button>}</div><p className="translation">{example.zh}</p></div>)}</section>
    <section className="family-note"><h3>{family.kind === 'root' ? '词根线索' : family.kind === 'family' ? '词族线索' : '词源提示'}<span lang="en">{family.label}</span></h3><p>{family.note}</p><div className="related-words">{family.words.filter(id => id !== word.id).map(id => <button key={id} onClick={() => onWord(wordById.get(id)!)}>{wordById.get(id)!.word}</button>)}</div></section>
    {word.forms.length > 0 && <section className="word-forms"><h3>词形参考</h3><p>{word.forms.join('　 /　 ')}</p></section>}
  </div>;
}
export function WeekChart({ state, now }: { state: AppState; now: Date }) {
  const events = activeEvents(state);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() - (6 - i) * 86400000), day = studyDay(date);
    return { day, date, count: new Set(events.filter(e => e.day === day).map(e => e.wordId)).size };
  });
  const max = Math.max(30, ...days.map(d => d.count));
  return <div className="week-chart" aria-label="最近七天学习词数"><div className="chart-bars">{days.map(({ day, date, count }, i) => <div key={day} className={i === 6 ? 'chart-day current' : 'chart-day'} title={`${day}：${count}词`}><span className="chart-count">{count || ''}</span><div className="chart-track"><i style={{ height: `${Math.max(2, count / max * 54)}px` }}/></div><span>{new Intl.DateTimeFormat('zh-CN', { weekday: 'narrow', timeZone: 'Asia/Shanghai' }).format(date)}</span></div>)}</div><p>最近七日 · 读过的不同单词</p></div>;
}
