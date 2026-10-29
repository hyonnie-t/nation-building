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

if (typeof module !== "undefined") module.exports = { TRAP_SLOT, slotKey, answerSlot, checkBoard, occupant, shuffledIds, charCounts };
