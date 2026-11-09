import { beforeAll,describe,it,expect } from 'vitest';
import oldState from './fixtures/v0.1-state.json';
import oldComplete from './fixtures/v0.1-complete-state.json';
import oldRoots from './fixtures/v0.1-roots-state.json';
import oldBackup from './fixtures/v0.1-backup.json';
import oldRootsBackup from './fixtures/v0.1-roots-backup.json';
import recentState from './fixtures/v0.2-state.json';
import recentComplete from './fixtures/v0.2-complete-state.json';
import recentRoots from './fixtures/v0.2-roots-state.json';
import recentBackup from './fixtures/v0.2-backup.json';
import recentRootsBackup from './fixtures/v0.2-roots-backup.json';
import lastState from './fixtures/v0.3-state.json';
import lastBackup from './fixtures/v0.3-backup.json';
import { content,courseVersion,legacyCatalog,wordIds } from '../src/content';
import { initializeEngine,migrateState,createState,courseQueue,coveredWords,currentRound,dayEvents,ensureDaily,exportBackup,getPlan,gradeWord,parseBackup,restoreBackup,todayCourseDone,type AppState } from '../src/engine';
const date=new Date('2026-11-04T03:00:00Z');
const cast=(value:unknown)=>structuredClone(value) as AppState;
beforeAll(initializeEngine);

describe('应用、内容修订与课程范围分别版本化',()=>{
  it('相同课程范围仅修订正文时，原档案对象与当天配额保持不变',()=>{
    const now=new Date('2026-11-06T02:00:00Z'),state=createState(now),revision=content.version;
    try {
      content.version=revision+'-editorial-fix';
      expect(migrateState(state,now)).toBe(state);
      const backup=parseBackup(exportBackup(state,now));
      expect(backup.contentVersion).toBe(courseVersion);expect(backup.contentRevision).toBe(content.version);
    } finally { content.version=revision; }
  });
  it('0.3完整600词档案追加新增词，保留原轮次、配额与记忆',()=>{
    const prior=cast(lastState),now=new Date('2026-11-06T02:00:00Z');
    const next=migrateState(prior,now);
    expect(currentRound(next).order.slice(0,currentRound(prior).order.length)).toEqual(currentRound(prior).order);
    expect(next.contentUpdate?.addedWords).toBe(wordIds.length-currentRound(prior).order.length);
    expect(next.memory).toEqual(prior.memory);expect(getPlan(next,now)).toEqual(getPlan(prior,now));
    expect(next.contentVersion).toBe(courseVersion);
    expect(currentRound(next).order).toEqual(wordIds);expect(courseQueue(next,now)).toHaveLength(18);
    const imported=restoreBackup(createState(now),parseBackup(JSON.stringify(lastBackup)),now);
    expect(imported.memory).toEqual(prior.memory);expect(imported.notes).toEqual(prior.notes);
    expect(imported.bookmarks).toEqual(prior.bookmarks);expect(todayCourseDone(imported,now)).toBe(12);
    const backup=parseBackup(exportBackup(imported,now));
    expect(backup.contentVersion).toBe(courseVersion);expect(backup.contentRevision).toBe(content.version);
  });
});
describe('真实v0.1档案升级到当前词包',()=>{
  it('原语义轮扩展，12条评分、当天30词、复习记忆和个人内容完整保留',()=>{
    const prior=cast(oldState),next=migrateState(prior,date);
    expect(next.packId).toBe(content.id);expect(next.contentVersion).toBe(courseVersion);
    expect(next.events).toEqual(prior.events);expect(next.memory).toEqual(prior.memory);
    expect(next.notes).toEqual(prior.notes);expect(next.bookmarks).toEqual(prior.bookmarks);
    expect(next.deviceId).toBe(prior.deviceId);expect(next.profileId).toBe(prior.profileId);
    expect(currentRound(next).id).toBe(currentRound(prior).id);
    expect(currentRound(next).order.slice(0,120)).toEqual(legacyCatalog.wordIds);
    expect(currentRound(next).order).toHaveLength(wordIds.length);expect(coveredWords(next).size).toBe(12);
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
  it('已进入旧词根轮时保留原120词顺序，读完后进入新版语义轮',()=>{
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
    expect(currentRound(next).mode).toBe('semantic');expect(currentRound(next).order).toHaveLength(wordIds.length);
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
    expect(roundtrip.packId).toBe(content.id);expect(roundtrip.rounds[0].order).toHaveLength(wordIds.length);
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

describe('真实v0.2的300词档案与v2备份升级',()=>{
  const now=new Date('2026-11-06T02:00:00Z');
  it('追加缺词，旧300词顺序、12条记忆、当天计划与个人内容保持一致',()=>{
    const prior=cast(recentState),next=migrateState(prior,now);
    expect(currentRound(next).order.slice(0,300)).toEqual(currentRound(prior).order);
    expect(currentRound(next).order).toHaveLength(wordIds.length);
    expect(next.contentUpdate).toMatchObject({fromVersion:'0.2.0',toVersion:courseVersion,addedWords:wordIds.length-300,policy:'extended-semantic'});
    expect(next.events).toEqual(prior.events);expect(next.memory).toEqual(prior.memory);
    expect(next.notes).toEqual(prior.notes);expect(next.bookmarks).toEqual(prior.bookmarks);
    expect(next.deviceId).toBe(prior.deviceId);expect(next.profileId).toBe(prior.profileId);
    expect(getPlan(next,now)).toEqual(getPlan(prior,now));expect(courseQueue(next,now)).toHaveLength(18);
    expect(migrateState(next,now)).toBe(next);expect(currentRound(prior).order).toHaveLength(300);
  });
  it('刚完成300词当天不增发课程，次日只补新增词',()=>{
    const finished=new Date('2026-11-15T02:00:00Z');
    const next=migrateState(cast(recentComplete),finished);
    expect(currentRound(next).status).toBe('active');expect(coveredWords(next).size).toBe(300);
    expect(courseQueue(next,finished)).toHaveLength(0);
    const tomorrow=new Date('2026-11-16T01:00:00Z');
    expect(courseQueue(ensureDaily(next,tomorrow),tomorrow)).toEqual(wordIds.slice(300,330));
  });
  it('300词旧词根轮与快照保留，完成后开始新版语义轮',()=>{
    let state=migrateState(cast(recentRoots),new Date('2026-11-16T01:00:00Z'));
    expect(state.contentUpdate?.policy).toBe('finish-legacy');
    const order=[...currentRound(state).order];expect(order).toHaveLength(300);
    for(let day=0;day<10;day++) {
      const date=new Date(Date.UTC(2026,10,16+day,1));state=ensureDaily(state,date);
      for(const [i,id] of courseQueue(state,date).entries())state=gradeWord(state,id,3,'course',new Date(+date+i*1000));
    }
    expect(currentRound(state).order).toEqual(order);expect(currentRound(state).status).toBe('complete');
    const next=ensureDaily(state,new Date('2026-11-26T01:00:00Z'));
    expect(currentRound(next).mode).toBe('semantic');expect(currentRound(next).order).toEqual(wordIds);
    expect(next.rounds.slice(0,2).map(r=>r.order.length)).toEqual([300,300]);
    expect(Object.keys(next.memory)).toHaveLength(300);
  });
  it('v2旧备份反复合并不重复评分，并能继续导出历史300词轮次',()=>{
    const backup=parseBackup(JSON.stringify(recentBackup));
    let state=restoreBackup(createState(now),backup,now);
    state=gradeWord(state,courseQueue(state,now)[0],3,'course',now,'v030-score');
    const merged=restoreBackup(state,backup,now);
    expect(merged.events).toHaveLength(13);expect(courseQueue(merged,now)).toHaveLength(17);
    expect(merged.notes).toEqual(state.notes);expect(merged.memory).toEqual(state.memory);
    expect(parseBackup(exportBackup(merged,now)).rounds[0].order).toHaveLength(wordIds.length);
    const roots=restoreBackup(createState(now),parseBackup(JSON.stringify(recentRootsBackup)),new Date('2026-11-16T01:00:00Z'));
    expect(parseBackup(exportBackup(roots)).rounds.map(r=>r.order.length)).toEqual([300,300]);
  });
});
