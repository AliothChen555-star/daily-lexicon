import { beforeAll,describe,it,expect } from 'vitest';
import oldState from './fixtures/v0.1-state.json';
import oldComplete from './fixtures/v0.1-complete-state.json';
import oldRoots from './fixtures/v0.1-roots-state.json';
import oldBackup from './fixtures/v0.1-backup.json';
import oldRootsBackup from './fixtures/v0.1-roots-backup.json';
import { content,legacyCatalog,wordIds } from '../src/content';
import { initializeEngine,migrateState,createState,courseQueue,coveredWords,currentRound,dayEvents,ensureDaily,exportBackup,getPlan,gradeWord,parseBackup,restoreBackup,todayCourseDone,type AppState } from '../src/engine';
const date=new Date('2026-11-04T03:00:00Z');
const cast=(value:unknown)=>structuredClone(value) as AppState;
beforeAll(initializeEngine);
describe('真实v0.1档案升级到300词',()=>{
  it('原语义轮扩展，12条评分、当天30词、复习记忆和个人内容完整保留',()=>{
    const prior=cast(oldState),next=migrateState(prior,date);
    expect(next.packId).toBe(content.id);expect(next.contentVersion).toBe('0.2.0');
    expect(next.events).toEqual(prior.events);expect(next.memory).toEqual(prior.memory);
    expect(next.notes).toEqual(prior.notes);expect(next.bookmarks).toEqual(prior.bookmarks);
    expect(next.deviceId).toBe(prior.deviceId);expect(next.profileId).toBe(prior.profileId);
    expect(currentRound(next).id).toBe(currentRound(prior).id);
    expect(currentRound(next).order.slice(0,120)).toEqual(legacyCatalog.wordIds);
    expect(currentRound(next).order).toHaveLength(300);expect(coveredWords(next).size).toBe(12);
    expect(getPlan(next,date).words).toEqual(getPlan(prior,date).words);
    expect(todayCourseDone(next,date)).toBe(12);expect(courseQueue(next,date)).toHaveLength(18);
    expect(prior.packId).toBe(legacyCatalog.id);expect(currentRound(prior).order).toHaveLength(120);
    expect(migrateState(next,date)).toBe(next);
  });
  it('原120词刚完成时仅追加新词，当天不重新发放配额，次日从新增词继续',()=>{
    const now=new Date('2026-11-07T03:00:00Z'),next=migrateState(cast(oldComplete),now);
    expect(coveredWords(next).size).toBe(120);expect(currentRound(next).status).toBe('active');
    expect(courseQueue(next,now)).toHaveLength(0);expect(todayCourseDone(next,now)).toBe(30);
    const tomorrow=new Date('2026-11-08T03:00:00Z'),continued=ensureDaily(next,tomorrow);
    expect(courseQueue(continued,tomorrow)).toEqual(wordIds.slice(120,150));
    expect(currentRound(continued).mode).toBe('semantic');expect(Object.keys(continued.memory)).toHaveLength(120);
  });
  it('已进入旧词根轮时保留原120词顺序，读完后进入300词语义轮',()=>{
    let state=migrateState(cast(oldRoots),new Date('2026-11-08T01:00:00Z'));
    const frozen=[...currentRound(state).order];
    expect(currentRound(state).mode).toBe('roots');expect(frozen).toHaveLength(120);
    expect(state.rounds[0].status).toBe('complete');expect(state.contentUpdate?.policy).toBe('finish-legacy');
    for(let n=0;n<4;n++) {
      const now=new Date(Date.UTC(2026,10,8+n,1));state=ensureDaily(state,now);
      for(const [i,id]of courseQueue(state,now).entries())state=gradeWord(state,id,3,'course',new Date(+now+i*1000));
    }
    expect(currentRound(state).order).toEqual(frozen);expect(currentRound(state).status).toBe('complete');
    const next=ensureDaily(state,new Date('2026-11-12T01:00:00Z'));
    expect(currentRound(next).mode).toBe('semantic');expect(currentRound(next).order).toHaveLength(300);
    expect(Object.keys(next.memory)).toHaveLength(120);expect(next.rounds[0].order).toHaveLength(120);
  });
  it('v1备份可以导入并重复合并，v2导出保留旧轮次快照和新课程范围',()=>{
    const backup=parseBackup(JSON.stringify(oldBackup));
    let state=restoreBackup(createState(date),backup,date);
    state=gradeWord(state,courseQueue(state,date)[0],3,'course',date,'new-version-score');
    const again=restoreBackup(state,backup,date);
    expect(again.events).toHaveLength(13);expect(todayCourseDone(again,date)).toBe(13);
    expect(courseQueue(again,date)).toHaveLength(17);expect(again.notes['dl-see']).toBe(oldState.notes['dl-see']);
    const roundtrip=parseBackup(exportBackup(again,date));expect(roundtrip.version).toBe(2);
    expect(roundtrip.packId).toBe(content.id);expect(roundtrip.rounds[0].order).toHaveLength(300);
    const roots=restoreBackup(createState(date),parseBackup(JSON.stringify(oldRootsBackup)),new Date('2026-11-08T01:00:00Z'));
    expect(parseBackup(exportBackup(roots)).rounds.map(r=>r.order.length)).toEqual([120,120]);
  });
  it('旧备份伪装为新范围、缺词与内容版本冲突时拒绝导入',()=>{
    const legacy=structuredClone(oldBackup);legacy.rounds[0].order=[...wordIds];
    expect(()=>parseBackup(JSON.stringify(legacy))).toThrow();
    const next=JSON.parse(exportBackup(migrateState(cast(oldState),date),date));
    next.rounds[0].contentVersion='0.1.0';expect(()=>parseBackup(JSON.stringify(next))).toThrow();
    next.rounds[0].contentVersion='0.2.0';next.rounds[0].order.pop();expect(()=>parseBackup(JSON.stringify(next))).toThrow();
  });
});
