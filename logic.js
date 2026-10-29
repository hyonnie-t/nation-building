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
function hp(stats) { return ["lead", "guard", "unity"].reduce((s, k) => s + ((stats && stats[k] && stats[k].n) || 0), 0) * 10; }

function nameOf(list, id) { const x = list.find(r => r.id === id); return x ? x.name : ""; }

function cardText(c, regions, statDefs) {
  const lines = ["[역사 카드] " + (nameOf(regions, c.region) || "?") + " " + (c.sym || "") + " · 라이벌 " + (nameOf(regions, c.compare) || "?")];
  lines.push("당한 일: " + withPage(c.hit, c.pgHit));
  lines.push("필살기 «" + oneLine(c.mvName) + "»: " + withPage(c.w1, c.pg1));
  lines.push("약점: " + withPage(c.w2, c.pg2));
  statDefs.forEach(d => {
    const s = (c.stats && c.stats[d.id]) || {};
    lines.push(d.icon + " " + d.name + " ★" + (s.n || 0) + ": " + withPage(s.r, s.p));
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

if (typeof module !== "undefined") module.exports = { TRAP_SLOT, slotKey, answerSlot, checkBoard, occupant, shuffledIds, charCounts, moveRank, oneLine, cleanPage, hp, cardText, parseCardText };
