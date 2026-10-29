/* 주제35~39 「국민 국가 건설, 결과는 왜 달랐을까?」 — 화면·진행(app.js)
 * 판정은 logic.js(순수 함수), 문구·카드는 data.js.
 * ?part=1(기본): 1차시 단서 카드 분류판 / ?part=2: 2차시 개인 탐구 글(수행평가). 포털에는 두 활동을 따로 등록한다. */
const CONFIG = {
  SHEET_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbyXSjCfWY_HiZFqW_OBR-FQDoIfF1z_STqyKWUI31MacHeY3u7hbirFSFDvW-5yuUHaJQ/exec",
  /* 포털 커리큘럼 관리에 이 id로 활동을 등록한다(부마다 하나) */
  GAME_NAMES: { 1: "35차시_국민국가건설_단서분류", 2: "35차시_국민국가건설_탐구글" },
  GAME_NAME: "" // init()에서 부에 맞게 채운다
};

const S = {
  part: 1, sid: "", name: "", grade: 0, ban: 0, preview: false,
  placed: {}, cur: "", tries: 0, done1: false, marked: false,
  region: "", compare: "",
  copied: false, sending: false, submitted: false, padletUrl: "", padletLoading: false
};
const SAVE_KEYS = { 1: ["placed", "cur", "tries", "done1"], 2: ["region", "compare"] };
const W_IDS = ["w1", "w2", "w3", "w4"];
const OTHER = { id: "other", name: "그 밖의 지역" };

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
  ["s0", "p1", "p2"].forEach(k => { $(k).hidden = (k !== key); });
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
    if (S.done1 || skip()) showDone1(); // 미리보기는 분류판을 다 맞추지 않아도 아래 정리·제출 칸을 함께 연다
    show("p1");
    setTimeout(() => { $("t1c").textContent = val("t1").length + "자"; }, 700);
  } else {
    S.padletLoading = true;
    loadPadletUrl(p.grade, p.ban).then(u => { S.padletUrl = u; S.padletLoading = false; renderPadlet(); });
    renderPicks();
    show("p2");
    setTimeout(refreshCounts, 700); // draft_guard가 글을 되살린 뒤 글자 수·요약을 다시 그린다
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
  renderSumList($("sumList"));
  $("p1Done").hidden = false;
  renderP1Submit();
}

function renderP1Submit() {
  $("p1Submit").disabled = S.submitted || S.sending;
  $("p1Submit").textContent = S.submitted ? "제출 완료" : PART1.submitBtn;
}

async function submitPart1() {
  if (S.sending || S.submitted || (!S.done1 && !skip())) return;
  const t = val("t1");
  if (t.length < 5 && !skip()) { $("p1Err").textContent = "지금 생각을 한두 문장 써 줘."; return; }
  if (t.length < PART1.thinkMin && !skip() && !confirm("아직 " + t.length + "자야. 그래도 제출할까?")) return;
  $("p1Err").textContent = "";
  S.sending = true; renderP1Submit(); $("p1Submit").textContent = "보내는 중…";
  const payload = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: "분류판 완성 · 맞춰 보기 " + S.tries + "번",
    diffSummary: "",
    reflection: t, // 시트 G열: 처음 질문에 대한 지금 생각
    choicesJson: JSON.stringify({ sid: S.sid, name: S.name, ban: S.ban, tries: S.tries, writing: t, ts: new Date().toISOString() })
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
  renderP1Submit();
  $("p1Out").textContent = S.preview ? "미리보기라 저장하지 않았어." : "제출했어! 다음 시간에는 이 분류판으로 탐구 글을 써.";
}

/* ══ 2부: 개인 탐구 글 ══ */
function choiceRow(text, checked, onPick) {
  const row = el("div", "opt");
  row.setAttribute("role", "radio");
  row.tabIndex = 0;
  row.setAttribute("aria-checked", checked ? "true" : "false");
  row.appendChild(el("span", "opt-box"));
  row.appendChild(el("span", "opt-text", text));
  row.addEventListener("click", () => onPick(row));
  row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(row); } });
  return row;
}

function radioGroup(box, options, getVal, setVal) {
  box.innerHTML = "";
  box.setAttribute("role", "radiogroup");
  options.forEach(o => {
    box.appendChild(choiceRow(o.name, getVal() === o.id, row => {
      if (S.submitted) return;
      setVal(o.id); save();
      box.querySelectorAll(".opt").forEach(r => r.setAttribute("aria-checked", r === row ? "true" : "false"));
    }));
  });
}

function renderPicks() {
  radioGroup($("regionPick"), REGIONS, () => S.region, v => {
    S.region = v;
    if (S.compare === v) S.compare = "";
    renderComparePick(); refreshCounts();
  });
  renderComparePick();
}

function renderComparePick() {
  const opts = REGIONS.filter(r => r.id !== S.region).concat([OTHER]);
  radioGroup($("comparePick"), opts, () => S.compare, v => { S.compare = v; refreshCounts(); });
}

function regionName(id) { const r = byId(REGIONS.concat([OTHER]), id); return r ? r.name : "(아직 안 고름)"; }
function pageTag(id) { const p = val(id).replace(/쪽$/, ""); return p ? " (" + p + "쪽)" : ""; }

/* 복사 글: 학번·이름 한 줄, [고른 지역·비교 지역] 한 줄, 그 아래는 학생 글과 쪽수뿐 */
function bodyText() {
  return "[고른 지역] " + regionName(S.region) + " · [비교 지역] " + regionName(S.compare) + "\n"
    + "① " + val("w1") + pageTag("pg1") + "\n"
    + "② " + val("w2") + pageTag("pg2") + "\n"
    + "③ " + val("w3") + pageTag("pg3") + "\n"
    + "④ " + val("w4");
}
function buildOutText() { return S.sid + " " + S.name + "\n" + bodyText(); }
function counts() { const t = {}; W_IDS.forEach(id => { t[id] = val(id); }); return charCounts(t); }

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
  const box = $("summary");
  box.innerHTML = "";
  bodyText().split("\n").forEach((l, i) => box.appendChild(el("p", i ? "sum-line" : "sum-head", l)));
  const n = counts().total;
  const short = n < PART2.totalMin;
  $("bodyCount").textContent = "내가 쓴 글 " + n + "자 (번호·쪽수·지역 줄 제외)" + (short ? " — " + PART2.totalMin + "자 이상 써 보자." : "");
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
  if (!S.region) return ["regionPick", "① 지역을 하나 골라 줘."];
  if (!S.compare) return ["comparePick", "③ 비교할 지역을 하나 골라 줘."];
  for (let i = 0; i < W_IDS.length; i++) if (val(W_IDS[i]).length < 10) return [W_IDS[i], (i + 1) + "번 칸을 조금 더 써 줘."];
  return null;
}

async function submitPart2() {
  if (S.sending || S.submitted) return;
  $("outErr").textContent = "";
  const prob = p2Problem();
  if (prob && !skip()) { $("p2Err").textContent = prob[1]; $(prob[0]).scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  $("p2Err").textContent = "";
  const noPage = ["pg1", "pg2", "pg3"].filter(id => !val(id)).map(id => id.slice(2) + "번");
  if (noPage.length && !skip() && !confirm(noPage.join("·") + " 칸에 교과서 쪽수가 없어. 그래도 제출할까?")) return;
  const total = counts().total;
  if (total < PART2.totalMin && !skip() && !confirm("아직 " + total + "자야. " + PART2.totalMin + "자보다 짧은데 그래도 제출할까?")) return;
  S.sending = true; $("submitBtn").disabled = true; $("submitBtn").textContent = "보내는 중…";
  const payload = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: regionName(S.region) + " / 비교: " + regionName(S.compare),
    diffSummary: "",
    reflection: bodyText(), // 시트 G열: 탐구 글 전체(①~④와 쪽수)
    choicesJson: JSON.stringify({
      sid: S.sid, name: S.name, ban: S.ban, region: S.region, compare: S.compare,
      w1: val("w1"), pg1: val("pg1"), w2: val("w2"), pg2: val("pg2"), w3: val("w3"), pg3: val("pg3"), w4: val("w4"),
      writing: bodyText(), ts: new Date().toISOString()
    })
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
  W_IDS.concat(["pg1", "pg2", "pg3"]).forEach(id => { $(id).readOnly = true; }); // 제출 뒤 수정 잠금
  renderSummary();
  $("outMsg").textContent = S.preview ? "미리보기라 저장하지 않았어." : (S.copied ? "제출했어! 복사한 글을 패들렛에 올려 줘." : "제출했어! 이제 글을 복사해서 패들렛에 올려 줘.");
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
  if (p2Problem()) { $("p2Err").textContent = "지역을 고르고 네 칸을 다 쓴 다음 복사해 줘."; return; }
  const ok = await copyText(buildOutText());
  if (!ok) { $("outMsg").textContent = "복사가 안 됐어. 한 번 더 눌러 줘."; return; }
  S.copied = true;
  $("outMsg").textContent = S.submitted ? "복사했어. 패들렛에 붙여넣기 해." : "복사했어. 제출 버튼도 꼭 눌러 줘!";
}

/* ── 부팅 (모든 함수 선언 뒤, 파일 맨 마지막) ── */
function init() {
  const q = new URLSearchParams(location.search);
  S.part = q.get("part") === "2" ? 2 : 1;
  CONFIG.GAME_NAME = CONFIG.GAME_NAMES[S.part];
  if (S.part === 1) document.body.classList.add("wide"); // 분류판은 넓은 화면에서 표 모양으로 편다
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
  $("eyebrow").textContent += S.part === 1 ? " · 1차시 단서 카드" : " · 2차시 탐구 글";
  $("introQ").textContent = INTRO.question;
  $("introLead").textContent = S.part === 1 ? INTRO.part1Lead : INTRO.part2Lead;

  $("boardQ").textContent = PART1.boardQ;
  $("boardHow").textContent = PART1.how;
  $("boardHint").textContent = PART1.hint;
  COLS.forEach((c, i) => { $("col" + i).textContent = c.name; });
  $("trapName").textContent = PART1.trapName;
  $("trapDesc").textContent = PART1.trapDesc;
  $("boardCheck").textContent = PART1.checkBtn;
  $("doneTitle").textContent = PART1.doneTitle;
  $("doneLead").textContent = PART1.doneLead;
  $("thinkQ").textContent = PART1.thinkQ;
  $("thinkHint").textContent = PART1.thinkHint;

  $("refTitle").textContent = PART2.refTitle;
  $("refNote").textContent = PART2.refNote;
  renderSumList($("refList"));
  ["q1", "q2", "q3", "q4"].forEach(k => { $(k).textContent = PART2[k]; $(k + "Hint").textContent = PART2[k + "Hint"]; });
  $("must").textContent = PART2.must;
  $("wrapGuide").textContent = PART2.guide;
  $("copyBtn").textContent = PART2.copyBtn;
  $("padletBtn").textContent = PART2.padletBtn;

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
  $("t1").addEventListener("input", () => { $("t1c").textContent = val("t1").length + "자"; $("p1Err").textContent = ""; });
  $("p1Submit").addEventListener("click", submitPart1);
  W_IDS.concat(["pg1", "pg2", "pg3"]).forEach(id => $(id).addEventListener("input", () => { $("p2Err").textContent = ""; refreshCounts(); }));
  $("copyBtn").addEventListener("click", copyOut);
  $("submitBtn").addEventListener("click", submitPart2);
  Glossary.start({ terms: GLOSSARY, unique: true, skip: [".eyebrow", "h1", ".sum-list b", ".rname", ".opt", ".cell", ".trap", ".ghost", ".deck-nav", ".board-cols", ".toast", ".summary"] }); // 어려운 낱말 풀이 (glossary.js). 칸 안은 누르기와 겹쳐 밑줄을 긋지 않는다
}

init();
