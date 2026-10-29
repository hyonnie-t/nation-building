/* 판정 순수 함수(logic.js) — 화면과 상관없이 tests/logic.test.mjs에서 시험한다.
 * placed: { 카드id: 칸key } — 칸key는 "지역id:칸id"(예: "iran:b") 또는 남는 카드 칸 "trap". */
const TRAP_SLOT = "trap";

function slotKey(r, c) { return r + ":" + c; }

/* 카드 하나의 정답 칸 */
function answerSlot(card) { return card.r ? slotKey(card.r, card.c) : TRAP_SLOT; }

/* 지금 놓인 상태를 정답과 견준다. 빈칸 수, 틀린 카드 id 목록, 다 맞았는지를 돌려준다. */
function checkBoard(placed, cards, traps) {
  const all = cards.concat(traps);
  const wrong = [];
  let empty = 0;
  all.forEach(k => {
    const at = placed[k.id];
    if (!at) { empty++; return; }
    if (at !== answerSlot(k)) wrong.push(k.id);
  });
  return { empty: empty, wrong: wrong, done: empty === 0 && wrong.length === 0 };
}

/* 지역 칸(남는 카드 칸 제외)은 카드 한 장만 받는다. 이미 있는 카드 id를 돌려준다(없으면 ""). */
function occupant(placed, key) {
  if (key === TRAP_SLOT) return "";
  const ids = Object.keys(placed);
  for (let i = 0; i < ids.length; i++) if (placed[ids[i]] === key) return ids[i];
  return "";
}

/* 학번 시드로 늘 같은 순서로 섞는다(새로고침해도 카드 순서가 안 바뀐다) */
function shuffledIds(ids, seed) {
  const a = ids.slice();
  let s = 0;
  String(seed).split("").forEach(ch => { s = (s * 31 + ch.charCodeAt(0)) >>> 0; });
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* 2부 글자 수: 칸별 글자 수와 합계(공백 포함, 앞뒤 공백 제외) */
function charCounts(texts) {
  const out = {};
  let total = 0;
  Object.keys(texts).forEach(k => { const n = String(texts[k] || "").trim().length; out[k] = n; total += n; });
  out.total = total;
  return out;
}

/* 1부 순위: i번째를 d(-1 위로, +1 아래로)만큼 옮긴 새 배열. 끝에서 더 못 가면 그대로. */
function moveRank(rank, i, d) {
  const j = i + d;
  if (i < 0 || i >= rank.length || j < 0 || j >= rank.length) return rank.slice();
  const a = rank.slice();
  const t = a[i]; a[i] = a[j]; a[j] = t;
  return a;
}

/* ── 2·3부 캐릭터 카드 ──
 * card: { region, compare, sym, hit, pgHit, mvName, w1, pg1, w2, pg2,
 *         stats: { lead: { n, r, p }, guard: {…}, unity: {…} }, w3, pg3, w4 }
 * 시트 G열(reflection)에 사람이 읽는 글로 남기고, 3부는 그 글을 다시 읽어 카드로 되살린다. */
function oneLine(s) { return String(s == null ? "" : s).replace(/\s*\n+\s*/g, " ").trim(); }
function cleanPage(p) { return oneLine(p).replace(/[()]/g, "").replace(/쪽$/, "").trim(); }
function withPage(text, p) { const q = cleanPage(p); return oneLine(text) + (q ? " (" + q + "쪽)" : ""); }
/* 카드 HP = 30 + 안의 단결력 × 6 (수치는 data.js RAID) */
function statN(stats, k) { return (stats && stats[k] && stats[k].n) || 0; }
function hp(stats) { return RAID.cardHpBase + statN(stats, "unity") * RAID.cardHpPerUnity; }

/* 2부 별 9개 나누기: 합계, 남은 별, 가장 많이 준 능력치(동점이면 여럿) */
function starSum(stars) { return ["lead", "guard", "unity"].reduce((a, k) => a + ((stars && stars[k]) || 0), 0); }
function starsLeft(stars) { return RAID.starTotal - starSum(stars); }
function topStats(stars) {
  const ks = ["lead", "guard", "unity"];
  const max = Math.max.apply(null, ks.map(k => (stars && stars[k]) || 0));
  return max > 0 ? ks.filter(k => ((stars && stars[k]) || 0) === max) : [];
}
/* 별 하나를 i개로 바꿀 때 합계가 9를 넘으면 false */
function canSetStar(stars, id, i) { return starSum(Object.assign({}, stars, { [id]: i })) <= RAID.starTotal; }

function nameOf(list, id) { const x = list.find(r => r.id === id); return x ? x.name : ""; }

function cardText(c, regions, statDefs) {
  const lines = ["[역사 카드] " + (nameOf(regions, c.region) || "?") + " " + (c.sym || "") + " · 라이벌 " + (nameOf(regions, c.compare) || "?")];
  lines.push("당한 일: " + withPage(c.hit, c.pgHit));
  lines.push("필살기 «" + oneLine(c.mvName) + "»: " + withPage(c.w1, c.pg1));
  lines.push("약점: " + withPage(c.w2, c.pg2));
  statDefs.forEach(d => {
    const s = (c.stats && c.stats[d.id]) || {};
    const why = withPage(s.r, s.p);
    lines.push(d.icon + " " + d.name + " ★" + (s.n || 0) + (why ? ": " + why : "")); // 근거 없는 능력치는 콜론 없이
  });
  lines.push("라이벌 " + (nameOf(regions, c.compare) || "?") + ": " + withPage(c.w3, c.pg3));
  lines.push("결과를 가른 것: " + oneLine(c.w4));
  return lines.join("\n");
}

/* 끝의 « (○쪽)»을 떼어 [본문, 쪽] */
function splitPage(s) {
  const m = String(s).match(/^(.*?)\s*\(([^()]*?)쪽\)\s*$/);
  return m ? [m[1].trim(), m[2].trim()] : [String(s).trim(), ""];
}

function parseCardText(text, regions, statDefs) {
  const lines = String(text || "").split(/\r?\n/);
  const head = lines.find(l => l.indexOf("[역사 카드] ") === 0);
  if (!head) return null;
  const c = { stats: {} };
  const hm = head.slice("[역사 카드] ".length).match(/^(.*) · 라이벌 (.*)$/);
  if (!hm) return null;
  const left = hm[1].trim();
  const reg = regions.slice().sort((a, b) => b.name.length - a.name.length).find(r => left.indexOf(r.name) === 0);
  if (!reg) return null;
  c.region = reg.id;
  c.sym = left.slice(reg.name.length).trim();
  const cmp = regions.find(r => r.name === hm[2].trim());
  c.compare = cmp ? cmp.id : "";
  const after = (prefix) => { const l = lines.find(x => x.indexOf(prefix) === 0); return l == null ? null : l.slice(prefix.length); };
  let v;
  if ((v = after("당한 일: ")) != null) [c.hit, c.pgHit] = splitPage(v);
  const mv = lines.find(l => l.indexOf("필살기 «") === 0);
  if (mv) {
    const m = mv.match(/^필살기 «(.*?)»: (.*)$/);
    if (m) { c.mvName = m[1]; [c.w1, c.pg1] = splitPage(m[2]); }
  }
  if ((v = after("약점: ")) != null) [c.w2, c.pg2] = splitPage(v);
  statDefs.forEach(d => {
    const l = lines.find(x => x.indexOf(d.icon + " " + d.name + " ★") === 0);
    if (!l) { c.stats[d.id] = { n: 0, r: "", p: "" }; return; }
    const m = l.slice((d.icon + " " + d.name + " ★").length).match(/^(\d)(?::\s?(.*))?$/);
    const [r, p] = splitPage(m && m[2] ? m[2] : "");
    c.stats[d.id] = { n: m ? Number(m[1]) : 0, r: r, p: p };
  });
  const rv = lines.find(l => /^라이벌 [^·]*: /.test(l) && l.indexOf("[역사 카드]") < 0);
  if (rv) [c.w3, c.pg3] = splitPage(rv.replace(/^라이벌 [^:]*: /, ""));
  if ((v = after("결과를 가른 것: ")) != null) c.w4 = v.trim();
  return c;
}

/* ── 3부 열강 보스 레이드 ──
 * 화면과 떼어 놓은 계산만 여기 둔다. 수치는 data.js RAID. rng()는 0 이상 1 미만(시험에서는 시드 고정).
 * 한 바퀴 = 살아 있는 모둠 카드가 차례로 한 번씩 기술 → 보스 차례 한 번. 돌려주는 사건(ev)은 app.js가 문장으로 바꾼다. */
function dice(rng) { return 1 + Math.floor(rng() * 6); }
function clip(s, n) { s = oneLine(s); return Array.from(s).length > n ? Array.from(s).slice(0, n).join("") + "…" : s; }

/* 카드 → 레이드 참가자. who: { sid, name }, basic이면 학생 글 없이 지역 이름만. */
function raidMember(card, who, basic) {
  const n = k => statN(card.stats, k) || 3;
  const max = RAID.cardHpBase + n("unity") * RAID.cardHpPerUnity;
  return {
    sid: who.sid || "", name: who.name || "", region: card.region, sym: card.sym || "",
    mvName: basic ? RAID.basicMove : (oneLine(card.mvName) || RAID.basicMove),
    hit: basic ? "" : oneLine(card.hit), weak: basic ? "" : oneLine(card.w2),
    lead: n("lead"), guard: n("guard"), unity: n("unity"),
    hp: max, max: max, cd: 0, down: false, foe: false, basic: !!basic
  };
}

function newRaid(members, mode) {
  const cfg = RAID[mode === "final" ? "final" : "group"];
  const jp = members.filter(m => m.region === "japan").length;
  const bossMax = Math.round((members.length - jp * RAID.japanShare) * (cfg.bossHpPer + (members.length - cfg.base) * cfg.grow)); // 일본 카드는 나중에 보스 편으로 가므로 처음 보스 HP 몫을 덜 센다
  const st = {
    mode: mode === "final" ? "final" : "group",
    members: members.map(m => Object.assign({}, m, { hp: m.max, cd: 0, down: false, foe: false })),
    boss: { hp: bossMax, max: bossMax, atk: cfg.bossAtk },
    queue: [], qi: 0, bossTurns: 0, fallen: 0, shield: 0,
    japanDone: false, japanAlly: false, controller: -1, over: ""
  };
  startRound(st);
  return st;
}

function teamIdx(st) { return st.members.map((m, i) => i).filter(i => !st.members[i].down && !st.members[i].foe); }
function startRound(st) { st.queue = teamIdx(st); st.qi = 0; }
/* 지금 차례인 참가자 번호. -1이면 보스 차례. */
function currentActor(st) { return st.qi < st.queue.length ? st.queue[st.qi] : -1; }
function canSpecial(m) { return m.cd === 0; }

function act(st, skill, rng) {
  const i = currentActor(st);
  if (i < 0 || st.over) return [];
  const m = st.members[i];
  const ev = [];
  if (skill === "special" && canSpecial(m)) {
    const dmg = m.lead * RAID.specialPerLead + dice(rng) + st.fallen * RAID.fallenBonus;
    st.boss.hp = Math.max(0, st.boss.hp - dmg);
    m.cd = 1; // 다음 내 차례 한 번은 못 쓴다
    ev.push({ t: "special", who: i, dmg: dmg });
  } else if (skill === "heal") {
    const team = teamIdx(st);
    let low = team[0];
    team.forEach(j => { if (st.members[j].hp < st.members[low].hp) low = j; });
    const t = st.members[low];
    const amt = Math.min(t.max - t.hp, m.unity * RAID.healPerUnity);
    t.hp += amt;
    m.cd = 0;
    ev.push({ t: "heal", who: i, to: low, amt: amt });
  } else {
    const amt = m.guard * RAID.guardPerStat;
    st.shield = RAID.shieldStack ? st.shield + amt : Math.max(st.shield, amt);
    m.cd = 0;
    ev.push({ t: "guard", who: i, amt: amt });
  }
  if (st.boss.hp <= 0) { st.over = "win"; ev.push({ t: "win" }); return ev; }
  st.qi++;
  return ev;
}

/* 보스 차례. choice: 일본 카드 주인이 고른 공격("random" | "weak"), 없으면 확률로 약점 공격. */
function bossTurn(st, rng, choice) {
  if (st.over || currentActor(st) >= 0) return [];
  const ev = [];
  const team = teamIdx(st).slice();
  const hits = Math.min(team.length, Math.ceil(team.length / RAID.bossHitsPer)); // 모둠이 클수록 한 번에 여럿을 친다
  const weak = choice ? choice === "weak" : rng() < RAID.weakChance;
  for (let h = 0; h < hits; h++) {
    const ti = team.splice(Math.floor(rng() * team.length), 1)[0];
    const t = st.members[ti];
    let dmg = st.boss.atk + dice(rng);
    if (weak) dmg = Math.round(dmg * RAID.weakMul);
    const blocked = Math.min(dmg, st.shield); // 막아서기는 이번 보스 차례 모둠 전체 피해에서 그만큼 뺀다
    dmg -= blocked;
    st.shield -= blocked;
    t.hp = Math.max(0, t.hp - dmg);
    const text = weak ? t.weak : t.hit;
    ev.push({ t: "boss", to: ti, dmg: dmg, blocked: blocked, weak: weak, name: text ? clip(text, RAID.textMax) : "", by: st.controller });
    if (t.hp <= 0) { t.down = true; st.fallen++; ev.push({ t: "down", who: ti }); }
  }
  st.shield = 0;
  st.bossTurns++;
  if (!teamIdx(st).length) { st.over = "lose"; ev.push({ t: "lose" }); return ev; }
  if (!st.japanDone && st.bossTurns === RAID.japanAfter) ev.push.apply(ev, japanEvent(st));
  if (!st.over) startRound(st);
  return ev;
}

/* 일본 이벤트(한 번만): 모둠의 살아 있는 일본 카드는 보스 편으로, 없으면 일본이 보스 옆에 선다. */
function japanEvent(st) {
  st.japanDone = true;
  const ev = [{ t: "jp1" }, { t: "jp2" }];
  const jps = teamIdx(st).filter(i => st.members[i].region === "japan");
  if (jps.length) {
    jps.forEach(i => {
      const m = st.members[i];
      m.foe = true;
      const add = Math.round(m.hp * RAID.japanHpRate);
      st.boss.hp += add; st.boss.max += add;
      st.boss.atk += Math.round(m.lead * RAID.japanAtkRate);
      if (st.controller < 0) st.controller = i;
      ev.push({ t: "jpSwitch", who: i, hp: add });
    });
  } else {
    st.japanAlly = true;
    st.boss.hp += RAID.noJapanHp; st.boss.max += RAID.noJapanHp;
    st.boss.atk += RAID.noJapanAtk;
    ev.push({ t: "jpAlly" });
  }
  ev.push({ t: "jpQ" });
  if (!teamIdx(st).length) { st.over = "lose"; ev.push({ t: "lose" }); }
  return ev;
}

/* 시뮬레이션용 단순 전략: 필살기 가능하면 필살기, HP 30% 아래 동료가 있으면 힘 보태기, 아니면 막아서기 */
function simpleSkill(st) {
  const m = st.members[currentActor(st)];
  if (canSpecial(m)) return "special";
  if (teamIdx(st).some(j => st.members[j].hp < st.members[j].max * 0.3)) return "heal";
  return "guard";
}

function playRaid(members, mode, rng, jpChoice) {
  const st = newRaid(members, mode);
  let guard = 0;
  while (!st.over && guard++ < 1000) {
    if (currentActor(st) >= 0) act(st, simpleSkill(st), rng);
    else bossTurn(st, rng, st.controller >= 0 ? (jpChoice || "weak") : "");
  }
  return st;
}

/* 시드 고정 난수(mulberry32) */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 도트 캐릭터 격자(data.js SPRITES) ── 왼쪽 반 9글자를 거울로 펴서 16줄 × 16칸 */
function mirrorRow(h) { const a = Array.from(h.padEnd(9, ".").slice(0, 9)); return a.concat(a.slice(1, 8).reverse()).join(""); }
function spriteRows(id) {
  const def = SPRITES[id];
  if (!def) return null;
  const rows = (def.rows || def.top.concat(SPRITE_BODY)).map(mirrorRow).map(r => Array.from(r));
  (def.marks || []).forEach(([y, x, ch]) => { rows[y][x] = ch; if (16 - x <= 15) rows[y][16 - x] = ch; });
  return rows.map(r => r.join(""));
}
/* 글자 → 색. foe면 보스 배색(일본 카드가 열강 편으로 넘어갔을 때) */
function spritePal(id, foe) {
  if (id === "boss") return SPRITE_PAL.boss;
  if (foe) return SPRITE_PAL.foe;
  const look = LOOK[id] || { c1: "#6d6f86", c2: "#e1e2ea" };
  return Object.assign({ a: look.c1, b: look.c2 }, SPRITE_PAL.base);
}

if (typeof module !== "undefined") module.exports = { TRAP_SLOT, slotKey, answerSlot, checkBoard, occupant, shuffledIds, charCounts, moveRank, oneLine, cleanPage, hp, starSum, starsLeft, topStats, canSetStar, cardText, parseCardText,
  dice, clip, raidMember, newRaid, teamIdx, currentActor, canSpecial, act, bossTurn, japanEvent, simpleSkill, playRaid, seeded, mirrorRow, spriteRows, spritePal };
