// 레이드 균형 시뮬레이션(logic.test.mjs가 부른다. 따로: node tests/sim.mjs)
// 2026-11-16: 단서 퀴즈 정답률(accuracy)을 넣었다 — 행동마다 정답률 p 확률로 위력 1, 아니면 RAID.quizWrongMul.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadCtx(overrides) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ctx = { module: { exports: {} } };
  vm.createContext(ctx);
  const src = ["data.js", "logic.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")
    + "\n;Object.assign(globalThis, { REGIONS, COLS, CARDS, TRAPS, SUMMARY, PART2, PART3, STATS, LOOK, GLOSSARY, RAID, INTRO, SPRITES, SPRITE_PAL });";
  vm.runInContext(src, ctx);
  if (overrides) Object.keys(overrides).forEach(k => {
    if (typeof overrides[k] === "object") Object.assign(ctx.RAID[k], overrides[k]); else ctx.RAID[k] = overrides[k];
  });
  return ctx;
}

/* 별 9개를 1~5로 나누는 경우를 고르게 하나 */
const TRIPLES = [];
for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) { const c = 9 - a - b; if (c >= 1 && c <= 5) TRIPLES.push([a, b, c]); }

/* japan: 모둠 안 일본 카드 수(앞에서부터, true는 1장). accuracy: 퀴즈 정답률(기본 1). */
export function simulate(ctx, { n, size, japan, mode, seed, jpChoice, accuracy }) {
  const L = ctx.module.exports;
  const rng = L.seeded(seed || 1);
  const jpN = japan === true ? 1 : (japan || 0);
  const others = ["ottoman", "iran", "india", "thai", "qing", "joseon"];
  let win = 0, turns = 0, minT = 1e9, maxT = 0, jp = 0, quizzes = 0, msgTaps = 0, btnTaps = 0;
  for (let g = 0; g < n; g++) {
    const ms = [];
    for (let k = 0; k < size; k++) {
      const [a, b, c] = TRIPLES[Math.floor(rng() * TRIPLES.length)];
      const region = k < jpN ? "japan" : others[Math.floor(rng() * others.length)];
      ms.push(L.raidMember({ region, stats: { lead: { n: a }, guard: { n: b }, unity: { n: c } }, hit: "당한 일", w2: "약점", mvName: "기술" }, { sid: "2" + k, name: "학생" + k }));
    }
    const st = L.playRaid(ms, mode, rng, jpChoice, accuracy);
    if (st.over === "win") win++;
    if (st.japanDone) jp++;
    turns += st.bossTurns; minT = Math.min(minT, st.bossTurns); maxT = Math.max(maxT, st.bossTurns);
    quizzes += st.sim.quizzes; msgTaps += st.sim.msgTaps; btnTaps += st.sim.btnTaps;
  }
  return { win: win / n, avgTurns: turns / n, minT, maxT, jpRate: jp / n, quizzes: quizzes / n, msgTaps: msgTaps / n, btnTaps: btnTaps / n };
}

/* 시험하는 경우: 모둠 2·3·4명(일본 0·1장, 3명은 2장, 4명은 2·3장), 최종 6·7·8명(일본 0·1장) × 정답률 0.5·0.7·1.0 */
export const CASES = [
  ["group", 2, 0], ["group", 2, 1], ["group", 3, 0], ["group", 3, 1], ["group", 3, 2],
  ["group", 4, 0], ["group", 4, 1], ["group", 4, 2], ["group", 4, 3],
  ["final", 6, 0], ["final", 6, 1], ["final", 7, 0], ["final", 7, 1], ["final", 8, 0], ["final", 8, 1]
];
export const ACCS = [0.5, 0.7, 1];

export function report(ctx, log, n) {
  const rows = [];
  const pct = x => (x * 100).toFixed(1) + "%";
  ACCS.forEach(accuracy => CASES.forEach(([mode, size, japan]) => {
    const r = simulate(ctx, { n: n || 1000, size, japan, mode, accuracy, seed: size * 7 + japan * 13 + (mode === "final" ? 100 : 0) + Math.round(accuracy * 1000) });
    rows.push(Object.assign({ mode, size, japan, accuracy }, r));
    if (log) log("정답률 " + accuracy + " · " + (mode === "final" ? "최종 보스전 " : "모둠 레이드 ") + size + "명 일본 " + japan + "장: 승률 " + pct(r.win)
      + ", 보스 차례 평균 " + r.avgTurns.toFixed(1) + " (" + r.minT + "~" + r.maxT + "), 일본 이벤트까지 " + pct(r.jpRate)
      + ", 퀴즈 " + r.quizzes.toFixed(1) + "번, 메시지 누르기 " + r.msgTaps.toFixed(1) + "번, 단추 " + r.btnTaps.toFixed(1) + "번");
  }));
  return rows;
}

if (process.argv[1] && process.argv[1].endsWith("sim.mjs")) report(loadCtx(), console.log);
