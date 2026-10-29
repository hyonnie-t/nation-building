// 레이드 균형 시뮬레이션(logic.test.mjs가 부른다. 따로: node tests/sim.mjs)
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

export function simulate(ctx, { n, size, japan, mode, seed, jpChoice }) {
  const L = ctx.module.exports;
  const rng = L.seeded(seed || 1);
  const others = ["ottoman", "iran", "india", "thai", "qing", "joseon"];
  let win = 0, turns = 0, minT = 1e9, maxT = 0, jp = 0;
  for (let g = 0; g < n; g++) {
    const ms = [];
    for (let k = 0; k < size; k++) {
      const [a, b, c] = TRIPLES[Math.floor(rng() * TRIPLES.length)];
      const region = japan && k === 0 ? "japan" : others[Math.floor(rng() * others.length)];
      ms.push(L.raidMember({ region, stats: { lead: { n: a }, guard: { n: b }, unity: { n: c } }, hit: "당한 일", w2: "약점", mvName: "기술" }, { sid: "2" + k, name: "학생" + k }));
    }
    const st = L.playRaid(ms, mode, rng, jpChoice);
    if (st.over === "win") win++;
    if (st.japanDone) jp++;
    turns += st.bossTurns; minT = Math.min(minT, st.bossTurns); maxT = Math.max(maxT, st.bossTurns);
  }
  return { win: win / n, avgTurns: turns / n, minT, maxT, jpRate: jp / n };
}

export function report(ctx, log) {
  const rows = [];
  const pct = x => (x * 100).toFixed(1) + "%";
  [["group", [2, 3, 4]], ["final", [6, 7, 8]]].forEach(([mode, sizes]) => {
    sizes.forEach(size => [false, true].forEach(japan => {
      const r = simulate(ctx, { n: 1000, size, japan, mode, seed: size * 7 + (japan ? 1 : 0) + (mode === "final" ? 100 : 0) });
      rows.push(Object.assign({ mode, size, japan }, r));
      if (log) log((mode === "final" ? "최종 보스전 " : "모둠 레이드 ") + size + "명 " + (japan ? "일본 포함" : "일본 없음") + ": 승률 " + pct(r.win) + ", 보스 차례 평균 " + r.avgTurns.toFixed(1) + " (" + r.minT + "~" + r.maxT + "), 일본 이벤트까지 간 판 " + pct(r.jpRate));
    }));
  });
  return rows;
}

if (process.argv[1] && process.argv[1].endsWith("sim.mjs")) report(loadCtx(), console.log);
