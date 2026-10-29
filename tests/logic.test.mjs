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
  + "\n;Object.assign(globalThis, { REGIONS, COLS, CARDS, TRAPS, SUMMARY, PART2, GLOSSARY });";
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

console.log(n + " passed");
