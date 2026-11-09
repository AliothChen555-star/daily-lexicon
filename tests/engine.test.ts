import { beforeAll, describe, expect, it } from 'vitest';
import { content, families, wordIds } from '../src/content';
import { activeEvents, courseQueue, coveredWords, createState, currentRound, ensureDaily, exportBackup, getPlan, gradeWord, initializeEngine, makeRound, parseBackup, restoreBackup, reviewQueue, startRound, studyDay, todayCourseDone, undoLast, updateSettings, type AppState } from '../src/engine';

const day = (n=0,hour=9) => new Date(Date.UTC(2026,10,4+n,hour-8));
const courseDays = Math.ceil(wordIds.length / 30);
const initial = () => createState(day(),'profile-test','device-test');
function completeToday(input: AppState,date: Date) { let state=ensureDaily(input,date); for (const [i,id] of courseQueue(state,date).entries()) state=gradeWord(state,id,3,'course',new Date(+date+i*1000),`score-${state.rounds.length}-${date.toISOString()}-${i}`); return state; }
let completedCourse:AppState|undefined;
function completeSemanticCourse() {
  if(!completedCourse) {
    let state=initial();
    for(let n=0;n<courseDays;n++) state=completeToday(state,day(n));
    completedCourse=state;
  }
  return structuredClone(completedCourse);
}
beforeAll(async () => { await initializeEngine(); });

describe('课程、记忆和备份的实际约束', () => {
  it('按北京时间跨天，不受电脑默认时区影响', () => {
    expect(studyDay(new Date('2026-11-04T15:59:59Z'))).toBe('2026-11-04');
    expect(studyDay(new Date('2026-11-04T16:00:00Z'))).toBe('2026-11-05');
  });
  it('三种顺序覆盖相同完整词包，乱序可重建且不重复', () => {
    for(const mode of ['semantic','roots','random'] as const) {
      const round=makeRound('p',1,mode,day());
      expect(new Set(round.order).size).toBe(wordIds.length); expect([...round.order].sort()).toEqual([...wordIds].sort());
      expect(round.order).toEqual(makeRound('p',1,mode,day()).order);
    }
    expect(makeRound('p',1,'random',day()).order).not.toEqual(makeRound('p',2,'random',day()).order);
    const rootPositions=new Map(makeRound('p',1,'roots',day()).order.map((id,index)=>[id,index]));
    for(const family of families) {
      const positions=family.words.map(id=>rootPositions.get(id)!);
      expect(Math.max(...positions)-Math.min(...positions)+1).toBe(family.words.length);
    }
  });
  it('未完成的12词次日优先，再补18词；不补欠债到60词', () => {
    let state=initial(); const plan=getPlan(state,day()).words;
    for(let i=0;i<18;i++) state=gradeWord(state,plan[i],3,'course',new Date(+day()+i*1000));
    const tomorrow=ensureDaily(state,day(1));
    expect(courseQueue(tomorrow,day(1))).toEqual(wordIds.slice(18,48));
    expect(getPlan(tomorrow,day(1)).words).toHaveLength(30);
  });
  it('忘记也算本轮接触过，但一分钟后重新到期；重复操作不会重复记账', () => {
    const before=initial(), id=wordIds[0];
    const after=gradeWord(before,id,1,'course',day(),'operation-1');
    expect(coveredWords(after).has(id)).toBe(true);
    expect(reviewQueue(after,new Date(+day()+61000))).toContain(id);
    expect(gradeWord(after,id,1,'course',day(),'operation-1')).toBe(after);
    expect(before.events).toHaveLength(0);
  });
  it('同一词复习与课程重叠时只计一次课程；自由学习不占课程配额', () => {
    let state=gradeWord(initial(),wordIds[0],1,'free',day());
    expect(todayCourseDone(state,day())).toBe(0);
    state=gradeWord(state,wordIds[0],3,'review',new Date(+day()+61000));
    state=gradeWord(state,wordIds[0],3,'review',new Date(+day()+120000));
    expect(todayCourseDone(state,day())).toBe(1); expect(courseQueue(state,day())).toHaveLength(29);
  });
  it('按每日30词完成全量词包，次日自动进入词根轮，保留记忆并完整重读', () => {
    const state=completeSemanticCourse();
    expect(currentRound(state).status).toBe('complete'); expect(coveredWords(state).size).toBe(wordIds.length);
    expect(ensureDaily(state,day(courseDays-1,18)).rounds).toHaveLength(1);
    const next=ensureDaily(state,day(courseDays)); expect(currentRound(next).mode).toBe('roots');
    expect(coveredWords(next).size).toBe(0); expect(Object.keys(next.memory)).toHaveLength(wordIds.length);
    expect(courseQueue(next,day(courseDays))).toHaveLength(30);
  },30_000);
  it('撤销最后一个词会重新打开已完成轮次，并保留其他已读词', () => {
    const state=completeSemanticCourse();
    const undone=undoLast(state,day(courseDays-1,10));
    expect(currentRound(undone).status).toBe('active'); expect(coveredWords(undone).size).toBe(wordIds.length-1);
    expect(courseQueue(undone,day(courseDays-1,10))).toEqual([wordIds.at(-1)]); expect(activeEvents(undone)).toHaveLength(wordIds.length-1);
  },30_000);
  it('调整目标不删除已完成的词，手动换轮不删除复习', () => {
    let state=initial(); for(let i=0;i<8;i++) state=gradeWord(state,wordIds[i],3,'course',new Date(+day()+i*1000));
    state=updateSettings(state,{dailyTarget:5},day()); expect(getPlan(state,day()).words).toHaveLength(8); expect(courseQueue(state,day())).toHaveLength(0);
    state=updateSettings(state,{dailyTarget:10},day()); expect(courseQueue(state,day())).toHaveLength(2);
    const next=startRound(state,'roots',day()); expect(next.rounds[0].status).toBe('skipped'); expect(next.events).toHaveLength(8); expect(Object.keys(next.memory)).toHaveLength(8);
  });
  it('备份在另一台设备重放一致；反复导入不增加配额与评分', () => {
    let original=initial(); original=gradeWord(original,wordIds[0],3,'course',day());
    original=gradeWord(original,wordIds[1],2,'course',new Date(+day()+1000));
    original.notes[wordIds[0]]='我的例句'; original.bookmarks=[wordIds[0]];
    const backup=parseBackup(exportBackup(original,day()));
    const imported=restoreBackup(createState(day(),'other','device-b'),backup,day());
    expect(imported.deviceId).toBe('device-b'); expect(imported.memory).toEqual(original.memory);
    expect(getPlan(imported,day()).words).toHaveLength(30); expect(courseQueue(imported,day())).toHaveLength(28);
    const again=restoreBackup(imported,backup,day()); expect(again.events).toHaveLength(2); expect(again.memory).toEqual(original.memory); expect(again.notes).toEqual(original.notes);
  });
  it('同一档案两台设备的不同记录能够合并，旧备份不能复活已撤销记录', () => {
    const a=gradeWord(initial(),wordIds[0],3,'course',day(),'a');
    let b=restoreBackup(createState(day(),'other','b'),parseBackup(exportBackup(a)),day());
    b=gradeWord(b,wordIds[1],3,'course',new Date(+day()+1000),'b');
    const merged=restoreBackup(a,parseBackup(exportBackup(b)),day()); expect(coveredWords(merged).size).toBe(2);
    const undone=undoLast(merged,day()); const reimported=restoreBackup(undone,parseBackup(exportBackup(a)),day());
    expect(activeEvents(reimported).map(e=>e.id)).toEqual(['b']);
  });
  it('损坏的、伪造级别和不兼容词包备份被拒绝', () => {
    const source=JSON.parse(exportBackup(initial())); source.packId='other-pack'; expect(()=>parseBackup(JSON.stringify(source))).toThrow();
    expect(()=>parseBackup('{broken')).toThrow(); source.packId=content.id; source.rounds[0].order[1]=source.rounds[0].order[0]; expect(()=>parseBackup(JSON.stringify(source))).toThrow();
  });
  it('跨天撤销会重排今天的计划，已经手动切换的轮次保持存档', () => {
    const finished=completeToday(initial(),day());
    const undone=undoLast(ensureDaily(finished,day(1)),day(1));
    expect(courseQueue(undone,day(1))).toEqual(wordIds.slice(29,59));
    const switched=startRound(finished,'roots',day());
    const undoInOldRound=undoLast(switched,day());
    expect(currentRound(undoInOldRound).mode).toBe('roots'); expect(undoInOldRound.rounds[0].status).toBe('skipped');
  });
  it('课程分叉与超长冲突笔记在导入前被拒绝，不改动原档案', () => {
    const state=initial(), a=startRound(state,'roots',day()), b=startRound(state,'random',day());
    expect(()=>restoreBackup(a,parseBackup(exportBackup(b)),day())).toThrow('不同课程');
    const withNote=initial(); withNote.notes[wordIds[0]]='甲'.repeat(3000);
    const backup=parseBackup(exportBackup(withNote)); backup.notes[wordIds[0]]='乙'.repeat(3000);
    expect(()=>restoreBackup(withNote,backup,day())).toThrow('超过5000字');
    expect(withNote.notes[wordIds[0]]).toHaveLength(3000);
  });
});
