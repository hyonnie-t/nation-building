// node tests/logic.test.mjs — 판정 함수와 data.js 카드 구성 시험
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { module: { exports: {} } };
vm.createContext(ctx);
const src = ["data.js", "logic.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")
  + "\n;Object.assign(globalThis, { REGIONS, COLS, CARDS, TRAPS, SUMMARY, PART2, PART3, STATS, LOOK, GLOSSARY });";
vm.runInContext(src, ctx);
const L = ctx.module.exports;
const { REGIONS, COLS, CARDS, TRAPS, SUMMARY } = ctx;
let n = 0;
const J = x => JSON.stringify(x);
const t = (name, fn) => { fn(); n++; console.log("ok - " + name); };

t("지역 7 × 칸 3 = 카드 21장, 칸마다 정확히 한 장", () => {
  assert.equal(CARDS.length, REGIONS.length * COLS.length);
  const keys = CARDS.map(L.answerSlot);
  assert.equal(new Set(keys).size, CARDS.length);
  REGIONS.forEach(r => COLS.forEach(c => assert.ok(keys.includes(L.slotKey(r.id, c.id)), r.id + c.id)));
});

t("카드 id는 겹치지 않고, 모든 카드에 쪽수가 있다", () => {
  const all = CARDS.concat(TRAPS);
  assert.equal(new Set(all.map(k => k.id)).size, all.length);
  all.forEach(k => assert.ok(k.p && k.t, k.id));
});

t("지역마다 정리 한 줄이 있다", () => { REGIONS.forEach(r => assert.ok(SUMMARY[r.id], r.id)); });

t("정답대로 놓으면 done, 빈칸·틀림 수를 센다", () => {
  const ok = {};
  CARDS.concat(TRAPS).forEach(k => { ok[k.id] = L.answerSlot(k); });
  assert.equal(L.checkBoard(ok, CARDS, TRAPS).done, true);
  const part = Object.assign({}, ok); delete part.k01;
  assert.equal(L.checkBoard(part, CARDS, TRAPS).empty, 1);
  const sw = Object.assign({}, ok, { k01: ok.k02, k02: ok.k01 });
  assert.equal(J(L.checkBoard(sw, CARDS, TRAPS).wrong.sort()), J(["k01", "k02"]));
  const trapWrong = Object.assign({}, ok, { x1: "iran:a" });
  assert.equal(J(L.checkBoard(trapWrong, CARDS, TRAPS).wrong), J(["x1"]));
});

t("occupant: 지역 칸 주인 찾기, 남는 카드 칸은 늘 빈 것으로", () => {
  assert.equal(L.occupant({ k01: "ottoman:a" }, "ottoman:a"), "k01");
  assert.equal(L.occupant({ k01: "ottoman:a" }, "ottoman:b"), "");
  assert.equal(L.occupant({ x1: "trap" }, "trap"), "");
});

t("shuffledIds: 같은 시드면 같은 순서, 원소는 그대로", () => {
  const ids = CARDS.map(k => k.id);
  const a = L.shuffledIds(ids, "20512"), b = L.shuffledIds(ids, "20512");
  assert.equal(J(a), J(b));
  assert.equal(J(a.slice().sort()), J(ids.slice().sort()));
  assert.notEqual(J(a), J(ids));
});

t("charCounts: 칸별·합계", () => {
  const c = L.charCounts({ w1: " 가나 ", w2: "다라마" });
  assert.equal(c.w1, 2); assert.equal(c.w2, 3); assert.equal(c.total, 5);
});

t("moveRank: 위아래로 한 칸, 끝에서는 그대로", () => {
  assert.equal(J(L.moveRank(["a", "b", "c"], 1, -1)), J(["b", "a", "c"]));
  assert.equal(J(L.moveRank(["a", "b", "c"], 2, 1)), J(["a", "b", "c"]));
  assert.equal(J(L.moveRank(["a", "b", "c"], 0, -1)), J(["a", "b", "c"]));
});

const sample = {
  region: "ottoman", compare: "joseon", sym: "🕌",
  hit: "열강의\n압력이 이어졌다", pgHit: "172쪽",
  mvName: "개혁 이름", w1: "근대적 개혁을 했다 (괄호도 있음)", pg1: "172",
  w2: "술탄이 헌법을 정지했다", pg2: "",
  stats: { lead: { n: 4, r: "근거 하나", p: "172" }, guard: { n: 2, r: "근거 둘", p: "" }, unity: { n: 1, r: "", p: "" } },
  w3: "같은 점: 둘 다 헌법", pg3: "182, 184", w4: "결과를 가른 것은 이것이다: 이유"
};

t("cardText → parseCardText: 되살리면 같은 카드(줄바꿈은 한 줄로, 쪽 글자는 뗌)", () => {
  const { STATS } = ctx;
  const text = L.cardText(sample, REGIONS, STATS);
  assert.ok(text.indexOf("[역사 카드] 오스만 제국 🕌 · 라이벌 조선") === 0, text);
  assert.ok(text.indexOf("당한 일: 열강의 압력이 이어졌다 (172쪽)") > 0, text);
  const c = L.parseCardText(text, REGIONS, STATS);
  assert.equal(c.region, "ottoman"); assert.equal(c.compare, "joseon"); assert.equal(c.sym, "🕌");
  assert.equal(c.hit, "열강의 압력이 이어졌다"); assert.equal(c.pgHit, "172");
  assert.equal(c.mvName, "개혁 이름"); assert.equal(c.w1, "근대적 개혁을 했다 (괄호도 있음)"); assert.equal(c.pg1, "172");
  assert.equal(c.w2, "술탄이 헌법을 정지했다"); assert.equal(c.pg2, "");
  assert.equal(J(c.stats.lead), J({ n: 4, r: "근거 하나", p: "172" }));
  assert.equal(c.stats.unity.n, 1);
  assert.equal(c.w3, "같은 점: 둘 다 헌법"); assert.equal(c.pg3, "182, 184");
  assert.equal(c.w4, "결과를 가른 것은 이것이다: 이유");
  assert.equal(L.hp(c.stats), 70);
});

t("parseCardText: 카드 글이 아니면 null", () => {
  assert.equal(L.parseCardText("[고른 지역] 타이 · [비교 지역] 청", REGIONS, ctx.STATS), null);
  assert.equal(L.parseCardText("", REGIONS, ctx.STATS), null);
});

t("능력치 3개, 지역마다 카드 모양(LOOK) 상징 3개", () => {
  assert.equal(ctx.STATS.length, 3);
  REGIONS.forEach(r => assert.equal(ctx.LOOK[r.id].syms.length, 3, r.id));
});

console.log(n + " passed");
