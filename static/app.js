'use strict';

/*
 * すべての処理はブラウザの中で行います。
 * 名前をサーバーへ送るコード（fetch など）は一切ありません。
 * また localStorage などにも保存しないので、再読み込みで名簿は消えます。
 */

const MAX_FILE_SIZE = 1024 * 1024; // 1MB（名簿としては十分な大きさ）

const state = {
  people: [],          // { id, name }（同姓同名でも区別できるよう id を持たせる）
  absent: new Set(),   // 欠席者の id
  picked: [],          // 選ばれた順の id
  rolling: false,
};

const $ = (id) => document.getElementById(id);

// ---------------- 乱数（偏りの少ない crypto を使用） ----------------
function randomInt(n) {
  // 0 以上 n 未満の整数。剰余による偏りを避けるため棄却法を使う
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= max);
  return buf[0] % n;
}

function shuffle(array) {
  // フィッシャー–イェーツのシャッフル
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- ファイルの読み込み ----------------
function decodeText(buffer) {
  // まず UTF-8（BOM 付き含む）として読み、失敗したら Shift_JIS として読む
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (e) {
    return new TextDecoder('shift_jis').decode(buffer);
  }
}

function parseNames(text) {
  return text
    .replace(/^\uFEFF/, '') // 念のため BOM を除去
    .split(/\r?\n/)
    .map((line) => line.split(/[,\t]/)[0].trim()) // CSV の場合は1列目を名前とみなす
    .filter((line) => line !== '' && !line.startsWith('#'));
}

async function loadFile(file) {
  hideError();
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    showError('ファイルが大きすぎます。1MB 以下のテキストファイルを選んでください。');
    return;
  }
  const buffer = await file.arrayBuffer();
  const names = parseNames(decodeText(buffer));
  if (names.length === 0) {
    showError('名前が見つかりませんでした。1行に1名ずつ書いたテキストファイルを選んでください。');
    return;
  }
  state.people = names.map((name, i) => ({ id: i, name }));
  state.absent.clear();
  state.picked = [];
  $('fileName').textContent = `読み込んだファイル：${file.name}`;
  $('pickDisplay').textContent = '―';
  $('pickDisplay').className = 'pick-display';
  $('shuffleList').replaceChildren();
  showMain(true);
  renderAll();
}

async function openFile() {
  // 対応ブラウザ（Chrome / Edge）では「ドキュメント」フォルダを最初に開く
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        startIn: 'documents',
        multiple: false,
        types: [{ description: '名簿ファイル', accept: { 'text/plain': ['.txt', '.csv'] } }],
      });
      await loadFile(await handle.getFile());
    } catch (e) {
      if (e.name !== 'AbortError') $('fileInput').click(); // 失敗時は通常の方法に切り替え
    }
  } else {
    $('fileInput').click();
  }
}

function closeRoster() {
  state.people = [];
  state.absent.clear();
  state.picked = [];
  $('fileInput').value = '';
  showMain(false);
}

// ---------------- 表示 ----------------
function presentPeople() {
  return state.people.filter((p) => !state.absent.has(p.id));
}

function renderRoster() {
  const items = state.people.map((p) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const isAbsent = state.absent.has(p.id);
    btn.type = 'button';
    btn.className = 'roster-item';
    btn.setAttribute('aria-pressed', String(isAbsent));
    btn.dataset.id = p.id;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name; // textContent なので HTML として解釈されない
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = isAbsent ? '欠席' : '出席';

    btn.append(name, status);
    li.append(btn);
    return li;
  });
  $('rosterList').replaceChildren(...items);

  const total = state.people.length;
  const absent = state.absent.size;
  $('counts').textContent = `全${total}名　出席${total - absent}名　欠席${absent}名`;
}

function renderHistory() {
  const byId = new Map(state.people.map((p) => [p.id, p.name]));
  const items = state.picked.map((id) => {
    const li = document.createElement('li');
    li.textContent = byId.get(id) + (state.absent.has(id) ? '（欠席）' : '');
    return li;
  });
  $('historyList').replaceChildren(...items);
}

function renderAll() {
  renderRoster();
  renderHistory();
}

function showMain(show) {
  $('mainView').hidden = !show;
  $('emptyView').hidden = show;
  $('closeBtn').hidden = !show;
}

function showError(msg) {
  $('errorMsg').textContent = msg;
  $('errorMsg').hidden = false;
}

function hideError() {
  $('errorMsg').hidden = true;
}

// ---------------- 機能1：ランダムに並び替え ----------------
function doShuffle() {
  const list = shuffle(presentPeople());
  const items = list.map((p) => {
    const li = document.createElement('li');
    li.textContent = p.name;
    return li;
  });
  $('shuffleList').replaceChildren(...items);
}

// ---------------- 機能2：ランダムに1名 ----------------
function candidates() {
  const exclude = $('excludePicked').checked;
  return presentPeople().filter((p) => !(exclude && state.picked.includes(p.id)));
}

async function doPick() {
  if (state.rolling) return;
  const pool = candidates();
  const display = $('pickDisplay');

  if (pool.length === 0) {
    display.className = 'pick-display';
    display.textContent = '対象者がいません';
    return;
  }

  const winner = pool[randomInt(pool.length)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduceMotion && pool.length > 1) {
    // 名前が切り替わりながら、だんだん遅くなって止まる演出
    state.rolling = true;
    $('pickBtn').disabled = true;
    display.className = 'pick-display is-rolling';
    let delay = 50;
    while (delay < 300) {
      display.textContent = pool[randomInt(pool.length)].name;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 1.15;
    }
    state.rolling = false;
    $('pickBtn').disabled = false;
  }

  display.className = 'pick-display is-final';
  display.textContent = winner.name;
  state.picked.push(winner.id);
  renderHistory();
}

// ---------------- イベントの登録 ----------------
document.addEventListener('DOMContentLoaded', () => {
  $('openBtn').addEventListener('click', openFile);
  $('closeBtn').addEventListener('click', closeRoster);
  $('fileInput').addEventListener('change', (e) => loadFile(e.target.files[0]));

  // 名前を押して出席／欠席を切り替え
  $('rosterList').addEventListener('click', (e) => {
    const btn = e.target.closest('.roster-item');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (state.absent.has(id)) state.absent.delete(id);
    else state.absent.add(id);
    renderAll();
  });

  $('allPresentBtn').addEventListener('click', () => {
    state.absent.clear();
    renderAll();
  });

  $('shuffleBtn').addEventListener('click', doShuffle);
  $('pickBtn').addEventListener('click', doPick);
  $('resetPickedBtn').addEventListener('click', () => {
    state.picked = [];
    $('pickDisplay').textContent = '―';
    $('pickDisplay').className = 'pick-display';
    renderHistory();
  });

  // ドラッグ＆ドロップ
  const zone = $('dropZone');
  ['dragenter', 'dragover'].forEach((type) =>
    document.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.add('is-over');
    })
  );
  ['dragleave', 'drop'].forEach((type) =>
    document.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
    })
  );
  document.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });
});
