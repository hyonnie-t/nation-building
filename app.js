/* 주제35~39 「국민 국가 건설, 결과는 왜 달랐을까?」 — 화면·진행(app.js)
 * 판정·카드 글 변환은 logic.js(순수 함수), 문구·카드는 data.js.
 * ?part=1(기본): 1차시 단서 카드 분류판 + 순위 / ?part=2: 2차시 개혁 캐릭터 카드(수행평가) / ?part=3: 3차시 모둠 열강 보스 레이드(정리)
 * / ?part=3&final=1: 전자칠판 최종 보스전(교사 화면, 저장 없음).
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
  region: "", compare: "", sym: "", stars: { lead: 0, guard: 0, unity: 0 }, reasonStat: "",
  final: false, members: [], raid: null, msgs: [], modalOpen: false, basicFor: null, basicRegion: "", who3: "", doneSids: [], raidDone: false,
  copied: false, sending: false, submitted: false, padletUrl: "", padletLoading: false
};
const SAVE_KEYS = { 1: ["placed", "cur", "tries", "done1", "rank"], 2: ["region", "compare", "sym", "stars", "reasonStat"], 3: [] };
const W_IDS = ["hit", "w1", "w2", "r_top", "w3", "w4"];
const PG_IDS = ["pgHit", "pg1", "pg2", "p_top", "pg3"];

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
    if (!S.stars || typeof S.stars !== "object" || starSum(S.stars) > RAID.starTotal) S.stars = { lead: 0, guard: 0, unity: 0 };
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
    show("p3");
    loadFirstMember();
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

/* 별은 모두 9개(능력치마다 1~5). 9개를 넘기는 별은 누를 수 없고, 덜 쓴 채 제출하면 확인 창에서 한 번 묻는다. */
function renderStarInputs() {
  STATS.forEach(d => {
    const blk = document.querySelector('.stat-block[data-stat="' + d.id + '"]');
    blk.querySelector(".stat-name").textContent = d.icon + " " + d.name;
    starRow($("star_" + d.id), S.stars[d.id] || 0, i => {
      if (S.submitted) return;
      if (!canSetStar(S.stars, d.id, i)) { toast(PART2.overMsg); return; }
      S.stars[d.id] = i; save(); renderStarInputs(); refreshCounts();
    }, d.name, S.submitted);
  });
  const left = starsLeft(S.stars);
  $("starsLeft").textContent = PART2.leftMsg(left);
  $("starsLeft").classList.toggle("done", left === 0);
  renderReasonPick();
}

/* 근거는 별을 가장 많이 준 능력치 하나에만. 동점이면 학생이 고른다. */
function reasonStat() {
  const tops = topStats(S.stars);
  if (tops.length === 1) return tops[0];
  return tops.indexOf(S.reasonStat) >= 0 ? S.reasonStat : "";
}

function renderReasonPick() {
  const tops = topStats(S.stars);
  const box = $("reasonPick");
  box.hidden = tops.length < 2;
  if (tops.length >= 2) {
    radioGroup(box, STATS.filter(d => tops.indexOf(d.id) >= 0).map(d => ({ id: d.id, name: d.icon + " " + d.name })),
      () => S.reasonStat, v => { S.reasonStat = v; $("reasonQ").textContent = reasonLabel(); refreshCounts(); });
  }
  $("reasonQ").textContent = reasonLabel();
}

function reasonLabel() {
  const tops = topStats(S.stars);
  if (!tops.length) return PART2.reasonWait;
  const rs = reasonStat();
  return rs ? PART2.reasonQ(byId(STATS, rs).name) : PART2.reasonTie;
}

function regionName(id) { const r = byId(REGIONS, id); return r ? r.name : "(아직 안 고름)"; }

function cardFromForm() {
  const stats = {};
  const rs = reasonStat();
  STATS.forEach(d => { stats[d.id] = { n: S.stars[d.id] || 0, r: d.id === rs ? val("r_top") : "", p: d.id === rs ? val("p_top") : "" }; });
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
    if (!S.stars[d.id]) return ["star_" + d.id, d.name + "에 별을 1개 이상 줘."];
  }
  if (!reasonStat()) return ["reasonPick", "근거를 쓸 능력치를 하나 골라 줘."];
  if (val("r_top").length < 5) return ["r_top", "별을 가장 많이 준 능력치의 근거를 써 줘."];
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
  const used = starSum(S.stars);
  if (used !== RAID.starTotal && !skip() && !confirm(PART2.nineConfirm(used))) return;
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
    STATS.forEach(d => { const s = c.stats[d.id] || {}; S.stars[d.id] = s.n || 0; if (s.r) { S.reasonStat = d.id; put("r_top", s.r); put("p_top", s.p); } });
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
  if (c.region) art.appendChild(spriteEl(c.region, { sym: c.sym || look.syms[0], cls: "hc-sprite" }));
  else art.appendChild(el("span", "hc-sym", "❔"));
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
    row.appendChild(head);
    const why = withPageView(s.r, s.p);
    if (why) row.appendChild(el("p", "", why));
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
  if (c.region) {
    ctx.imageSmoothingEnabled = false;
    paintSprite(ctx, c.region, 375 - 112, 192, 224);
    ctx.textAlign = "center"; ctx.font = "64px " + FONT;
    ctx.fillText(c.sym || look.syms[0], 520, 214); // 머리 위 오른쪽에 상징
  } else {
    ctx.textAlign = "center"; ctx.fillStyle = "#1f1f2e"; ctx.font = "170px " + FONT;
    ctx.fillText("❔", 375, 335);
  }
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

/* ══ 도트 캐릭터 그리기 ══ img/<id>.png가 있으면 그 그림, 없으면 data.js 격자. 2부 카드 그림(PNG)과 3부 화면이 같이 쓴다. */
const SPRITE_IMG = {};
function preloadSpriteImages() {
  SPRITE_FILES.forEach(id => { // 파일을 넣은 그림만 부른다(없는 파일을 찾느라 404가 나지 않게)
    const im = new Image();
    im.onload = () => { SPRITE_IMG[id] = im; };
    im.src = "img/" + id + ".png";
  });
}

function paintSprite(ctx, id, x, y, size, foe) {
  const img = !foe && SPRITE_IMG[id];
  if (img) { ctx.drawImage(img, x, y, size, size); return; }
  const rows = spriteRows(id);
  if (!rows) return;
  const pal = spritePal(id, foe);
  const c = size / 16;
  rows.forEach((row, j) => Array.from(row).forEach((ch, i) => {
    if (ch === "." || !pal[ch]) return;
    ctx.fillStyle = pal[ch];
    ctx.fillRect(Math.floor(x + i * c), Math.floor(y + j * c), Math.ceil(c), Math.ceil(c));
  }));
}

/* 화면용: 96px 캔버스를 CSS로 키운다(image-rendering: pixelated). sym이 있으면 머리 위에 띄운다. */
function spriteEl(id, opts) {
  opts = opts || {};
  const wrap = el("div", "sprite" + (opts.foe ? " foe" : "") + (opts.cls ? " " + opts.cls : ""));
  const cv = document.createElement("canvas");
  cv.width = 96; cv.height = 96;
  cv.setAttribute("aria-hidden", "true");
  paintSprite(cv.getContext("2d"), id, 0, 0, 96, opts.foe);
  wrap.appendChild(cv);
  if (opts.sym) wrap.appendChild(el("span", "sprite-sym", opts.sym));
  return wrap;
}

/* ══ 3부: 열강 보스 레이드 ══ 카드는 포털 기록(mode=student)의 2차시 G열 글에서 되살린다.
 * 친구 카드: 이 기기에 로그인한 학생과 학번이 다르면 서버가 막으므로, 그 친구가 자기 비밀번호를 넣으면 그 자리에서 로그인해 세션을 받는다.
 * 받은 세션은 메모리에만 두고(기기에 남기지 않는다) 그 친구의 카드 읽기·마무리 제출에만 쓴다. */
const MAX_MEMBERS = () => S.final ? 8 : 4;
const PREVIEW_REGIONS = ["ottoman", "thai", "japan", "joseon"];

function regionShort(m) { return regionName(m.region); }
function memberLabel(m) { return regionShort(m) + (m.name ? " (" + m.name + ")" : ""); }

async function fetchCard(sid, name, session) {
  let url = CONFIG.SHEET_WEBAPP_URL + "?mode=student&studentId=" + encodeURIComponent(sid) + "&name=" + encodeURIComponent(name);
  if (session) url += "&session=" + encodeURIComponent(session);
  const json = await (await fetch(url)).json();
  if (json.result && json.result !== "success") { const e = new Error(json.message || "불러오기 실패"); e.needLogin = !!json.needLogin; throw e; }
  const acts = (json.activities || []).filter(a => a.activityId === CONFIG.GAME_NAMES[2] && a.reflection);
  const last = acts[acts.length - 1];
  return last ? parseCardText(last.reflection, REGIONS, STATS) : null;
}

async function loginFor(sid, name, pw) {
  const res = await fetch(CONFIG.SHEET_WEBAPP_URL, { method: "POST", body: JSON.stringify({ action: "login", studentId: sid, name: name, password: pw }) });
  const json = await res.json();
  if (json.result !== "success") throw new Error(json.message || "로그인이 안 됐어.");
  if (json.mustChange) throw new Error("아직 처음 비밀번호야. 포털에서 비밀번호를 먼저 바꿔 줘.");
  return json.session;
}

function addMember(m) {
  if (S.members.some(x => x.sid && x.sid === m.sid)) { $("mErr").textContent = "이미 불러온 학번이야."; return false; }
  S.members.push(m);
  renderMembers();
  return true;
}

function renderMembers() {
  const ol = $("memberList");
  ol.innerHTML = "";
  S.members.forEach((m, i) => {
    const li = el("li", "member");
    li.appendChild(spriteEl(m.card.region, { sym: m.card.sym }));
    const info = el("div", "member-info");
    info.appendChild(el("b", "", regionName(m.card.region)));
    info.appendChild(el("span", "", (m.sid ? m.sid + " " : "") + m.name + (m.basic ? " · 기본 카드" : "")));
    li.appendChild(info);
    const rm = el("button", "btn btn-ghost btn-sm", "빼기");
    rm.type = "button"; rm.setAttribute("aria-label", m.name + " 빼기");
    rm.addEventListener("click", () => { S.members.splice(i, 1); renderMembers(); });
    li.appendChild(rm);
    ol.appendChild(li);
  });
  const full = S.members.length >= MAX_MEMBERS();
  $("addBox").hidden = full || S.preview;
  $("raidStart").disabled = S.members.length < 2;
  renderWho3();
}

async function loadMember() {
  const sid = val("mSid"), name = val("mName"), pw = $("mPw").value.trim();
  $("mErr").textContent = ""; $("basicBox").hidden = true;
  if (!parseSid(sid)) { $("mErr").textContent = "학번은 숫자 5자리로 써 줘."; return; }
  if (!name) { $("mErr").textContent = "이름을 써 줘."; return; }
  if (S.members.some(x => x.sid === sid)) { $("mErr").textContent = "이미 불러온 학번이야."; return; }
  $("mLoad").disabled = true; $("mLoad").textContent = "불러오는 중…";
  let session = "", card = null;
  try {
    if (pw) session = await loginFor(sid, name, pw);
    card = await fetchCard(sid, name, session);
  } catch (e) {
    $("mErr").textContent = e.needLogin && !pw ? "비밀번호를 넣고 다시 눌러 줘." : (e.message || "불러오지 못했어.");
    $("mLoad").disabled = false; $("mLoad").textContent = "카드 불러오기";
    $("mPw").value = "";
    showBasic(sid, name, session);
    return;
  }
  $("mLoad").disabled = false; $("mLoad").textContent = "카드 불러오기";
  $("mPw").value = "";
  if (!card) { $("mErr").textContent = PART3.notFound; showBasic(sid, name, session); return; }
  if (addMember({ sid, name, card, basic: false, session })) { $("mSid").value = ""; $("mName").value = ""; }
}

/* 못 찾은 학생은 지역만 골라 기본 카드(별 3·3·3, «함께 버티기»)로 */
function showBasic(sid, name, session) {
  S.basicFor = { sid, name, session };
  S.basicRegion = "";
  $("basicBox").hidden = false;
  radioGroup($("basicPick"), REGIONS, () => S.basicRegion, v => { S.basicRegion = v; });
}

function joinBasic() {
  const b = S.basicFor;
  if (!b) return;
  if (!S.basicRegion) { $("mErr").textContent = "기본 카드 지역을 골라 줘."; return; }
  const card = { region: S.basicRegion, sym: LOOK[S.basicRegion].syms[0], stats: { lead: { n: 3 }, guard: { n: 3 }, unity: { n: 3 } } };
  if (addMember({ sid: b.sid, name: b.name, card, basic: true, session: b.session })) {
    $("basicBox").hidden = true; $("mErr").textContent = ""; $("mSid").value = ""; $("mName").value = ""; $("mPw").value = "";
  }
}

/* 포털에서 연 첫 학생은 자동으로(이 기기 세션) */
async function loadFirstMember() {
  if (S.preview) {
    PREVIEW_REGIONS.forEach((r, i) => S.members.push({ sid: "2051" + (i + 1), name: "미리보기 " + (i + 1), basic: true, session: "",
      card: { region: r, sym: LOOK[r].syms[0], mvName: "(학생이 붙인 이름)", stats: { lead: { n: 3 }, guard: { n: 3 }, unity: { n: 3 } } } }));
    $("p3Msg").textContent = "미리보기: 학생 기록을 읽지 않고 빈 모양 카드 4장으로 시작해.";
    renderMembers();
    return;
  }
  if (S.final || !S.sid) { renderMembers(); return; }
  $("p3Msg").textContent = PART3.loadingMsg;
  try {
    const card = await fetchCard(S.sid, S.name, "");
    if (card) { addMember({ sid: S.sid, name: S.name, card, basic: false, session: "" }); $("p3Msg").textContent = ""; return; }
    $("p3Msg").textContent = PART3.notFound;
  } catch (e) {
    $("p3Msg").textContent = (e.message ? e.message + " " : "") + PART3.notFound;
  }
  $("mSid").value = S.sid; $("mName").value = S.name;
  showBasic(S.sid, S.name, "");
  renderMembers();
}

/* ── 전투 ── 사건(ev) → 한 줄 메시지 큐. 메시지를 누르면 다음 줄, 큐가 비면 기술 버튼이 나온다. */
function startRaid() {
  if (S.members.length < 2) { $("setupErr").textContent = PART3.needTwo; return; }
  $("setupErr").textContent = "";
  const ms = S.members.map(m => raidMember(m.card, m, m.basic));
  S.raid = newRaid(ms, S.final ? "final" : "group");
  S.msgs = []; S.modalOpen = false;
  console.log("[raid] start", S.raid.mode, ms.map(m => m.region).join(","), "boss HP", S.raid.boss.max);
  $("raidSetup").hidden = true; $("raidEnd").hidden = true; $("raidArena").hidden = false;
  renderArena();
  $("raidArena").scrollIntoView({ behavior: "smooth", block: "start" });
}

function pushEvents(evs) {
  const st = S.raid;
  const mem = i => st.members[i];
  evs.forEach(e => {
    if (e.t === "special") S.msgs.push(PART3.msgSpecial(regionShort(mem(e.who)), mem(e.who).mvName, e.dmg));
    else if (e.t === "guard") S.msgs.push(PART3.msgGuard(regionShort(mem(e.who)), e.amt));
    else if (e.t === "heal") S.msgs.push(PART3.msgHeal(regionShort(mem(e.who)), regionShort(mem(e.to)), e.amt));
    else if (e.t === "boss") {
      S.msgs.push((e.name ? PART3.msgBoss(e.name) : PART3.msgPress) + PART3.msgHit(regionShort(mem(e.to)), e.dmg, e.blocked) + (e.weak ? PART3.msgWeak : ""));
    } else if (e.t === "down") S.msgs.push(PART3.msgDown(regionShort(mem(e.who))));
    else if (e.t === "jp1") { S.msgs.push(PART3.jp1); console.log("[raid] japan event after boss turn", st.bossTurns); }
    else if (e.t === "jp2") S.msgs.push(PART3.jp2);
    else if (e.t === "jpSwitch") { S.msgs.push(PART3.jpSwitch(mem(e.who).name || "모둠")); console.log("[raid] japan card switches", mem(e.who).name, "+HP", e.hp); }
    else if (e.t === "jpAlly") { S.msgs.push(PART3.jpAlly); console.log("[raid] japan joins boss (no japan card)"); }
    else if (e.t === "jpQ") S.msgs.push({ modal: true });
    else if (e.t === "win" || e.t === "lose") console.log("[raid]", e.t, "boss turns", st.bossTurns);
  });
}

function nextMsg() {
  if (!S.msgs.length || S.modalOpen) return;
  S.msgs.shift();
  if (S.msgs.length && S.msgs[0].modal) { S.msgs.shift(); openJpModal(); }
  renderArena();
}

function openJpModal() {
  S.modalOpen = true;
  $("jpModal").hidden = false;
  $("jpGo").disabled = true;
  setTimeout(() => { $("jpGo").disabled = false; $("jpGo").focus(); }, 3000); // 3초 뒤 «계속»
}

function closeJpModal() {
  $("jpModal").hidden = true;
  S.modalOpen = false;
  renderArena();
}

function doSkill(skill) {
  if (S.msgs.length || S.modalOpen || !S.raid || S.raid.over) return;
  pushEvents(act(S.raid, skill, Math.random));
  renderArena();
}

function doBoss(choice) {
  if (S.msgs.length || S.modalOpen || !S.raid || S.raid.over) return;
  pushEvents(bossTurn(S.raid, Math.random, choice));
  renderArena();
}

function hpBar(cur, max, cls) {
  const bar = el("div", "hpbar" + (cls ? " " + cls : ""));
  const fill = el("i");
  const r = max ? cur / max : 0;
  fill.style.width = Math.max(0, Math.min(100, r * 100)) + "%";
  if (r < 0.3) fill.className = "low";
  bar.appendChild(fill);
  return bar;
}

function renderArena() {
  const st = S.raid;
  if (!st) return;
  const cur = currentActor(st);
  // 보스 쪽: 열강 + (일본 카드가 넘어갔으면 그 카드, 없으면 일본 도트)
  const bs = $("bossSide");
  bs.innerHTML = "";
  bs.appendChild(spriteEl("boss", { cls: "boss-sprite" }));
  st.members.forEach(m => { if (m.foe) bs.appendChild(spriteEl(m.region, { foe: true, cls: "ally-sprite", sym: m.sym })); });
  if (st.japanAlly) bs.appendChild(spriteEl("japan", { foe: true, cls: "ally-sprite" }));
  $("bossName").textContent = PART3.bossName;
  $("bossHp").textContent = "HP " + st.boss.hp + " / " + st.boss.max;
  $("bossBar").style.width = Math.max(0, st.boss.hp / st.boss.max * 100) + "%";

  const tz = $("teamZone");
  tz.innerHTML = "";
  st.members.forEach((m, i) => {
    if (m.foe) return;
    const c = el("div", "fighter" + (i === cur && !S.msgs.length ? " cur" : "") + (m.down ? " down" : ""));
    c.style.setProperty("--c1", (LOOK[m.region] || {}).c1 || "#6d6f86");
    c.appendChild(spriteEl(m.region, { sym: m.sym }));
    const info = el("div", "f-info");
    info.appendChild(el("b", "", regionShort(m)));
    if (m.name) info.appendChild(el("span", "f-name", m.name));
    info.appendChild(el("span", "f-move", "«" + m.mvName + "»"));
    info.appendChild(hpBar(m.hp, m.max));
    info.appendChild(el("span", "hp-num", "HP " + m.hp + " / " + m.max));
    c.appendChild(info);
    tz.appendChild(c);
  });

  const mb = $("msgBox");
  const waiting = S.msgs.length > 0;
  mb.innerHTML = "";
  if (waiting) { mb.appendChild(el("span", "msg-line", S.msgs[0])); mb.appendChild(el("small", "msg-next", PART3.tapNext)); }
  else if (st.over) mb.appendChild(el("span", "msg-line", st.over === "win" ? PART3.winTitle : PART3.loseTitle));
  else mb.appendChild(el("span", "msg-line", cur >= 0 ? PART3.turnOf(regionShort(st.members[cur]), st.members[cur].name) : PART3.bossTurn));
  mb.disabled = !waiting;

  const sk = $("skillBox");
  sk.innerHTML = "";
  if (waiting || S.modalOpen) return;
  if (st.over) { showRaidEnd(); return; }
  const btn = (label, fn, dis, cls) => { const b = el("button", "btn skill" + (cls ? " " + cls : ""), label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", fn); sk.appendChild(b); return b; };
  if (cur >= 0) {
    const m = st.members[cur];
    btn(PART3.skillSpecial(m.mvName) + (canSpecial(m) ? "" : " · " + PART3.skillRest), () => doSkill("special"), !canSpecial(m), "sp");
    btn(PART3.skillGuard, () => doSkill("guard"));
    btn(PART3.skillHeal, () => doSkill("heal"));
  } else if (st.controller >= 0) {
    sk.appendChild(el("p", "ctrl-q", PART3.ctrlTurn(st.members[st.controller].name || "일본 카드 주인")));
    btn(PART3.ctrlRandom, () => doBoss("random"), false, "foe-btn");
    btn(PART3.ctrlWeak, () => doBoss("weak"), false, "foe-btn");
  } else {
    btn(PART3.bossGo, () => doBoss(""), false, "foe-btn");
  }
}

function showRaidEnd() {
  const st = S.raid;
  S.raidDone = true;
  const win = st.over === "win";
  $("raidEnd").hidden = false;
  $("endTitle").textContent = win ? PART3.winTitle : PART3.loseTitle;
  $("endQ").textContent = win ? PART3.winQ : PART3.loseQ;
  const ul = $("endRecord");
  ul.innerHTML = "";
  const team = st.members.filter(m => !m.foe);
  ul.appendChild(el("li", "", PART3.recResult(win)));
  ul.appendChild(el("li", "", PART3.recHp(team.map(m => regionShort(m) + " " + m.hp).join(", "))));
  ul.appendChild(el("li", "", PART3.recDown(team.filter(m => m.down).map(regionShort).join(", "))));
  $("endRep").textContent = S.final ? PART3.finalQ : PART3.pickRep; // 최종 보스전은 마무리 질문을 크게
  $("endRep").classList.toggle("final-q", S.final);
  if (!S.final) $("finalBox").hidden = false;
  $("raidRetry").hidden = win;
  $("raidRetry").textContent = PART3.retryBtn;
}

function retryRaid() {
  $("raidEnd").hidden = true;
  startRaid(); // 카드는 그대로, HP·일본 이벤트는 처음부터
}

/* ── 마무리 제출: 모둠 기기에서 학생마다 한 번씩, 고른 학생 학번으로 ── */
function renderWho3() {
  if (S.final) return;
  const opts = S.members.filter(m => m.sid).map(m => ({ id: m.sid, name: m.name + (S.doneSids.indexOf(m.sid) >= 0 ? " ✓ 제출함" : "") }));
  if (opts.every(o => o.id !== S.who3)) S.who3 = "";
  radioGroup3($("who3"), opts);
}

function radioGroup3(box, opts) {
  box.innerHTML = "";
  box.setAttribute("role", "radiogroup");
  opts.forEach(o => {
    box.appendChild(choiceRow(o.name, S.who3 === o.id, row => {
      S.who3 = o.id;
      box.querySelectorAll("[role=radio]").forEach(r => r.setAttribute("aria-checked", r === row ? "true" : "false"));
      $("p3Err").textContent = "";
    }));
  });
  if (!opts.length) box.appendChild(el("p", "note", "카드를 불러온 친구가 여기 나와."));
}

async function submitPart3() {
  if (S.sending) return;
  const m = S.members.find(x => x.sid === S.who3);
  if (!m) { $("p3Err").textContent = "제출할 사람을 골라 줘."; return; }
  if (S.doneSids.indexOf(m.sid) >= 0) { $("p3Err").textContent = m.name + "은(는) 이미 제출했어."; return; }
  const t = val("t3");
  if (t.length < 5 && !skip()) { $("p3Err").textContent = "한두 문장 써 줘."; return; }
  if (t.length < PART3.finalMin && !skip() && !confirm("아직 " + t.length + "자야. 그래도 제출할까?")) return;
  $("p3Err").textContent = "";
  S.sending = true; $("p3Submit").disabled = true; $("p3Submit").textContent = "보내는 중…";
  const st = S.raid;
  const result = st && st.over ? (st.over === "win" ? "레이드 승리" : "레이드 패배") : "레이드 전";
  const payload = {
    studentId: m.sid, studentName: m.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: regionName(m.card.region) + " 카드 · " + result + " · 모둠 " + S.members.length + "명",
    diffSummary: "",
    reflection: t, // 시트 G열: 마무리 질문 답
    choicesJson: JSON.stringify({ sid: m.sid, name: m.name, ban: (parseSid(m.sid) || {}).ban || 0, region: m.card.region, basic: m.basic, result: result,
      group: S.members.map(x => x.sid).filter(Boolean), writing: t, ts: new Date().toISOString() })
  };
  if (m.session) payload.session = m.session; // 친구는 그 친구 세션으로(없으면 portal_auth가 이 기기 세션을 붙인다)
  if (m.sid === S.sid) Object.assign(payload, FocusGuard.payload()); // 작성 과정 신호는 이 기기를 연 학생 것이라 그 학생 제출에만
  try {
    await postToSheet(payload);
  } catch (e) {
    $("p3Err").textContent = e.locked ? e.message : (/로그인/.test(e.message || "") ? m.name + ": " + e.message + " (카드 불러오기에서 비밀번호를 넣고 다시 불러와 줘)" : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘.");
    S.sending = false; $("p3Submit").disabled = false; $("p3Submit").textContent = PART3.submitBtn;
    return;
  }
  S.sending = false; S.doneSids.push(m.sid);
  $("t3").value = ""; $("t3c").textContent = "0자";
  $("p3Submit").disabled = false; $("p3Submit").textContent = PART3.submitBtn;
  $("p3Out").textContent = S.preview ? "미리보기라 저장하지 않았어." : m.name + " 제출했어! 다음 사람을 골라.";
  S.who3 = "";
  renderWho3();
}

/* ── 부팅 (모든 함수 선언 뒤, 파일 맨 마지막) ── */
function init() {
  const q = new URLSearchParams(location.search);
  S.part = q.get("part") === "2" ? 2 : q.get("part") === "3" ? 3 : 1;
  CONFIG.GAME_NAME = CONFIG.GAME_NAMES[S.part];
  if (S.part !== 2) document.body.classList.add("wide"); // 분류판·레이드 화면은 넓은 화면에서 펼친다
  S.final = S.part === 3 && q.get("final") === "1";
  if (S.final) document.body.classList.add("eboard"); // 전자칠판: 큰 글씨
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
  $("eyebrow").textContent += [" · 1차시 단서 카드", " · 2차시 역사 카드 만들기", S.final ? " · 3차시 최종 보스전" : " · 3차시 열강 보스 레이드"][S.part - 1];
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
  ["regionQ", "symQ", "hitQ", "hitHint", "mvQ", "mvHint", "weakQ", "weakHint", "statQ", "statNote", "rivalQ", "rivalHint", "keyQ", "keyHint", "must"]
    .forEach(k => { $(k).textContent = PART2[k]; });
  $("mvName").placeholder = PART2.mvNamePh;
  STATS.forEach(d => $("statHint").appendChild(el("li", "", d.icon + " " + d.name + " — " + d.q)));
  $("wrapGuide").textContent = PART2.guide;
  $("saveBtn").textContent = PART2.saveBtn;
  $("copyBtn").textContent = PART2.copyBtn;
  $("padletBtn").textContent = PART2.padletBtn;

  $("setupTitle").textContent = S.final ? PART3.finalSetupTitle : PART3.setupTitle;
  $("setupNote").textContent = S.final ? PART3.finalSetupNote : PART3.setupNote;
  $("mPwNote").textContent = PART3.pwNote;
  $("basicNote").textContent = PART3.basicNote;
  $("rulesTitle").textContent = PART3.rulesTitle;
  PART3.rules.forEach(r => $("rulesList").appendChild(el("li", "", r)));
  $("raidStart").textContent = PART3.startBtn;
  $("jpQ").textContent = PART3.jpQ;
  $("jpGo").textContent = PART3.jpGo;
  $("finalBox").hidden = true; // 모둠 레이드가 끝나면 연다(전자칠판은 저장 없음)
  $("who3Q").textContent = PART3.who3Q;
  $("finalTitle").textContent = PART3.finalTitle;
  $("finalQ").textContent = PART3.finalQ;
  $("finalHint").textContent = PART3.finalHint;
  $("p3Submit").textContent = PART3.submitBtn;

  $("startBtn").addEventListener("click", startApp);
  if (S.final) { show("p3"); loadFirstMember(); } // 전자칠판은 학번 입력 없이 바로 대표 카드 불러오기
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
  $("mLoad").addEventListener("click", loadMember);
  $("basicJoin").addEventListener("click", joinBasic);
  $("raidStart").addEventListener("click", startRaid);
  $("msgBox").addEventListener("click", nextMsg);
  $("jpGo").addEventListener("click", closeJpModal);
  $("raidRetry").addEventListener("click", retryRaid);
  preloadSpriteImages();
  Glossary.start({ terms: GLOSSARY, unique: true, skip: [".eyebrow", "h1", ".sum-list b", ".rname", ".opt", ".sym", ".cell", ".trap", ".ghost", ".deck-nav", ".board-cols", ".toast", ".hcard", ".rank-list", ".stars", ".arena", ".member-list", ".modal"] }); // 어려운 낱말 풀이 (glossary.js). 칸 안은 누르기와 겹쳐 밑줄을 긋지 않는다
}

init();
