/* 주제35~39 「국민 국가 건설, 결과는 왜 달랐을까?」 — 화면·진행(app.js)
 * 판정·카드 글 변환은 logic.js(순수 함수), 문구·카드는 data.js.
 * ?part=1(기본): 1차시 단서 카드 분류판 + 순위 / ?part=2: 2차시 개혁 캐릭터 카드(수행평가) / ?part=3: 3차시 카드 대결(정리).
 * 포털에는 세 활동을 따로 등록한다. */
const CONFIG = {
  SHEET_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbyXSjCfWY_HiZFqW_OBR-FQDoIfF1z_STqyKWUI31MacHeY3u7hbirFSFDvW-5yuUHaJQ/exec",
  /* 포털 커리큘럼 관리에 이 id로 활동을 등록한다(부마다 하나) */
  GAME_NAMES: { 1: "35차시_국민국가건설_단서분류", 2: "35차시_국민국가건설_탐구글", 3: "35차시_국민국가건설_카드대결" },
  GAME_NAME: "" // init()에서 부에 맞게 채운다
};

const S = {
  part: 1, sid: "", name: "", grade: 0, ban: 0, preview: false,
  placed: {}, cur: "", tries: 0, done1: false, marked: false, rank: REGIONS.map(r => r.id),
  region: "", compare: "", sym: "", stars: { lead: 0, guard: 0, unity: 0 },
  card3: null, edits: {}, score: { w: 0, d: 0, l: 0 },
  copied: false, sending: false, submitted: false, padletUrl: "", padletLoading: false
};
const SAVE_KEYS = { 1: ["placed", "cur", "tries", "done1", "rank"], 2: ["region", "compare", "sym", "stars"], 3: ["edits", "score"] };
const W_IDS = ["hit", "w1", "w2", "r_lead", "r_guard", "r_unity", "w3", "w4"];
const PG_IDS = ["pgHit", "pg1", "pg2", "p_lead", "p_guard", "p_unity", "pg3"];

const $ = id => document.getElementById(id);
const byId = (arr, id) => arr.find(x => x.id === id);
const val = id => $(id).value.trim();
/* 교사 미리보기(?preview=1)에서는 필수 활동을 안 해도 다음으로 넘어간다(효니 2026-10-29). 학생 화면은 그대로. */
const skip = () => S.preview;
const ALL_CARDS = () => CARDS.concat(TRAPS);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function show(key) {
  ["s0", "p1", "p2", "p3"].forEach(k => { $(k).hidden = (k !== key); });
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}

function parseSid(sid) {
  if (!/^\d{5}$/.test(sid)) return null;
  return { grade: Number(sid[0]), ban: Number(sid.slice(1, 3)), num: Number(sid.slice(3)) };
}

/* ── 진행 기억: 새로고침해도 이어서. 학번별 키라 공용 태블릿에서 안 섞인다. 미리보기에선 저장하지 않는다.
 *    글 칸은 draft_guard가 따로 맡는다. */
function storeKey() { return "nation_building:" + CONFIG.GAME_NAME + ":" + S.sid; }

function save() {
  if (S.preview || !S.sid) return;
  const v = { ts: Date.now() };
  SAVE_KEYS[S.part].forEach(k => { v[k] = S[k]; });
  try { localStorage.setItem(storeKey(), JSON.stringify(v)); } catch (e) { /* 저장소가 막히면 메모리만 */ }
}

function load() {
  if (S.preview) return;
  try {
    const v = JSON.parse(localStorage.getItem(storeKey()) || "null");
    if (!v || Date.now() - (v.ts || 0) > 7 * 864e5) return; // 7일 지난 기록은 버린다
    SAVE_KEYS[S.part].forEach(k => { if (v[k] !== undefined) S[k] = v[k]; });
    if (!S.placed || typeof S.placed !== "object") S.placed = {};
    const ids = REGIONS.map(r => r.id);
    if (!Array.isArray(S.rank) || S.rank.length !== ids.length || ids.some(id => S.rank.indexOf(id) < 0)) S.rank = ids;
    if (!S.stars || typeof S.stars !== "object") S.stars = { lead: 0, guard: 0, unity: 0 };
  } catch (e) { /* 무시 */ }
}

function clearSave() {
  try { localStorage.removeItem(storeKey()); } catch (e) { /* 무시 */ }
}

/* ── 시트 전송 ── */
async function postToSheet(payload) {
  if (S.preview) return { result: "success", preview: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000); // 응답이 안 오면 30초 뒤 실패로 돌려 다시 누르게 한다
  let json;
  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL, { method: "POST", body: JSON.stringify(payload), signal: ctl.signal });
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (json.result !== "success") {
    const err = new Error(json.message || "저장 실패");
    err.locked = !!json.locked;
    throw err;
  }
  return json;
}

/* 패들렛 링크는 백엔드 학년정보(포트폴리오)에서 가져온다. 반 정보가 든 링크라 레포에 적지 않는다. */
function ensureUrlScheme(u) {
  u = String(u || "").trim();
  return u && !/^https?:\/\//i.test(u) ? "https://" + u : u;
}

async function loadPadletUrl(grade, ban) {
  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL + "?mode=curriculum");
    const json = await res.json();
    const pf = json && json.grades && json.grades[String(grade)] && json.grades[String(grade)].portfolio;
    if (!pf) return "";
    return ensureUrlScheme(pf.urlByBan ? (pf.urlByBan[ban] || pf.urlByBan[String(ban)] || "") : (pf.url || ""));
  } catch (e) {
    return "";
  }
}

/* ── 시작 ── */
function startApp() {
  const sid = $("sid").value.trim();
  const name = $("sname").value.trim();
  const p = parseSid(sid);
  if (!p) { $("startErr").textContent = "학번은 숫자 5자리로 써 줘. (예: 20512)"; return; }
  if (!name) { $("startErr").textContent = "이름을 써 줘."; return; }
  $("startErr").textContent = "";
  S.sid = sid; S.name = name; S.grade = p.grade; S.ban = p.ban;
  FocusGuard.start({ key: CONFIG.GAME_NAME + ":" + sid }); // 작성 중 화면 이탈·붙여넣기 기록 (history26 snippets/focus_guard.js)
  if (window.DraftGuard) DraftGuard.start({ key: CONFIG.GAME_NAME, sid: sid }); // 글쓰기 칸 임시저장 (history26 v75)
  load();
  if (S.part === 1) {
    renderBoard();
    if (S.done1) showDone1();
    $("boardSkip").hidden = !skip() || S.done1; // 미리보기는 분류판을 먼저 보여 주고, 다 맞추지 않아도 버튼으로 다음(정리·제출)으로 간다
    show("p1");
    setTimeout(() => { $("t1c").textContent = val("t1").length + "자"; }, 700);
  } else if (S.part === 2) {
    S.padletLoading = true;
    loadPadletUrl(p.grade, p.ban).then(u => { S.padletUrl = u; S.padletLoading = false; renderPadlet(); });
    renderPicks();
    renderStarInputs();
    show("p2");
    setTimeout(refreshCounts, 700); // draft_guard가 글을 되살린 뒤 글자 수·카드를 다시 그린다
    restoreSubmitted();
  } else {
    renderScore();
    show("p3");
    loadMyCard();
    setTimeout(() => { $("t3c").textContent = val("t3").length + "자"; }, 700);
  }
}

/* ══ 1부: 단서 카드 분류판 ══ */
function deckIds() {
  const order = shuffledIds(ALL_CARDS().map(k => k.id), S.sid || "seed");
  return order.filter(id => !S.placed[id]);
}

function cardById(id) { return byId(ALL_CARDS(), id); }

function renderDeck() {
  const left = deckIds();
  if (left.length && left.indexOf(S.cur) < 0) S.cur = left[0];
  if (!left.length) S.cur = "";
  $("deckCount").textContent = left.length ? "남은 카드 " + left.length + "장" : "다 놓았어";
  const box = $("deckCard");
  box.innerHTML = "";
  if (!S.cur) {
    box.classList.add("empty");
    box.appendChild(el("p", "", S.done1 ? "분류판을 다 맞췄어." : "카드를 모두 놓았어. 아래 «맞춰 보기»를 눌러 봐."));
  } else {
    box.classList.remove("empty");
    const k = cardById(S.cur);
    box.appendChild(el("p", "card-text", k.t));
    box.appendChild(el("p", "card-page", "교과서 " + k.p + "쪽"));
  }
  $("deckPrev").disabled = $("deckNext").disabled = left.length < 2;
}

function stepDeck(d) {
  const left = deckIds();
  if (left.length < 2) return;
  const i = left.indexOf(S.cur);
  S.cur = left[(i + d + left.length) % left.length];
  save(); renderDeck();
}

function placedCardEl(id) {
  const k = cardById(id);
  const c = el("div", "placed");
  c.dataset.card = id;
  c.appendChild(el("p", "card-text", k.t));
  c.appendChild(el("p", "card-page", k.p + "쪽"));
  return c;
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";
  REGIONS.forEach(r => {
    const row = el("div", "region");
    row.dataset.r = r.id;
    row.appendChild(el("div", "rname", r.name));
    COLS.forEach(c => {
      const key = slotKey(r.id, c.id);
      const cell = el("div", "cell");
      cell.dataset.key = key;
      cell.dataset.col = c.name;
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      const id = occupant(S.placed, key);
      if (id) cell.appendChild(placedCardEl(id));
      else cell.setAttribute("aria-label", r.name + " · " + c.name + " 빈칸");
      row.appendChild(cell);
    });
    board.appendChild(row);
  });
  const trap = $("trapList");
  trap.innerHTML = "";
  Object.keys(S.placed).filter(id => S.placed[id] === TRAP_SLOT).forEach(id => trap.appendChild(placedCardEl(id)));
  document.querySelector(".board-wrap").classList.toggle("locked", S.done1);
  renderDeck();
}

function clearMarks() {
  if (!S.marked) return;
  S.marked = false;
  document.querySelectorAll(".wrong").forEach(e => e.classList.remove("wrong"));
  $("boardMsg").textContent = "";
}

/* 칸(또는 남는 카드 칸)을 눌렀을 때: 놓인 카드를 누르면 빼고, 빈칸이면 지금 카드를 놓는다 */
function tapSlot(key, cardEl) {
  if (S.done1) return;
  clearMarks();
  if (cardEl) { // 놓인 카드 빼기 → 더미로 돌아가 지금 카드가 된다
    const id = cardEl.dataset.card;
    delete S.placed[id];
    S.cur = id;
    save(); renderBoard();
    return;
  }
  if (!S.cur) { toast("놓을 카드가 없어."); return; }
  putCard(S.cur, key);
}

function putCard(id, key) {
  if (S.done1) return;
  clearMarks();
  const old = occupant(S.placed, key);
  if (old && old !== id) delete S.placed[old]; // 이미 찬 칸이면 원래 카드는 더미로 돌아간다
  S.placed[id] = key;
  S.cur = "";
  save(); renderBoard();
}

function boardClick(e) {
  if (Date.now() - drag.droppedAt < 300) return; // 끌어다 놓은 직후의 click은 무시
  const cardEl = e.target.closest(".placed");
  const slot = e.target.closest(".cell, #trapSlot");
  if (!slot) return;
  tapSlot(slot.dataset.key, cardEl);
}

/* 끌기: 손가락·마우스 모두 pointer 이벤트로. 조금이라도 움직여야 끌기로 본다(IR-simulator와 같은 방식). */
const drag = { id: "", x: 0, y: 0, ghost: null, moved: false, over: null, droppedAt: 0 };

function dragStart(e) {
  if (!S.cur || S.done1) return;
  if (e.button !== undefined && e.button !== 0) return;
  drag.id = S.cur; drag.x = e.clientX; drag.y = e.clientY; drag.moved = false; drag.over = null;
  const t = e.currentTarget;
  t.setPointerCapture && t.setPointerCapture(e.pointerId);
  t.addEventListener("pointermove", dragMove);
  t.addEventListener("pointerup", dragEnd);
  t.addEventListener("pointercancel", dragEnd);
}

function dragMove(e) {
  if (!drag.id) return;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 10) return;
    drag.moved = true;
    drag.ghost = el("div", "ghost", cardById(drag.id).t);
    document.body.appendChild(drag.ghost);
    e.currentTarget.classList.add("lifted");
  }
  e.preventDefault();
  drag.ghost.style.left = e.clientX + "px";
  drag.ghost.style.top = e.clientY + "px";
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const spot = under && under.closest ? under.closest(".cell, #trapSlot") : null;
  if (drag.over !== spot) {
    if (drag.over) drag.over.classList.remove("hover");
    if (spot) spot.classList.add("hover");
    drag.over = spot;
  }
  if (e.clientY < 70) window.scrollBy(0, -14); // 화면 끝에 닿으면 조금씩 스크롤
  else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
}

function dragEnd(e) {
  const t = e.currentTarget;
  t.removeEventListener("pointermove", dragMove);
  t.removeEventListener("pointerup", dragEnd);
  t.removeEventListener("pointercancel", dragEnd);
  const id = drag.id, moved = drag.moved, over = drag.over;
  if (drag.ghost) drag.ghost.remove();
  if (over) over.classList.remove("hover");
  drag.id = ""; drag.ghost = null; drag.over = null;
  t.classList.remove("lifted");
  if (!id || !moved) return;
  drag.droppedAt = Date.now();
  if (over && e.type === "pointerup") putCard(id, over.dataset.key);
}

function checkBoardNow() {
  if (S.done1) return;
  const res = checkBoard(S.placed, CARDS, TRAPS);
  if (!Object.keys(S.placed).length) { $("boardMsg").textContent = PART1.emptyMsg(res.empty); return; }
  S.tries++; save();
  if (!res.wrong.length && res.empty) { $("boardMsg").textContent = PART1.partOkMsg(res.empty); return; } // 일부만 놓아도 확인할 수 있게
  if (!res.done) {
    S.marked = true;
    res.wrong.forEach(id => {
      const c = document.querySelector('.placed[data-card="' + id + '"]');
      if (c) (c.closest(".cell") || c).classList.add("wrong");
    });
    $("boardMsg").textContent = PART1.wrongMsg(res.wrong.length);
    return;
  }
  S.done1 = true; save();
  renderBoard();
  showDone1();
  $("p1Done").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSumList(box) {
  box.innerHTML = "";
  REGIONS.forEach(r => {
    const li = el("li");
    li.appendChild(el("b", "", r.name));
    li.appendChild(el("span", "", SUMMARY[r.id]));
    box.appendChild(li);
  });
}

function showDone1() {
  $("boardMsg").textContent = "";
  $("boardCheck").hidden = S.done1;
  $("boardSkip").hidden = true;
  renderSumList($("sumList"));
  renderRank();
  $("p1Done").hidden = false;
  renderP1Submit();
}

/* 순위: 끌기 대신 ▲▼ 버튼(태블릿에서 정확하게). 정해진 답은 없고 기본 순서는 분류판 순서다. */
function renderRank() {
  const box = $("rankList");
  box.innerHTML = "";
  S.rank.forEach((id, i) => {
    const li = el("li", "rank-item");
    li.appendChild(el("span", "rank-no", (i + 1) + "등"));
    li.appendChild(el("span", "rank-name", byId(REGIONS, id).name));
    [["▲", -1, "위로"], ["▼", 1, "아래로"]].forEach(([t, d, word]) => {
      const b = el("button", "btn btn-ghost btn-sm", t);
      b.type = "button";
      b.setAttribute("aria-label", byId(REGIONS, id).name + " " + word);
      b.disabled = S.submitted || (d < 0 ? i === 0 : i === S.rank.length - 1);
      b.addEventListener("click", () => { S.rank = moveRank(S.rank, i, d); save(); renderRank(); });
      li.appendChild(b);
    });
    box.appendChild(li);
  });
}

function rankLine() { return S.rank.map((id, i) => (i + 1) + " " + byId(REGIONS, id).name).join(" > "); }

function renderP1Submit() {
  $("p1Submit").disabled = S.submitted || S.sending;
  $("p1Submit").textContent = S.submitted ? "제출 완료" : PART1.submitBtn;
}

async function submitPart1() {
  if (S.sending || S.submitted || (!S.done1 && !skip())) return;
  const t = val("t1");
  if (t.length < 5 && !skip()) { $("p1Err").textContent = "1등과 꼴찌를 정한 이유를 한두 문장 써 줘."; return; }
  if (t.length < PART1.thinkMin && !skip() && !confirm("아직 " + t.length + "자야. 그래도 제출할까?")) return;
  $("p1Err").textContent = "";
  S.sending = true; renderP1Submit(); $("p1Submit").textContent = "보내는 중…";
  const first = byId(REGIONS, S.rank[0]).name, last = byId(REGIONS, S.rank[S.rank.length - 1]).name;
  const payload = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: "분류판 완성 · 맞춰 보기 " + S.tries + "번 · 1등 " + first + " · 꼴찌 " + last,
    diffSummary: "",
    reflection: "[순위] " + rankLine() + "\n" + t, // 시트 G열: 순위 + 1등·꼴찌 이유
    choicesJson: JSON.stringify({ sid: S.sid, name: S.name, ban: S.ban, tries: S.tries, rank: S.rank, writing: t, ts: new Date().toISOString() })
  };
  Object.assign(payload, FocusGuard.payload());
  try {
    await postToSheet(payload);
  } catch (e) {
    $("p1Err").textContent = e.locked ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘.";
    S.sending = false; renderP1Submit();
    return;
  }
  S.sending = false; S.submitted = true;
  if (!S.preview) { // 미리보기는 기본 학번(20512)이라 그 학번 학생의 기기 기록을 지우지 않는다
    if (window.DraftGuard) DraftGuard.clear(); // 저장 성공 → 임시저장 삭제
    clearSave();
  }
  $("t1").readOnly = true;
  renderRank();
  renderP1Submit();
  $("p1Out").textContent = S.preview ? "미리보기라 저장하지 않았어." : "제출했어! 다음 시간에는 지역 하나를 골라 역사 카드를 만들어.";
}

/* ══ 2부: 개혁 캐릭터 카드 ══ */
function choiceRow(text, checked, onPick, cls) {
  const row = el("div", cls || "opt");
  row.setAttribute("role", "radio");
  row.tabIndex = 0;
  row.setAttribute("aria-checked", checked ? "true" : "false");
  if (S.submitted) row.setAttribute("aria-disabled", "true"); // 제출 뒤 잠금이 눈에 보이게
  if (!cls) row.appendChild(el("span", "opt-box"));
  row.appendChild(el("span", "opt-text", text));
  row.addEventListener("click", () => onPick(row));
  row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(row); } });
  return row;
}

function radioGroup(box, options, getVal, setVal, cls) {
  box.innerHTML = "";
  box.setAttribute("role", "radiogroup");
  options.forEach(o => {
    box.appendChild(choiceRow(o.name, getVal() === o.id, row => {
      if (S.submitted) return;
      setVal(o.id); save();
      box.querySelectorAll("[role=radio]").forEach(r => r.setAttribute("aria-checked", r === row ? "true" : "false"));
    }, cls));
  });
}

function renderPicks() {
  radioGroup($("regionPick"), REGIONS, () => S.region, v => {
    if (S.region !== v) S.sym = LOOK[v].syms[0]; // 지역을 바꾸면 상징도 그 지역 것으로
    S.region = v;
    if (S.compare === v) S.compare = "";
    renderSymPick(); renderComparePick(); refreshCounts();
  });
  renderSymPick();
  renderComparePick();
}

function renderSymPick() {
  const box = $("symPick");
  if (!S.region) { box.innerHTML = ""; box.appendChild(el("p", "note", "지역을 먼저 고르면 상징이 나와.")); return; }
  const opts = LOOK[S.region].syms.map(s => ({ id: s, name: s }));
  if (opts.every(o => o.id !== S.sym)) S.sym = opts[0].id;
  radioGroup(box, opts, () => S.sym, v => { S.sym = v; refreshCounts(); }, "sym");
}

function renderComparePick() {
  const opts = REGIONS.filter(r => r.id !== S.region);
  radioGroup($("comparePick"), opts, () => S.compare, v => { S.compare = v; refreshCounts(); });
}

/* 별점: 1~5개. 같은 별을 다시 누르면 그대로(0으로 되돌리지 않는다 — 실수로 지워지지 않게). */
function starRow(box, n, onSet, label, locked) {
  box.innerHTML = "";
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", label + " 별점");
  for (let i = 1; i <= 5; i++) {
    const b = el("button", "star" + (i <= n ? " on" : ""), i <= n ? "★" : "☆");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", i === n ? "true" : "false");
    b.setAttribute("aria-label", label + " 별 " + i + "개");
    b.disabled = !!locked;
    b.addEventListener("click", () => onSet(i));
    box.appendChild(b);
  }
}

function renderStarInputs() {
  STATS.forEach(d => {
    const blk = document.querySelector('.stat-block[data-stat="' + d.id + '"]');
    blk.querySelector(".stat-name").textContent = d.icon + " " + d.name;
    blk.querySelector(".stat-q").textContent = d.q;
    starRow($("star_" + d.id), S.stars[d.id] || 0, i => {
      if (S.submitted) return;
      S.stars[d.id] = i; save(); renderStarInputs(); refreshCounts();
    }, d.name, S.submitted);
  });
}

function regionName(id) { const r = byId(REGIONS, id); return r ? r.name : "(아직 안 고름)"; }

function cardFromForm() {
  const stats = {};
  STATS.forEach(d => { stats[d.id] = { n: S.stars[d.id] || 0, r: val("r_" + d.id), p: val("p_" + d.id) }; });
  return {
    region: S.region, compare: S.compare, sym: S.sym,
    hit: val("hit"), pgHit: val("pgHit"), mvName: val("mvName").replace(/[«»]/g, ""), w1: val("w1"), pg1: val("pg1"), // «»는 카드 글의 구분 기호라 뺀다
    w2: val("w2"), pg2: val("pg2"), stats: stats, w3: val("w3"), pg3: val("pg3"), w4: val("w4")
  };
}

/* 복사 글 = 시트 G열 글: 학번·이름 한 줄 + 카드 글(3부가 이 글을 다시 읽어 카드로 되살린다) */
function bodyText() { return cardText(cardFromForm(), REGIONS, STATS); }
function buildOutText() { return S.sid + " " + S.name + "\n" + bodyText(); }
function counts() { const t = {}; W_IDS.forEach(id => { t[id] = val(id); }); t.mvName = val("mvName"); return charCounts(t); }

function refreshCounts() {
  const n = counts();
  W_IDS.forEach(id => {
    const min = PART2.minChars[id];
    $(id + "c").textContent = n[id] + "자" + (n[id] < min ? " (" + min + "자 이상)" : "");
    $(id + "c").classList.toggle("warn", n[id] > 0 && n[id] < min);
  });
  renderSummary();
}

function renderSummary() {
  renderCard($("cardView"), cardFromForm(), { owner: S.sid + " " + S.name });
  const n = counts().total;
  const short = n < PART2.totalMin;
  $("bodyCount").textContent = "내가 쓴 글 " + n + "자 (지역·쪽수·별 제외)" + (short ? " — " + PART2.totalMin + "자 이상 써 보자." : "");
  $("bodyCount").classList.toggle("warn", short);
  $("submitBtn").disabled = S.submitted || S.sending;
  $("submitBtn").textContent = S.submitted ? "제출 완료" : "제출";
  renderPadlet();
}

function renderPadlet() {
  const a = $("padletBtn");
  if (S.padletUrl) {
    a.href = S.padletUrl; a.hidden = false; $("padletMsg").textContent = "";
  } else {
    a.hidden = true; $("padletMsg").textContent = S.padletLoading ? "우리 반 패들렛 링크를 불러오는 중이야…" : "패들렛 링크는 선생님이 알려 준 곳을 써 줘.";
  }
}

function p2Problem() {
  if (!S.region) return ["regionPick", "카드로 만들 지역을 골라 줘."];
  if (val("hit").length < 5) return ["hit", "«당한 일»을 써 줘."];
  if (!val("mvName")) return ["mvName", "필살기 이름을 붙여 줘."];
  if (val("w1").length < 10) return ["w1", "필살기 설명을 조금 더 써 줘."];
  if (val("w2").length < 5) return ["w2", "«약점»을 써 줘."];
  for (let i = 0; i < STATS.length; i++) {
    const d = STATS[i];
    if (!S.stars[d.id]) return ["star_" + d.id, d.name + "에 별을 매겨 줘."];
    if (val("r_" + d.id).length < 5) return ["r_" + d.id, d.name + "의 근거를 써 줘."];
  }
  if (!S.compare) return ["comparePick", "라이벌 지역을 골라 줘."];
  if (val("w3").length < 10) return ["w3", "라이벌과 견준 내용을 조금 더 써 줘."];
  if (val("w4").length < 10) return ["w4", "«결과를 가른 것»을 조금 더 써 줘."];
  return null;
}

async function submitPart2() {
  if (S.sending || S.submitted) return;
  $("outErr").textContent = "";
  const prob = p2Problem();
  if (prob && !skip()) { $("p2Err").textContent = prob[1]; $(prob[0]).scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  $("p2Err").textContent = "";
  const noPage = PG_IDS.filter(id => !val(id));
  if (noPage.length && !skip() && !confirm("교과서 쪽수가 빠진 칸이 " + noPage.length + "곳 있어. 그래도 제출할까?")) return;
  const total = counts().total;
  if (total < PART2.totalMin && !skip() && !confirm("아직 " + total + "자야. " + PART2.totalMin + "자보다 짧은데 그래도 제출할까?")) return;
  S.sending = true; $("submitBtn").disabled = true; $("submitBtn").textContent = "보내는 중…";
  const card = cardFromForm();
  const payload = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: regionName(S.region) + " / 라이벌: " + regionName(S.compare) + " / HP " + hp(card.stats),
    diffSummary: "",
    reflection: bodyText(), // 시트 G열: 카드 글 전체(쪽수 포함). 3부가 이 글로 카드를 되살린다.
    choicesJson: JSON.stringify(Object.assign({ sid: S.sid, name: S.name, ban: S.ban, writing: bodyText(), ts: new Date().toISOString() }, card))
  };
  Object.assign(payload, FocusGuard.payload());
  try {
    await postToSheet(payload);
  } catch (e) {
    $("outErr").textContent = e.locked ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘.";
    S.sending = false; renderSummary();
    return;
  }
  S.sending = false; S.submitted = true;
  if (!S.preview) {
    if (window.DraftGuard) DraftGuard.clear(); // 저장 성공 → 임시저장 삭제
    clearSave();
  }
  lockPart2();
  $("outMsg").textContent = S.preview ? "미리보기라 저장하지 않았어." : "제출했어! 이제 카드 그림을 저장하고 글을 복사해서 패들렛에 올려 줘.";
}

function lockPart2() {
  W_IDS.concat(PG_IDS, ["mvName"]).forEach(id => { $(id).readOnly = true; }); // 제출 뒤 수정 잠금
  renderPicks();
  renderStarInputs();
  renderSummary();
}

/* 제출 뒤 새로고침해도 그림 저장·글 복사를 할 수 있게, 이미 낸 카드가 있으면 포털 기록에서 되살려 잠근다.
 * (기기에는 남기지 않는다 — 공용 태블릿에서 다음 학생에게 앞 학생 글이 보이지 않게) */
async function restoreSubmitted() {
  if (S.preview) return;
  try {
    const url = CONFIG.SHEET_WEBAPP_URL + "?mode=student&studentId=" + encodeURIComponent(S.sid) + "&name=" + encodeURIComponent(S.name);
    const json = await (await fetch(url)).json();
    const acts = (json.activities || []).filter(a => a.activityId === CONFIG.GAME_NAMES[2] && a.reflection);
    const c = acts.length ? parseCardText(acts[acts.length - 1].reflection, REGIONS, STATS) : null;
    if (!c || S.submitted || S.sending) return;
    S.region = c.region; S.compare = c.compare; S.sym = c.sym;
    const put = (id, v) => { $(id).value = v || ""; };
    put("hit", c.hit); put("pgHit", c.pgHit); put("mvName", c.mvName); put("w1", c.w1); put("pg1", c.pg1);
    put("w2", c.w2); put("pg2", c.pg2); put("w3", c.w3); put("pg3", c.pg3); put("w4", c.w4);
    STATS.forEach(d => { const s = c.stats[d.id] || {}; S.stars[d.id] = s.n || 0; put("r_" + d.id, s.r); put("p_" + d.id, s.p); });
    S.submitted = true;
    if (window.DraftGuard) DraftGuard.clear();
    clearSave();
    lockPart2();
    refreshCounts();
    $("outMsg").textContent = "이미 제출한 카드야. 카드 그림 저장과 글 복사는 할 수 있어.";
  } catch (e) { /* 못 불러오면 그냥 새로 쓰는 화면 */ }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = el("textarea");
    ta.value = text; ta.setAttribute("data-no-draft", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}

async function copyOut() {
  if (p2Problem() && !skip()) { $("p2Err").textContent = "카드 칸을 다 채운 다음 복사해 줘."; return; }
  const ok = await copyText(buildOutText());
  if (!ok) { $("outMsg").textContent = "복사가 안 됐어. 한 번 더 눌러 줘."; return; }
  S.copied = true;
  $("outMsg").textContent = S.submitted ? "복사했어. 패들렛에 카드 그림과 함께 붙여넣기 해." : "복사했어. 제출 버튼도 꼭 눌러 줘!";
}

/* ══ 카드 모양(화면용 DOM) ══ 2부 미리보기와 3부 내 카드에 같이 쓴다. opts.edit이면 별을 눌러 고칠 수 있다. */
function starText(n) { return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); }
function withPageView(t, p) { t = oneLine(t); const q = cleanPage(p); return t ? t + (q ? " (" + q + "쪽)" : "") : ""; }

function renderCard(box, c, opts) {
  opts = opts || {};
  box.innerHTML = "";
  const look = LOOK[c.region] || { c1: "#6d6f86", c2: "#e1e2ea", syms: ["❔"] };
  const card = el("div", "hcard");
  card.style.setProperty("--c1", look.c1);
  card.style.setProperty("--c2", look.c2);
  const statsNow = {};
  STATS.forEach(d => { statsNow[d.id] = Object.assign({}, c.stats[d.id], opts.edits && opts.edits[d.id] != null ? { n: opts.edits[d.id] } : {}); });

  const top = el("div", "hc-top");
  const nm = el("div", "hc-name");
  nm.appendChild(el("small", "", "개혁 카드"));
  nm.appendChild(el("b", "", c.region ? regionName(c.region) : "지역을 골라 줘"));
  top.appendChild(nm);
  const hpBox = el("div", "hc-hp");
  hpBox.appendChild(el("small", "", "HP"));
  hpBox.appendChild(el("b", "", String(hp(statsNow))));
  top.appendChild(hpBox);
  card.appendChild(top);

  const art = el("div", "hc-art");
  art.appendChild(el("span", "hc-sym", c.sym || look.syms[0]));
  card.appendChild(art);
  card.appendChild(el("p", "hc-hit", "당한 일 — " + (withPageView(c.hit, c.pgHit) || "…")));

  const mv = el("div", "hc-move");
  const mh = el("div", "hc-move-head");
  mh.appendChild(el("span", "hc-badge", "필살기"));
  mh.appendChild(el("b", "", c.mvName || "…"));
  mv.appendChild(mh);
  mv.appendChild(el("p", "", withPageView(c.w1, c.pg1) || "…"));
  card.appendChild(mv);

  const st = el("div", "hc-stats");
  STATS.forEach(d => {
    const s = statsNow[d.id] || {};
    const row = el("div", "hc-stat");
    const head = el("div", "hc-stat-head");
    head.appendChild(el("b", "", d.icon + " " + d.name));
    if (opts.edit) {
      const sb = el("div", "stars small");
      starRow(sb, s.n || 0, i => opts.edit(d.id, i), d.name);
      head.appendChild(sb);
    } else {
      head.appendChild(el("span", "hc-stars", starText(s.n || 0)));
    }
    if (opts.edits && opts.edits[d.id] != null && opts.edits[d.id] !== (c.stats[d.id] || {}).n) head.appendChild(el("span", "hc-fixed", "고침"));
    row.appendChild(head);
    row.appendChild(el("p", "", withPageView(s.r, s.p) || "…"));
    st.appendChild(row);
  });
  card.appendChild(st);

  const foot = el("div", "hc-foot");
  const wk = el("div", "");
  wk.appendChild(el("b", "", "약점"));
  wk.appendChild(el("p", "", withPageView(c.w2, c.pg2) || "…"));
  foot.appendChild(wk);
  const rv = el("div", "");
  rv.appendChild(el("b", "", "라이벌 " + (c.compare ? regionName(c.compare) : "")));
  rv.appendChild(el("p", "", withPageView(c.w3, c.pg3) || "…"));
  foot.appendChild(rv);
  card.appendChild(foot);

  card.appendChild(el("p", "hc-flavor", "결과를 가른 것 — " + (c.w4 || "…")));
  card.appendChild(el("p", "hc-owner", "주제35~39 국민 국가 건설" + (opts.owner ? " · " + opts.owner : "")));
  box.appendChild(card);
}

/* ══ 카드 그림 저장(캔버스) ══ 패들렛에 올릴 PNG. 화면 카드와 같은 배치, 긴 글은 줄 수를 넘으면 «…»로 자른다(글 전체는 복사 글에 있다). */
const FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';

function wrapLines(ctx, text, maxW, maxLines) {
  const out = [];
  let line = "";
  const chars = Array.from(String(text || ""));
  let cut = false;
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = chars[i] === " " ? "" : chars[i];
      if (out.length === maxLines) { cut = true; break; }
    } else line = test;
  }
  if (!cut && line) out.push(line);
  if (cut && out.length) {
    let last = out[out.length - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    out[out.length - 1] = last + "…";
  }
  return out;
}

function drawText(ctx, text, x, y, maxW, lineH, maxLines) {
  wrapLines(ctx, text, maxW, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawCard(c, owner) {
  const W = 750, H = 1050;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const look = LOOK[c.region] || { c1: "#6d6f86", c2: "#e1e2ea", syms: ["❔"] };
  roundRect(ctx, 0, 0, W, H, 36); ctx.fillStyle = look.c1; ctx.fill();
  roundRect(ctx, 22, 22, W - 44, H - 44, 22);
  const g = ctx.createLinearGradient(0, 22, 0, H);
  g.addColorStop(0, look.c2); g.addColorStop(1, "#ffffff");
  ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = "#1f1f2e"; ctx.textBaseline = "alphabetic";
  ctx.font = "700 20px " + FONT; ctx.fillText("개혁 카드", 52, 64);
  ctx.font = "900 44px " + FONT; ctx.fillText(regionName(c.region), 52, 108);
  const total = hp(c.stats);
  ctx.textAlign = "right";
  ctx.font = "900 52px " + FONT; ctx.fillStyle = "#b0302a"; ctx.fillText(String(total), 698, 108);
  const hpW = ctx.measureText(String(total)).width;
  ctx.font = "700 22px " + FONT; ctx.fillText("HP", 690 - hpW, 106);
  ctx.textAlign = "left"; ctx.fillStyle = "#1f1f2e";
  // 그림 칸
  roundRect(ctx, 52, 124, 646, 300, 10);
  const ag = ctx.createRadialGradient(375, 274, 20, 375, 274, 340);
  ag.addColorStop(0, "#ffffff"); ag.addColorStop(1, look.c2);
  ctx.fillStyle = ag; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = "#c9a43a"; ctx.stroke();
  ctx.textAlign = "center"; ctx.fillStyle = "#1f1f2e"; ctx.font = "170px " + FONT;
  ctx.fillText(c.sym || look.syms[0], 375, 335);
  ctx.textAlign = "left";
  // 당한 일 띠
  roundRect(ctx, 64, 436, 622, 66, 8); ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fill();
  ctx.fillStyle = "#3a3b52"; ctx.font = "italic 18px " + FONT;
  drawText(ctx, "당한 일 — " + withPageView(c.hit, c.pgHit), 78, 463, 594, 26, 2);
  // 필살기
  ctx.fillStyle = look.c1; roundRect(ctx, 52, 520, 92, 34, 17); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "700 18px " + FONT; ctx.fillText("필살기", 69, 543);
  ctx.fillStyle = "#1f1f2e"; ctx.font = "900 30px " + FONT; drawText(ctx, c.mvName, 158, 547, 540, 34, 1);
  ctx.font = "20px " + FONT; drawText(ctx, withPageView(c.w1, c.pg1), 56, 588, 640, 28, 3);
  // 능력치
  ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(52, 676); ctx.lineTo(698, 676); ctx.stroke();
  STATS.forEach((d, i) => {
    const s = c.stats[d.id] || {};
    const y = 710 + i * 58;
    ctx.fillStyle = "#1f1f2e"; ctx.font = "700 23px " + FONT; ctx.fillText(d.icon + " " + d.name, 56, y);
    ctx.textAlign = "right"; ctx.fillStyle = "#c9871a"; ctx.font = "28px " + FONT; ctx.fillText(starText(s.n || 0), 698, y + 2);
    ctx.textAlign = "left"; ctx.fillStyle = "#4a4b60"; ctx.font = "17px " + FONT;
    drawText(ctx, withPageView(s.r, s.p), 92, y + 25, 604, 22, 1);
  });
  ctx.beginPath(); ctx.moveTo(52, 872); ctx.lineTo(698, 872); ctx.stroke();
  // 약점·라이벌
  [["약점", withPageView(c.w2, c.pg2), 56], ["라이벌 " + regionName(c.compare), withPageView(c.w3, c.pg3), 386]].forEach(([h, t, x]) => {
    ctx.fillStyle = "#1f1f2e"; ctx.font = "700 18px " + FONT; ctx.fillText(h, x, 898);
    ctx.fillStyle = "#4a4b60"; ctx.font = "15px " + FONT; drawText(ctx, t, x, 920, 306, 20, 2);
  });
  // 결과를 가른 것(카드 아래 설명 자리)
  roundRect(ctx, 52, 952, 646, 50, 6); ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fill();
  ctx.fillStyle = "#3a3b52"; ctx.font = "italic 15px " + FONT;
  drawText(ctx, "결과를 가른 것 — " + oneLine(c.w4), 64, 972, 622, 20, 2);
  ctx.fillStyle = "#ffffff"; ctx.font = "500 15px " + FONT;
  ctx.fillText("주제35~39 국민 국가 건설 · " + owner, 40, 1040);
  return cv;
}

async function saveCardImage() {
  if (!S.region && !skip()) { $("p2Err").textContent = "지역을 고른 다음 저장해 줘."; return; }
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* 글꼴이 늦으면 기본 글꼴로 */ }
  const cv = drawCard(cardFromForm(), S.sid + " " + S.name);
  const url = cv.toDataURL("image/png");
  $("savedImg").src = url;
  $("savedBox").hidden = false;
  const a = el("a");
  a.href = url; a.download = "역사카드_" + S.sid + ".png";
  document.body.appendChild(a); a.click(); a.remove();
  $("outMsg").textContent = "카드 그림을 저장했어. 패들렛에 그림을 올리고 복사한 글도 붙여 줘.";
}

/* ══ 3부: 내 카드로 모둠 대결 ══ 2부에 낸 카드 글을 포털 기록(mode=student)에서 찾아 되살린다. */
async function loadMyCard() {
  $("p3Msg").textContent = PART3.loadingMsg;
  if (S.preview) { // 미리보기: 학생 기록을 읽지 않고 빈 모양만 보여 준다(예시 답안을 띄우지 않는다)
    S.card3 = { region: "thai", compare: "", sym: LOOK.thai.syms[0], mvName: "(학생이 붙인 이름)", stats: { lead: { n: 3 }, guard: { n: 3 }, unity: { n: 3 } } };
    $("p3Msg").textContent = "미리보기: 학생이 2차시에 낸 카드가 여기 나와.";
    renderCard3();
    return;
  }
  try {
    const url = CONFIG.SHEET_WEBAPP_URL + "?mode=student&studentId=" + encodeURIComponent(S.sid) + "&name=" + encodeURIComponent(S.name);
    const json = await (await fetch(url)).json();
    if (json.result && json.result !== "success") { $("p3Msg").textContent = (json.message ? json.message + " " : "") + PART3.notFound; return; }
    const acts = (json.activities || []).filter(a => a.activityId === CONFIG.GAME_NAMES[2] && a.reflection);
    const last = acts[acts.length - 1];
    const card = last ? parseCardText(last.reflection, REGIONS, STATS) : null;
    if (!card) { $("p3Msg").textContent = PART3.notFound; return; }
    S.card3 = card;
    $("p3Msg").textContent = "";
    renderCard3();
  } catch (e) {
    $("p3Msg").textContent = "기록을 불러오지 못했어. 인터넷을 확인하고 새로고침해 봐. " + PART3.notFound;
  }
}

function renderCard3() {
  if (!S.card3) return;
  renderCard($("cardView3"), S.card3, {
    owner: S.sid + " " + S.name, edits: S.edits,
    // 이의 제기로 «내리기»만 한다. 2차시에 낸 별보다 크게는 못 올린다.
    edit: S.submitted ? null : (id, n) => {
      const orig = (S.card3.stats[id] || {}).n || 0;
      if (n > orig) { toast("별은 2차시에 낸 개수(" + orig + "개)보다 올릴 수 없어."); return; }
      S.edits[id] = n; save(); renderCard3();
    }
  });
}

function renderScore() {
  const box = $("scoreBoard");
  box.innerHTML = "";
  [["w", "승"], ["d", "무"], ["l", "패"]].forEach(([k, label]) => {
    const cell = el("div", "score-cell");
    cell.appendChild(el("b", "", label));
    const minus = el("button", "btn btn-ghost btn-sm", "−");
    minus.type = "button"; minus.setAttribute("aria-label", label + " 하나 빼기");
    minus.disabled = S.submitted || !S.score[k];
    minus.addEventListener("click", () => { S.score[k] = Math.max(0, S.score[k] - 1); save(); renderScore(); });
    const plus = el("button", "btn btn-ghost btn-sm", "+");
    plus.type = "button"; plus.setAttribute("aria-label", label + " 하나 더하기");
    plus.disabled = S.submitted;
    plus.addEventListener("click", () => { S.score[k]++; save(); renderScore(); });
    const row = el("div", "score-row");
    row.appendChild(minus);
    row.appendChild(el("span", "score-n", String(S.score[k])));
    row.appendChild(plus);
    cell.appendChild(row);
    box.appendChild(cell);
  });
}

async function submitPart3() {
  if (S.sending || S.submitted) return;
  const t = val("t3");
  if (t.length < 5 && !skip()) { $("p3Err").textContent = "지금 내 답을 한두 문장 써 줘."; return; }
  if (t.length < PART3.finalMin && !skip() && !confirm("아직 " + t.length + "자야. 그래도 제출할까?")) return;
  $("p3Err").textContent = "";
  S.sending = true; $("p3Submit").disabled = true; $("p3Submit").textContent = "보내는 중…";
  const sc = S.score;
  const payload = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: (S.card3 ? regionName(S.card3.region) + " 카드 · " : "") + "승 " + sc.w + " · 무 " + sc.d + " · 패 " + sc.l,
    diffSummary: "",
    reflection: t, // 시트 G열: 처음 질문에 대한 마지막 답
    choicesJson: JSON.stringify({ sid: S.sid, name: S.name, ban: S.ban, region: S.card3 ? S.card3.region : "", score: sc, edits: S.edits, writing: t, ts: new Date().toISOString() })
  };
  Object.assign(payload, FocusGuard.payload());
  try {
    await postToSheet(payload);
  } catch (e) {
    $("p3Err").textContent = e.locked ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘.";
    S.sending = false; $("p3Submit").disabled = false; $("p3Submit").textContent = PART3.submitBtn;
    return;
  }
  S.sending = false; S.submitted = true;
  if (!S.preview) {
    if (window.DraftGuard) DraftGuard.clear();
    clearSave();
  }
  $("t3").readOnly = true;
  $("p3Submit").textContent = "제출 완료";
  renderScore(); renderCard3();
  $("p3Out").textContent = S.preview ? "미리보기라 저장하지 않았어." : "제출했어! 수고했어.";
}

/* ── 부팅 (모든 함수 선언 뒤, 파일 맨 마지막) ── */
function init() {
  const q = new URLSearchParams(location.search);
  S.part = q.get("part") === "2" ? 2 : q.get("part") === "3" ? 3 : 1;
  CONFIG.GAME_NAME = CONFIG.GAME_NAMES[S.part];
  if (S.part !== 2) document.body.classList.add("wide"); // 분류판·대결 화면은 넓은 화면에서 펼친다
  S.preview = q.get("preview") === "1";
  let sid = (q.get("sid") || "").trim(), name = (q.get("name") || "").trim();
  if (S.preview) {
    $("previewBar").textContent = "미리보기 모드 — 저장되지 않아 · 활동을 다 안 해도 넘어갈 수 있어";
    $("previewBar").hidden = false;
    if (!sid) sid = "20512";
    if (!name) name = "미리보기";
  }
  $("sid").value = sid; $("sname").value = name;

  $("appTitle").textContent = INTRO.title;
  $("eyebrow").textContent += [" · 1차시 단서 카드", " · 2차시 역사 카드 만들기", " · 3차시 카드 대결"][S.part - 1];
  $("introQ").textContent = INTRO.question;
  $("introLead").textContent = [INTRO.part1Lead, INTRO.part2Lead, INTRO.part3Lead][S.part - 1];

  $("boardQ").textContent = PART1.boardQ;
  $("boardHow").textContent = PART1.how;
  $("boardHint").textContent = PART1.hint;
  COLS.forEach((c, i) => { $("col" + i).textContent = c.name; });
  $("trapName").textContent = PART1.trapName;
  $("trapDesc").textContent = PART1.trapDesc;
  $("boardCheck").textContent = PART1.checkBtn;
  $("doneTitle").textContent = PART1.doneTitle;
  $("doneLead").textContent = PART1.doneLead;
  $("rankTitle").textContent = PART1.rankTitle;
  $("rankQ").textContent = PART1.rankQ;
  $("rankHow").textContent = PART1.rankHow;
  $("thinkQ").textContent = PART1.thinkQ;
  $("thinkHint").textContent = PART1.thinkHint;

  $("refTitle").textContent = PART2.refTitle;
  $("refNote").textContent = PART2.refNote;
  renderSumList($("refList"));
  ["regionQ", "symQ", "hitQ", "hitHint", "mvQ", "mvHint", "weakQ", "weakHint", "statQ", "statHint", "rivalQ", "rivalHint", "keyQ", "keyHint", "must"]
    .forEach(k => { $(k).textContent = PART2[k]; });
  $("mvName").placeholder = PART2.mvNamePh;
  $("wrapGuide").textContent = PART2.guide;
  $("saveBtn").textContent = PART2.saveBtn;
  $("copyBtn").textContent = PART2.copyBtn;
  $("padletBtn").textContent = PART2.padletBtn;

  $("myCardTitle").textContent = PART3.myCardTitle;
  $("editNote").textContent = PART3.editNote;
  $("rulesTitle").textContent = PART3.rulesTitle;
  PART3.rules.forEach(r => $("rulesList").appendChild(el("li", "", r)));
  $("scoreTitle").textContent = PART3.scoreTitle;
  $("finalTitle").textContent = PART3.finalTitle;
  $("finalQ").textContent = PART3.finalQ;
  $("finalHint").textContent = PART3.finalHint;
  $("p3Submit").textContent = PART3.submitBtn;

  $("startBtn").addEventListener("click", startApp);
  $("deckPrev").addEventListener("click", () => stepDeck(-1));
  $("deckNext").addEventListener("click", () => stepDeck(1));
  $("deckCard").addEventListener("pointerdown", dragStart);
  $("board").addEventListener("click", boardClick);
  $("trapSlot").addEventListener("click", boardClick);
  [$("board"), $("trapSlot")].forEach(b => b.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); boardClick(e);
  }));
  $("boardCheck").addEventListener("click", checkBoardNow);
  $("boardSkip").addEventListener("click", () => { showDone1(); $("p1Done").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("t1").addEventListener("input", () => { $("t1c").textContent = val("t1").length + "자"; $("p1Err").textContent = ""; });
  $("p1Submit").addEventListener("click", submitPart1);
  W_IDS.concat(PG_IDS, ["mvName"]).forEach(id => $(id).addEventListener("input", () => { $("p2Err").textContent = ""; refreshCounts(); }));
  $("copyBtn").addEventListener("click", copyOut);
  $("saveBtn").addEventListener("click", saveCardImage);
  $("submitBtn").addEventListener("click", submitPart2);
  $("t3").addEventListener("input", () => { $("t3c").textContent = val("t3").length + "자"; $("p3Err").textContent = ""; });
  $("p3Submit").addEventListener("click", submitPart3);
  Glossary.start({ terms: GLOSSARY, unique: true, skip: [".eyebrow", "h1", ".sum-list b", ".rname", ".opt", ".sym", ".cell", ".trap", ".ghost", ".deck-nav", ".board-cols", ".toast", ".hcard", ".rank-list", ".stars", ".score-board"] }); // 어려운 낱말 풀이 (glossary.js). 칸 안은 누르기와 겹쳐 밑줄을 긋지 않는다
}

init();
