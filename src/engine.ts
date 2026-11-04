import { DefaultScheduler, Rating } from 'ts-fsrs';
import { z } from 'zod';
import { content, wordIds, wordById, families } from './content';

const createScheduler = () => DefaultScheduler({
  version: 'FSRS-6', desiredRetention: 0.9, enableFuzz: false,
  learningSteps: ['1m', '10m'], relearningSteps: ['10m'], maximumInterval: 36500,
});
type Scheduler = Awaited<ReturnType<typeof createScheduler>>;
type ModelCard = ReturnType<Scheduler['newCard']>;
export type StoredCard = Omit<ModelCard, 'dueAt' | 'lastReviewAt'> & { dueAt: string; lastReviewAt: string | null };
let scheduler: Scheduler;
let schedulerPromise: Promise<void> | undefined;
export function initializeEngine() {
  return schedulerPromise ??= createScheduler().then(value => { scheduler = value; });
}

export type StudyMode = 'course' | 'review' | 'free';
export type OrderMode = 'semantic' | 'roots' | 'random';
export type Grade = 1 | 2 | 3 | 4;
export interface ReviewEvent {
  id: string; wordId: string; grade: Grade; occurredAt: string; day: string;
  roundId: string | null; role: StudyMode; deviceId: string; sequence: number;
}
export interface Round {
  id: string; index: number; mode: OrderMode; order: string[]; startedAt: string;
  status: 'active' | 'complete' | 'skipped'; finishedDay?: string;
}
export interface DailyPlan { day: string; roundId: string; words: string[] }
export interface Settings { dailyTarget: number; autoAudio: boolean; showIpa: boolean; largeText: boolean }
export interface AppState {
  schema: 1; packId: string; profileId: string; deviceId: string; createdAt: string;
  settings: Settings; rounds: Round[]; plans: Record<string, DailyPlan>;
  events: ReviewEvent[]; revoked: string[]; memory: Record<string, StoredCard>;
  notes: Record<string, string>; bookmarks: string[];
}
export const MODE_NAMES: Record<OrderMode, string> = { semantic: '语义分块', roots: '词根与词族', random: '全量乱序' };
const iso = (date: Date) => date.toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const knownWords = new Set(wordIds);
export function studyDay(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(k => p.find(x => x.type === k)!.value).join('-');
}
function hash(text: string) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export function shuffle<T>(input: T[], seed: string) {
  const result = [...input]; let h = hash(seed);
  const random = () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function makeRound(profileId: string, index: number, mode: OrderMode, now: Date): Round {
  const id = `${profileId}:${index}:${mode}:${content.id}`;
  const order = mode === 'semantic' ? [...wordIds] : mode === 'roots' ? families.flatMap(f => f.words) : shuffle(wordIds, id);
  return { id, index, mode, order, startedAt: iso(now), status: 'active' };
}
export function createState(now = new Date(), profileId: string = crypto.randomUUID(), deviceId: string = crypto.randomUUID()): AppState {
  const s: AppState = {
    schema: 1, packId: content.id, profileId, deviceId, createdAt: iso(now),
    settings: { dailyTarget: 30, autoAudio: false, showIpa: true, largeText: false },
    rounds: [makeRound(profileId, 0, 'semantic', now)], plans: {}, events: [], revoked: [], memory: {}, notes: {}, bookmarks: [],
  };
  return ensureDaily(s, now);
}
export function currentRound(state: AppState) { return state.rounds[state.rounds.length - 1]; }
export function activeEvents(state: AppState) { const revoked = new Set(state.revoked); return state.events.filter(e => !revoked.has(e.id)); }
export function coveredWords(state: AppState, roundId = currentRound(state).id) {
  return new Set(activeEvents(state).filter(e => e.roundId === roundId).map(e => e.wordId));
}
export function dayEvents(state: AppState, now = new Date()) { const day = studyDay(now); return activeEvents(state).filter(e => e.day === day); }
export function todayCourseDone(state: AppState, now = new Date()) {
  return new Set(dayEvents(state, now).filter(e => e.roundId === currentRound(state).id).map(e => e.wordId)).size;
}
export function planKey(state: AppState, now = new Date()) { return studyDay(now) + ':' + currentRound(state).id; }
export function getPlan(state: AppState, now = new Date()): DailyPlan {
  return state.plans[planKey(state, now)] ?? { day: studyDay(now), roundId: currentRound(state).id, words: [] };
}
export function ensureDaily(input: AppState, now = new Date()) {
  let state = input;
  let round = currentRound(state);
  const day = studyDay(now);
  if (round.status === 'complete' && round.finishedDay! < day && round.mode !== 'random') {
    state = clone(state);
    const mode = round.mode === 'semantic' ? 'roots' : 'random';
    state.rounds.push(makeRound(state.profileId, round.index + 1, mode, now));
    round = currentRound(state);
  }
  const key = planKey(state, now);
  if (!state.plans[key]) {
    if (state === input) state = clone(state);
    const covered = coveredWords(state, round.id);
    const pending = round.order.filter(id => !covered.has(id));
    state.plans[key] = { day, roundId: round.id, words: pending.slice(0, state.settings.dailyTarget) };
  }
  return state;
}
export function courseQueue(state: AppState, now = new Date()) {
  const covered = coveredWords(state);
  return getPlan(state, now).words.filter(id => !covered.has(id));
}
export function reviewQueue(state: AppState, now = new Date()) {
  return Object.entries(state.memory).filter(([, c]) => Date.parse(c.dueAt) <= now.getTime())
    .sort((a, b) => Date.parse(a[1].dueAt) - Date.parse(b[1].dueAt) || a[0].localeCompare(b[0])).map(([id]) => id);
}
function hydrate(card: StoredCard): ModelCard {
  return { ...card, dueAt: new Date(card.dueAt), lastReviewAt: card.lastReviewAt ? new Date(card.lastReviewAt) : null } as ModelCard;
}
function storeCard(card: ModelCard): StoredCard { return JSON.parse(JSON.stringify(card)); }
function nextCard(previous: StoredCard | undefined, grade: Grade, now: Date, wordId: string) {
  if (!scheduler) throw new Error('学习引擎尚未准备好，请稍后重试。');
  const card = previous ? hydrate(previous) : { ...scheduler.newCard({ now }), cardId: wordId };
  if (card.lastReviewAt && now.getTime() < card.lastReviewAt.getTime()) throw new Error('设备时间早于上次学习时间，请检查系统时间后重试。');
  return scheduler.review({ card, grade, now }).card;
}
export function previewIntervals(state: AppState, wordId: string, now = new Date()) {
  const card = state.memory[wordId] ? hydrate(state.memory[wordId]) : { ...scheduler.newCard({ now }), cardId: wordId };
  return [...scheduler.preview({ card, now })].map(p => ({ grade: p.grade as Grade, seconds: Math.max(0, (p.card.dueAt.getTime() - now.getTime()) / 1000) }));
}
export function intervalLabel(seconds: number) {
  if (seconds < 60) return '片刻后';
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}小时`;
  return `${Math.max(1, Math.round(seconds / 86400))}天`;
}
export function gradeWord(input: AppState, wordId: string, grade: Grade, role: StudyMode, now = new Date(), operationId: string = crypto.randomUUID()) {
  if (!knownWords.has(wordId) || ![1, 2, 3, 4].includes(grade)) throw new Error('无法保存这一条学习记录。');
  if (input.events.some(e => e.id === operationId)) return input;
  const state = clone(ensureDaily(input, now));
  const round = currentRound(state);
  if (role === 'course' && !courseQueue(state, now).includes(wordId)) throw new Error('这个词已完成或不在今天的课程中。');
  const canCredit = role !== 'free' && round.status === 'active' && getPlan(state, now).words.includes(wordId) && !coveredWords(state).has(wordId);
  const event: ReviewEvent = {
    id: operationId, wordId, grade, occurredAt: iso(now), day: studyDay(now),
    roundId: canCredit ? round.id : null, role, deviceId: state.deviceId,
    sequence: state.events.reduce((n,e) => e.deviceId === state.deviceId ? Math.max(n,e.sequence) : n, 0) + 1,
  };
  state.memory[wordId] = storeCard(nextCard(state.memory[wordId], grade, now, wordId));
  state.events.push(event);
  if (round.status === 'active' && coveredWords(state).size === round.order.length) {
    round.status = 'complete'; round.finishedDay = studyDay(now);
  }
  return state;
}
function replayMemory(state: AppState) {
  state.memory = {};
  const events = activeEvents(state).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.sequence - b.sequence || a.deviceId.localeCompare(b.deviceId) || a.id.localeCompare(b.id));
  for (const e of events) state.memory[e.wordId] = storeCard(nextCard(state.memory[e.wordId], e.grade, new Date(e.occurredAt), e.wordId));
  for (const round of state.rounds) {
    const covered = coveredWords(state, round.id);
    round.status = covered.size === round.order.length ? 'complete' : round.id === currentRound(state).id ? 'active' : 'skipped';
    if (round.status === 'complete') round.finishedDay = events.filter(e => e.roundId === round.id).at(-1)?.day;
    else delete round.finishedDay;
  }
  return state;
}
export function undoLast(input: AppState, now = new Date()) {
  const last = activeEvents(input).filter(e => e.deviceId === input.deviceId).at(-1);
  if (!last) return input;
  const state = clone(input); state.revoked.push(last.id);
  const active = currentRound(state);
  const priorRound = state.rounds.find(r => r.id === last.roundId);
  if (last.roundId && priorRound?.status !== 'skipped' && last.roundId !== active.id && !activeEvents(state).some(e => e.roundId === active.id)) {
    while (state.rounds.length > 1 && currentRound(state).id !== last.roundId) state.rounds.pop();
  }
  return updateSettings(ensureDaily(replayMemory(state), now), {}, now);
}
export function updateSettings(input: AppState, settings: Partial<Settings>, now = new Date()) {
  const state = clone(input);
  const target = settings.dailyTarget ?? state.settings.dailyTarget;
  if (!Number.isInteger(target) || target < 5 || target > 100) throw new Error('每日目标请设为5至100之间的整数。');
  state.settings = { ...state.settings, ...settings, dailyTarget: target };
  const day = studyDay(now), round = currentRound(state), key = planKey(state, now);
  const done = [...new Set(dayEvents(state, now).filter(e => e.roundId === round.id).map(e => e.wordId))];
  const covered = coveredWords(state);
  const pending = round.order.filter(id => !covered.has(id));
  state.plans[key] = { day, roundId: round.id, words: [...done, ...pending.slice(0, Math.max(0, target - done.length))] };
  return state;
}
export function startRound(input: AppState, mode?: OrderMode, now = new Date()) {
  const state = clone(input), old = currentRound(state);
  if (old.status === 'active') old.status = 'skipped';
  const nextMode = mode ?? (old.mode === 'semantic' ? 'roots' : 'random');
  state.rounds.push(makeRound(state.profileId, old.index + 1, nextMode, now));
  return ensureDaily(state, now);
}
export function toggleBookmark(input: AppState, wordId: string) {
  if (!knownWords.has(wordId)) throw new Error('找不到这个词。');
  const state = clone(input);
  state.bookmarks = state.bookmarks.includes(wordId) ? state.bookmarks.filter(x => x !== wordId) : [...state.bookmarks, wordId];
  return state;
}
export function setNote(input: AppState, wordId: string, text: string) {
  if (!knownWords.has(wordId) || text.length > 5000) throw new Error('笔记最多保存5000个字。');
  const state = clone(input); state.notes[wordId] = text; return state;
}
export function learnedWords(state: AppState) { return new Set(activeEvents(state).map(e => e.wordId)); }
export function streak(state: AppState, now = new Date()) {
  const days = new Set(activeEvents(state).map(e => e.day));
  let count = 0;
  let day = studyDay(now);
  if (!days.has(day)) day = studyDay(new Date(now.getTime() - 86400000));
  while (days.has(day)) { count++; day = studyDay(new Date(Date.parse(day + 'T04:00:00Z') - 86400000)); }
  return count;
}

const idSchema = z.string().min(1).max(250);
const dateSchema = z.string().refine(x => Number.isFinite(Date.parse(x)), '日期不正确');
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const wordIdSchema = z.string().refine(x => wordById.has(x), '词包不兼容');
const eventSchema = z.object({
  id: idSchema, wordId: wordIdSchema, grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  occurredAt: dateSchema, day: daySchema, roundId: idSchema.nullable(), role: z.enum(['course','review','free']), deviceId: idSchema, sequence: z.number().int().positive(),
});
const roundSchema = z.object({ id: idSchema, index: z.number().int().nonnegative(), mode: z.enum(['semantic','roots','random']), order: z.array(wordIdSchema).length(wordIds.length).refine(x => new Set(x).size === wordIds.length), startedAt: dateSchema, status: z.enum(['active','complete','skipped']), finishedDay: daySchema.optional() });
const settingsSchema = z.object({ dailyTarget: z.number().int().min(5).max(100), autoAudio: z.boolean(), showIpa: z.boolean(), largeText: z.boolean() });
const backupSchema = z.object({
  format: z.literal('daily-lexicon-backup'), version: z.literal(1), packId: z.literal(content.id), exportedAt: dateSchema,
  profileId: idSchema, createdAt: dateSchema, settings: settingsSchema,
  rounds: z.array(roundSchema).min(1).max(1000), events: z.array(eventSchema).max(100000), revoked: z.array(idSchema).max(100000),
  notes: z.record(wordIdSchema, z.string().max(5000)), bookmarks: z.array(wordIdSchema).max(wordIds.length),
});
export type Backup = z.infer<typeof backupSchema>;
export function exportBackup(state: AppState, now = new Date()) {
  return JSON.stringify({ format: 'daily-lexicon-backup', version: 1, packId: state.packId, exportedAt: iso(now), profileId: state.profileId, createdAt: state.createdAt,
    settings: state.settings, rounds: state.rounds, events: state.events, revoked: state.revoked, notes: state.notes, bookmarks: state.bookmarks }, null, 2);
}
export function parseBackup(text: string): Backup {
  if (text.length > 15 * 1024 * 1024) throw new Error('备份超过15MB，请检查文件是否正确。');
  let parsed: Backup;
  try { parsed = backupSchema.parse(JSON.parse(text)); } catch { throw new Error('这不是兼容的词汇日报备份，或文件已损坏。'); }
  if (new Set(parsed.events.map(e => e.id)).size !== parsed.events.length) throw new Error('备份中含有重复的学习记录标识。');
  const rounds = new Set(parsed.rounds.map(r => r.id));
  if (rounds.size !== parsed.rounds.length || new Set(parsed.rounds.map(r=>r.index)).size !== parsed.rounds.length) throw new Error('备份中含有重复或分叉的课程轮次。');
  if (parsed.rounds.some((r,i) => i>0 && r.index<=parsed.rounds[i-1].index)) throw new Error('备份中的课程轮次顺序不正确。');
  if (parsed.events.some(e => e.roundId && !rounds.has(e.roundId))) throw new Error('备份中缺少对应的学习轮次。');
  if (parsed.events.some(e => studyDay(new Date(e.occurredAt)) !== e.day)) throw new Error('备份中的学习日期与记录时间不一致。');
  return parsed;
}
export function restoreBackup(input: AppState, backup: Backup, now = new Date()) {
  const same = input.profileId === backup.profileId;
  const state = clone(input);
  if (!same) {
    state.profileId = backup.profileId; state.createdAt = backup.createdAt;
    state.rounds = clone(backup.rounds); state.events = clone(backup.events); state.revoked = [...backup.revoked];
    state.notes = { ...backup.notes }; state.bookmarks = [...backup.bookmarks]; state.settings = { ...backup.settings };
  } else {
    const events = new Map(state.events.map(e => [e.id, e]));
    for (const e of backup.events) {
      if (events.has(e.id) && JSON.stringify(events.get(e.id)) !== JSON.stringify(e)) throw new Error('同一条学习记录出现不同内容，已取消导入。');
      events.set(e.id, e);
    }
    state.events = [...events.values()].sort((a,b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id));
    state.revoked = [...new Set([...state.revoked, ...backup.revoked])];
    const rounds = new Map(state.rounds.map(r => [r.id,r]));
    for (const r of backup.rounds) {
      const conflict=state.rounds.find(local=>local.index===r.index && local.id!==r.id);
      if (conflict) throw new Error('两台设备分别切换了不同课程，无法自动合并。请保留备份，在一台设备继续当前轮次。');
      const local=rounds.get(r.id);
      if(local && (local.mode!==r.mode || JSON.stringify(local.order)!==JSON.stringify(r.order))) throw new Error('同一课程轮次的词目顺序不一致，已取消导入。');
      if (!local) rounds.set(r.id,clone(r));
    }
    state.rounds = [...rounds.values()].sort((a,b) => a.index-b.index || a.id.localeCompare(b.id));
    for (const [id,note] of Object.entries(backup.notes)) {
      if (!state.notes[id]) state.notes[id]=note;
      else if (note && note!==state.notes[id] && !state.notes[id].includes(note)) {
        const merged=state.notes[id]+'\n\n从备份合并的笔记\n'+note;
        if(merged.length>5000) throw new Error('两份笔记合并后超过5000字，已取消导入。请先导出并整理笔记。');
        state.notes[id]=merged;
      }
    }
    state.bookmarks = [...new Set([...state.bookmarks,...backup.bookmarks])];
  }
  state.plans = {};
  replayMemory(state);
  const round = currentRound(state), day = studyDay(now);
  const done = [...new Set(activeEvents(state).filter(e => e.day===day && e.roundId===round.id).map(e=>e.wordId))];
  const covered = coveredWords(state), pending = round.order.filter(id=>!covered.has(id));
  state.plans[day+':'+round.id]={day,roundId:round.id,words:[...done,...pending.slice(0,Math.max(0,state.settings.dailyTarget-done.length))]};
  return ensureDaily(state,now);
}
