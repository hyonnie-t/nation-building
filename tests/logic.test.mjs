// node tests/logic.test.mjs — 판정 함수, data.js 카드 구성, 카드 글 왕복, 레이드 계산·균형 시뮬레이션 시험
import assert from "node:assert/strict";
import { loadCtx, report } from "./sim.mjs";

const ctx = loadCtx();
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
  stats: { lead: { n: 5, r: "근거 하나", p: "172" }, guard: { n: 3, r: "", p: "" }, unity: { n: 1, r: "", p: "" } },
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
  assert.equal(J(c.stats.lead), J({ n: 5, r: "근거 하나", p: "172" }));
  assert.equal(J(c.stats.guard), J({ n: 3, r: "", p: "" }));
  assert.equal(c.stats.unity.n, 1);
  assert.equal(c.w3, "같은 점: 둘 다 헌법"); assert.equal(c.pg3, "182, 184");
  assert.equal(c.w4, "결과를 가른 것은 이것이다: 이유");
  assert.equal(L.hp(c.stats), 36); // 30 + 안의 단결력 1 × 6
});

t("근거 1개 + 근거 없음 2개: 근거 없는 줄은 콜론 없이 «⚡ 개혁 추진력 ★3»", () => {
  const text = L.cardText(sample, REGIONS, ctx.STATS);
  assert.ok(text.includes("\n⚡ 개혁 추진력 ★5: 근거 하나 (172쪽)\n"), text);
  assert.ok(text.includes("\n🛡️ 외세 방어력 ★3\n"), text);
  assert.ok(text.includes("\n🤝 안의 단결력 ★1\n"), text);
  assert.equal(L.starSum({ lead: 5, guard: 3, unity: 1 }), 9);
});

t("별 9개: 합계·남은 별·넘기기 막기·가장 많이 준 능력치(동점은 여럿)", () => {
  assert.equal(ctx.RAID.starTotal, 9);
  assert.equal(L.starsLeft({ lead: 2, guard: 3, unity: 0 }), 4);
  assert.equal(L.canSetStar({ lead: 5, guard: 3, unity: 1 }, "unity", 2), false);
  assert.equal(L.canSetStar({ lead: 5, guard: 3, unity: 1 }, "lead", 4), true);
  assert.equal(J(L.topStats({ lead: 3, guard: 3, unity: 3 })), J(["lead", "guard", "unity"]));
  assert.equal(J(L.topStats({ lead: 2, guard: 5, unity: 2 })), J(["guard"]));
  assert.equal(J(L.topStats({ lead: 0, guard: 0, unity: 0 })), J([]));
});

t("parseCardText: 카드 글이 아니면 null", () => {
  assert.equal(L.parseCardText("[고른 지역] 타이 · [비교 지역] 청", REGIONS, ctx.STATS), null);
  assert.equal(L.parseCardText("", REGIONS, ctx.STATS), null);
});

t("능력치 3개, 지역마다 카드 모양(LOOK) 상징 3개", () => {
  assert.equal(ctx.STATS.length, 3);
  REGIONS.forEach(r => assert.equal(ctx.LOOK[r.id].syms.length, 3, r.id));
});

/* ── 레이드 계산 ── 주사위를 고정하려고 rng를 상수로 준다(0.5 → 주사위 4) */
const half = () => 0.5;
const mk = (region, a, b, c, extra) => L.raidMember(Object.assign({ region, stats: { lead: { n: a }, guard: { n: b }, unity: { n: c } }, hit: "열강의 압력이 이어졌다", w2: "술탄이 헌법을 정지했다", mvName: "탄지마트" }, extra), { sid: "20501", name: "가" });

t("raidMember: HP = 30 + 안의 단결력 × 6, 기본 카드는 3·3·3 «함께 버티기»·글 없음", () => {
  const m = mk("ottoman", 5, 3, 1);
  assert.equal(m.max, 36); assert.equal(m.mvName, "탄지마트");
  const b = L.raidMember({ region: "iran", stats: { lead: { n: 3 }, guard: { n: 3 }, unity: { n: 3 } } }, { sid: "", name: "나" }, true);
  assert.equal(b.max, 48); assert.equal(b.mvName, "함께 버티기"); assert.equal(b.hit, ""); assert.equal(b.weak, "");
});

t("필살기: 추진력 × 4 + 주사위, 다음 내 차례 한 번은 못 씀", () => {
  const st = L.newRaid([mk("ottoman", 5, 3, 1), mk("thai", 2, 4, 3)], "group");
  const hp0 = st.boss.hp;
  const ev = L.act(st, "special", half);
  assert.equal(ev[0].dmg, 5 * 4 + 4);
  assert.equal(st.boss.hp, hp0 - 24);
  assert.equal(st.members[0].cd, 1);
  L.act(st, "guard", half); // 타이 막아서기
  L.bossTurn(st, half, "");
  assert.equal(L.currentActor(st), 0);
  assert.equal(L.canSpecial(st.members[0]), false); // 쉬는 차례
  L.act(st, "heal", half);
  assert.equal(L.canSpecial(st.members[0]), true);
});

t("막아서기는 이번 보스 차례 모둠 전체 피해에서 그만큼 빼고, 힘 보태기는 HP가 가장 낮은 동료를 회복", () => {
  const st = L.newRaid([mk("ottoman", 5, 3, 1), mk("thai", 2, 4, 3)], "group");
  L.act(st, "guard", half); // 3 × 2 = 6
  L.act(st, "guard", half); // 4 × 2 = 8 → 합 14
  assert.equal(st.shield, 14);
  const ev = L.bossTurn(st, () => 0.9, ""); // 약점 아님(0.9 ≥ 0.25), 주사위 6
  const hits = ev.filter(e => e.t === "boss");
  assert.equal(hits.length, 2); // 살아 있는 카드 모두를 친다
  const raw = ctx.RAID.group.bossAtk + 6;
  assert.equal(hits[0].blocked + hits[1].blocked, Math.min(14, raw * 2));
  assert.equal(st.shield, 0);
  st.members[1].hp = 10;
  const h = L.act(st, "heal", half);
  assert.equal(h[0].to, 1); assert.equal(st.members[1].hp, 10 + 1 * 4);
});

t("보스 공격 이름은 당한 일(약점 공격이면 약점, 피해 1.5배), 30자 넘으면 자르고 «…»", () => {
  const long = "가".repeat(40);
  const st = L.newRaid([mk("ottoman", 5, 3, 1, { hit: long }), mk("thai", 2, 4, 3)], "group");
  L.act(st, "guard", half); L.act(st, "guard", half); st.shield = 0;
  const ev = L.bossTurn(st, () => 0.1, ""); // 0.1 < 0.25 → 약점 공격
  const e0 = ev.find(e => e.t === "boss" && e.to === 0);
  assert.equal(e0.weak, true); assert.equal(e0.name, "술탄이 헌법을 정지했다");
  assert.equal(e0.dmg, Math.round((ctx.RAID.group.bossAtk + 1) * 1.5));
  assert.equal(L.clip(long, 30), "가".repeat(30) + "…");
  const st2 = L.newRaid([L.raidMember({ region: "iran", stats: {} }, {}, true), mk("thai", 2, 4, 3)], "group");
  L.act(st2, "guard", half); L.act(st2, "guard", half); st2.shield = 0;
  assert.equal(L.bossTurn(st2, () => 0.9, "").find(e => e.t === "boss" && e.to === 0).name, ""); // 화면에서 «열강의 압박!»
});

t("쓰러진 카드: 흐리게 남고, 남은 카드 필살기 +3씩, 모두 쓰러지면 패배", () => {
  const st = L.newRaid([mk("ottoman", 5, 3, 1), mk("thai", 2, 4, 3)], "group");
  st.members[0].hp = 1;
  L.act(st, "guard", half); L.act(st, "guard", half); st.shield = 0;
  const ev = L.bossTurn(st, () => 0.9, "");
  assert.ok(ev.some(e => e.t === "down" && e.who === 0));
  assert.equal(st.members[0].down, true); assert.equal(st.fallen, 1);
  assert.equal(L.currentActor(st), 1);
  const sp = L.act(st, "special", half);
  assert.equal(sp[0].dmg, 2 * 4 + 4 + 3);
  st.members[1].hp = 1;
  const ev2 = L.bossTurn(st, () => 0.9, "");
  assert.equal(st.over, "lose"); assert.ok(ev2.some(e => e.t === "lose"));
});

const toThird = st => { while (st.bossTurns < 3 && !st.over) { if (L.currentActor(st) >= 0) L.act(st, "guard", half); else { const ev = L.bossTurn(st, () => 0.9, ""); if (st.bossTurns === 3) return ev; } } return []; };

t("일본 이벤트(일본 카드 있음): 세 번째 보스 차례 직후 한 번, 카드가 보스 편으로, 그 학생이 공격을 고름", () => {
  const st = L.newRaid([mk("ottoman", 5, 3, 1), mk("japan", 3, 3, 3), mk("thai", 2, 4, 3)], "group");
  st.members.forEach(m => { m.hp = m.max = 200; });
  const ev = toThird(st);
  assert.equal(J(ev.filter(e => /^jp/.test(e.t)).map(e => e.t)), J(["jp1", "jp2", "jpSwitch", "jpQ"]));
  assert.equal(st.members[1].foe, true); assert.equal(st.controller, 1);
  assert.equal(J(L.teamIdx(st)), J([0, 2])); // 그 학생의 플레이어 차례는 없다
  const before = st.boss.hp;
  L.act(st, "guard", half); L.act(st, "guard", half); st.shield = 0;
  const b = L.bossTurn(st, half, "weak");
  assert.ok(b.filter(e => e.t === "boss").every(e => e.weak));
  assert.ok(!b.some(e => /^jp/.test(e.t))); // 다시 안 일어난다
  assert.ok(st.boss.hp === before);
});

t("일본 이벤트(일본 카드 없음): 보스 HP +30, 공격 +3, 일본이 보스 옆에", () => {
  const st = L.newRaid([mk("ottoman", 5, 3, 1), mk("thai", 2, 4, 3)], "group");
  st.members.forEach(m => { m.hp = m.max = 200; });
  const hp0 = st.boss.hp, atk0 = st.boss.atk;
  const ev = toThird(st);
  assert.equal(J(ev.filter(e => /^jp/.test(e.t)).map(e => e.t)), J(["jp1", "jp2", "jpAlly", "jpQ"]));
  assert.equal(st.japanAlly, true);
  assert.equal(st.boss.hp, hp0 + 30); assert.equal(st.boss.atk, atk0 + 3);
});

t("보스 HP: 모둠 인원·최종 보스전 공식", () => {
  const two = [mk("ottoman", 5, 3, 1), mk("thai", 2, 4, 3)];
  const g = ctx.RAID.group, f = ctx.RAID.final;
  assert.equal(L.newRaid(two, "group").boss.max, 2 * g.bossHpPer);
  const six = Array.from({ length: 6 }, () => mk("iran", 3, 3, 3));
  assert.equal(L.newRaid(six, "final").boss.max, 6 * f.bossHpPer);
  assert.equal(L.newRaid(six, "final").boss.atk, f.bossAtk);
});

t("도트 캐릭터: 지역 7 + 보스, 모두 16×16, 쓰는 글자는 배색에 다 있다", () => {
  REGIONS.map(r => r.id).concat(["boss"]).forEach(id => {
    const rows = L.spriteRows(id);
    assert.equal(rows.length, 16, id);
    rows.forEach(r => assert.equal(r.length, 16, id));
    [L.spritePal(id, false)].concat(id === "boss" ? [] : [L.spritePal(id, true)]).forEach(pal =>
      rows.join("").split("").forEach(ch => assert.ok(ch === "." || pal[ch], id + " " + ch)));
  });
});

/* ── 균형 시뮬레이션(§5-6·§6): 무작위 별 9개 카드, 단순 전략, 각 1,000판 ── */
const rows = report(ctx, s => console.log("  " + s));
t("시뮬레이션: 모둠 60~80%, 최종 50~70%, 일본 포함이 10%p 넘게 낮지 않음, 보스 차례 평균 6~10번", () => {
  rows.forEach(r => {
    const [lo, hi] = r.mode === "final" ? [0.5, 0.7] : [0.6, 0.8];
    assert.ok(r.win >= lo && r.win <= hi, J(r));
    assert.ok(r.avgTurns >= 6 && r.avgTurns <= 10, J(r));
    if (r.japan) {
      const base = rows.find(x => x.mode === r.mode && x.size === r.size && !x.japan);
      assert.ok(base.win - r.win <= 0.10, J(r));
    }
  });
});

console.log(n + " passed");
