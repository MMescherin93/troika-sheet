/* ==========================================================================
   ЛИСТ ПЕРСОНАЖА «ТРОЙКА!» — ВСЯ ЛОГИКА ПРИЛОЖЕНИЯ
   --------------------------------------------------------------------------
   Что умеет этот файл:
     • строит повторяющиеся строки листа (12 навыков, 4 оружия, 15 паёк…);
     • связывает поля формы с данными персонажа (data-field ↔ model);
     • хранит НЕСКОЛЬКО персонажей и переключает между ними;
     • автосохранение, экспорт/импорт JSON, ссылка с персонажем внутри;
     • масштабирует лист под ширину окна.

   Порядок файла:
     1. Мелкие утилиты
     2. Модель данных (как выглядит персонаж)
     3. Хранилище (localStorage с защитой)
     4. Построение строк листа
     5. Связь «форма ↔ данные»
     6. Персонажи: выбор, создание, удаление
     7. Кнопки: печать, экспорт, импорт, ссылка
     8. Масштабирование листа
     9. Запуск
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. МЕЛКИЕ УТИЛИТЫ
   -------------------------------------------------------------------------- */

/** Короткий уникальный идентификатор персонажа. */
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Читает значение по пути вида "skills.0.name" из вложенного объекта. */
function getPath(obj, path) {
  return path.split('.').reduce(function (o, key) {
    return o == null ? undefined : o[key];
  }, obj);
}

/** Записывает значение по пути вида "skills.0.name" во вложенный объект. */
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce(function (o, key) { return o[key]; }, obj);
  parent[last] = value;
}

/** Показывает короткое сообщение-подсказку в панели инструментов. */
let toastTimer = null;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
}

/** Убирает запрещённые для имени файла символы. */
function safeFileName(name) {
  return (name || 'персонаж').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
}


/* --------------------------------------------------------------------------
   2. МОДЕЛЬ ДАННЫХ
   Здесь описано, какими полями обладает персонаж. Если захотите добавить
   новое поле — добавьте его сюда, в index.html (data-field) и, если нужно,
   строку для построения в разделе 4.
   -------------------------------------------------------------------------- */

/** Сколько строк какого типа на листе (по официальному бланку). */
const COUNTS = {
  skills: 12,     // строки «Навыки и заклинания»
  weapons: 4,     // строки «Оружие»
  damage: 7,      // квадратиков урона в каждой строке оружия: 1 2 3 4 5 6 7+
  rations: 15,    // клетки «Пайки»
  inventory: 12   // нумерованные ячейки «Инвентарь»
};

/** Пустой персонаж: все поля пустые, но структура уже правильная. */
function defaultFields() {
  return {
    // Верх листа
    name: '',            // ИМЯ
    background: '',      // ПРЕДЫСТОРИЯ
    special: '',         // ОСОБЕННОСТЬ

    // Три характеристики
    skill: '',           // УМЕНИЕ
    stamina: '',         // ВЫНОСЛИВОСТЬ (максимум)
    staminaDamage: '',   // Урон
    luck: '',            // УДАЧА (максимум)
    luckSpent: '',       // Потрачено

    // Навыки и заклинания: 12 строк по 4 поля
    skills: Array.from({ length: COUNTS.skills }, function () {
      return { name: '', rank: '', skill: '', total: '' };
    }),

    // Оружие: 4 строки; в каждой — название и 7 клеток урона (1…7+).
    // Клетки урона — текстовые поля, поэтому здесь пустые строки, а не «галочки».
    weapons: Array.from({ length: COUNTS.weapons }, function () {
      return {
        name: '',
        damage: Array.from({ length: COUNTS.damage }, function () { return ''; })
      };
    }),

    // Одежда: четыре уровня защиты (отмечаем, что носит персонаж)
    armor: { shield: false, light: false, medium: false, heavy: false },

    // Итоговое значение защиты — вписывается внутрь значка щита
    defense: '',

    // Пайки: 15 клеток
    rations: Array.from({ length: COUNTS.rations }, function () { return false; }),

    // Инвентарь: 12 строк
    inventory: Array.from({ length: COUNTS.inventory }, function () { return ''; }),

    money: ''            // ДЕНЬГИ
  };
}

/** Новый (пустой) персонаж. */
function newCharacter(fields) {
  return { id: makeId(), fields: mergeInto(defaultFields(), fields || {}) };
}

/**
 * Сливает сохранённые данные в пустую (правильную) структуру.
 * Правила простые и безопасные:
 *   • массив принимается только если он действительно массив — иначе берём пустой;
 *   • объект принимается только если он действительно объект;
 *   • булевы поля (галочки) принимаются только как true/false;
 *   • всё остальное превращается в строку.
 * Благодаря этому старые сохранения и чужие файлы не ломают лист.
 */
function mergeInto(base, src) {
  if (Array.isArray(base)) {
    if (!Array.isArray(src)) return base;
    return base.map(function (item, i) {
      return i < src.length ? mergeInto(item, src[i]) : item;
    });
  }
  if (base !== null && typeof base === 'object') {
    if (src === null || typeof src !== 'object') return base;
    const out = {};
    Object.keys(base).forEach(function (key) {
      out[key] = mergeInto(base[key], src[key]);
    });
    return out;
  }
  if (src === undefined || src === null) return base;
  if (typeof base === 'boolean') return typeof src === 'boolean' ? src : base;
  return String(src);
}

/**
 * Старые сохранения: урон отмечался «галочкой» (true/false), а теперь в клетку
 * вписывается текст. Превращаем отметку в число, стоящее над этой клеткой:
 * true в третьей клетке → «3», true в седьмой → «7+», false → пусто.
 */
function migrateWeapons(saved) {
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.weapons)) return saved;

  saved.weapons.forEach(function (weapon) {
    if (!weapon || !Array.isArray(weapon.damage)) return;
    weapon.damage = weapon.damage.map(function (value, index) {
      if (value === true) {
        return index === COUNTS.damage - 1 ? '7+' : String(index + 1);
      }
      if (value === false) return '';
      return value === null || value === undefined ? '' : String(value);
    });
  });
  return saved;
}

/** Дополняет загруженные данные недостающими полями. */
function normalizeFields(saved) {
  return mergeInto(defaultFields(), migrateWeapons(saved));
}


/* --------------------------------------------------------------------------
   3. ХРАНИЛИЩЕ
   localStorage может быть запрещён (например, страница открыта внутри чужого
   iframe, как в Owlbear Rodeo, или в приватном режиме). Поэтому все обращения
   завёрнуты в try/catch: если хранилища нет — приложение просто работает
   «в памяти» до перезагрузки, но не падает.
   -------------------------------------------------------------------------- */
const STORAGE_KEY = 'troika-sheet-v1';

function storageGet() {
  try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
}
function storageSet(text) {
  try { localStorage.setItem(STORAGE_KEY, text); } catch (e) { /* нет хранилища — переживём */ }
}

/** Состояние всего приложения: текущий персонаж + список персонажей. */
let state = { currentId: null, chars: [] };

function loadState() {
  const raw = storageGet();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.chars) && parsed.chars.length) {
        parsed.chars = parsed.chars.map(function (c) {
          return { id: c.id || makeId(), fields: normalizeFields(c.fields) };
        });
        return parsed;
      }
    } catch (e) { /* повреждённое сохранение — начнём заново */ }
  }
  // Первый запуск: создаём одного пустого персонажа
  const first = newCharacter();
  return { currentId: first.id, chars: [first] };
}

function saveState() {
  storageSet(JSON.stringify(state));
}

/** Текущий персонаж (или null, если списка ещё нет). */
function currentChar() {
  return state.chars.find(function (c) { return c.id === state.currentId; }) || state.chars[0];
}

/** Человекочитаемое имя: поле ИМЯ либо «Персонаж N». */
function charLabel(char) {
  const name = (char.fields.name || '').trim();
  if (name) return name;
  const index = state.chars.indexOf(char) + 1;
  return 'Персонаж ' + index;
}


/* --------------------------------------------------------------------------
   4. ПОСТРОЕНИЕ СТРОК ЛИСТА
   Однотипные элементы (12 навыков, 4 оружия, 15 паёк, 12 ячеек инвентаря)
   неудобно копировать руками в HTML — их проще создать циклом.
   Каждый созданный элемент получает data-field, по которому app.js поймёт,
   в какое место модели записывать значение.
   -------------------------------------------------------------------------- */

function el(tag, className, attrs) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  return node;
}

/** 12 строк «Навыки и заклинания». */
function buildSkills() {
  const host = document.getElementById('skillsRows');
  host.innerHTML = '';
  for (let i = 0; i < COUNTS.skills; i++) {
    const row = el('div', 'skill-row');

    const name = el('input', 'skill-name', { type: 'text' });
    name.dataset.field = 'skills.' + i + '.name';
    row.appendChild(name);

    ['rank', 'skill', 'total'].forEach(function (key) {
      const box = el('input', 'cell-input', { type: 'text', inputmode: 'numeric' });
      box.dataset.field = 'skills.' + i + '.' + key;
      row.appendChild(box);
    });

    host.appendChild(row);
  }
}

/** 4 строки «Оружие» + шапка с числами 1…7+. */
function buildWeapons() {
  const host = document.getElementById('weaponsArea');
  host.innerHTML = '';

  // Шапка: «Урон» уже стоит в HTML, здесь — цифры над клетками
  const head = el('div', 'weapon-head');
  head.appendChild(el('span', ''));
  ['1', '2', '3', '4', '5', '6', '7+'].forEach(function (n) {
    const cell = el('span', '');
    cell.textContent = n;
    head.appendChild(cell);
  });
  host.appendChild(head);

  const rows = el('div', 'weapon-rows');
  for (let i = 0; i < COUNTS.weapons; i++) {
    const row = el('div', 'weapon-row');

    const name = el('input', 'weapon-name', { type: 'text' });
    name.dataset.field = 'weapons.' + i + '.name';
    row.appendChild(name);

    // Клетки урона — РЕДАКТИРУЕМЫЕ поля, точно такие же, как «Ранг / Умение /
    // Всего» в навыках (класс input.cell-input). В клетку можно вписать своё
    // значение. Пути данных: weapons.0.damage.0 … weapons.0.damage.6
    for (let d = 0; d < COUNTS.damage; d++) {
      const cell = el('input', 'cell-input', { type: 'text' });
      cell.dataset.field = 'weapons.' + i + '.damage.' + d;
      row.appendChild(cell);
    }
    rows.appendChild(row);
  }
  host.appendChild(rows);
}

/** 15 клеток «Пайки». */
function buildRations() {
  const host = document.getElementById('rationsArea');
  host.innerHTML = '';
  for (let i = 0; i < COUNTS.rations; i++) {
    const box = el('input', 'cell', { type: 'checkbox' });
    box.dataset.field = 'rations.' + i;
    host.appendChild(box);
  }
}

/** 12 нумерованных строк «Инвентарь». */
function buildInventory() {
  const host = document.getElementById('inventoryRows');
  host.innerHTML = '';
  for (let i = 0; i < COUNTS.inventory; i++) {
    const row = el('div', 'inv-row');
    const num = el('span', '');
    num.textContent = String(i + 1);
    row.appendChild(num);

    const input = el('input', '', { type: 'text' });
    input.dataset.field = 'inventory.' + i;
    row.appendChild(input);

    host.appendChild(row);
  }
}

function buildAllRows() {
  buildSkills();
  buildWeapons();
  buildRations();
  buildInventory();
}


/* --------------------------------------------------------------------------
   5. СВЯЗЬ «ФОРМА ↔ ДАННЫЕ»
   -------------------------------------------------------------------------- */

/** Все элементы с меткой data-field (и статические, и созданные в разделе 4). */
function fieldElements() {
  return Array.prototype.slice.call(document.querySelectorAll('#sheet [data-field]'));
}

/** Записать данные персонажа во все поля формы. */
function applyToForm(fields) {
  fieldElements().forEach(function (el) {
    const value = getPath(fields, el.dataset.field);

    if (el.type === 'checkbox') {
      el.checked = !!value;
    } else if (el.type === 'radio') {
      el.checked = String(value) === el.value;
    } else {
      el.value = value === undefined || value === null ? '' : String(value);
    }
  });
}

/** Прочитать все поля формы в объект данных. */
function readFromForm() {
  const fields = defaultFields();

  fieldElements().forEach(function (el) {
    const path = el.dataset.field;

    if (el.type === 'checkbox') {
      setPath(fields, path, el.checked);
    } else if (el.type === 'radio') {
      // Значение записываем только у того radio, который отмечен.
      // Если не отмечен ни один — в модели остаётся ''.
      if (el.checked) setPath(fields, path, el.value);
    } else {
      setPath(fields, path, el.value);
    }
  });

  return fields;
}


/* --------------------------------------------------------------------------
   6. ПЕРСОНАЖИ: ВЫБОР, СОЗДАНИЕ, УДАЛЕНИЕ
   -------------------------------------------------------------------------- */

const selectEl = document.getElementById('charSelect');

/** Перерисовать выпадающий список, не теряя текущий выбор. */
function renderSelect() {
  selectEl.innerHTML = '';
  state.chars.forEach(function (char) {
    const option = document.createElement('option');
    option.value = char.id;
    option.textContent = charLabel(char);
    selectEl.appendChild(option);
  });
  selectEl.value = state.currentId;
}

/** Показать выбранного персонажа в форме. */
function showCharacter(id) {
  // Если запрошенного персонажа больше нет — берём первого из списка
  const exists = state.chars.some(function (c) { return c.id === id; });
  state.currentId = exists ? id : state.chars[0].id;

  saveState();
  applyToForm(currentChar().fields);
  renderSelect();
}

/** Создать пустого персонажа и сразу переключиться на него. */
function addCharacter(fields) {
  const char = newCharacter(fields);
  state.chars.push(char);
  showCharacter(char.id);
  return char;
}

function deleteCurrent() {
  const char = currentChar();
  if (!char) return;
  if (!window.confirm('Удалить персонажа «' + charLabel(char) + '»?')) return;

  state.chars = state.chars.filter(function (c) { return c.id !== char.id; });
  if (!state.chars.length) state.chars.push(newCharacter());
  showCharacter(state.chars[0].id);
  toast('Персонаж удалён');
}

/** Автосохранение: вызывается при любом изменении формы. */
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    const char = currentChar();
    if (!char) return;
    char.fields = readFromForm();
    saveState();
    renderSelect();   // имя в списке обновилось вместе с полем ИМЯ
  }, 250);
}


/* --------------------------------------------------------------------------
   7. КНОПКИ: ПЕЧАТЬ, ЭКСПОРТ, ИМПОРТ, ССЫЛКА
   -------------------------------------------------------------------------- */

/** Печать. В браузере в диалоге печати можно выбрать «Сохранить как PDF». */
function printSheet() {
  // Сначала дописываем данные в модель, чтобы печать была актуальной
  const char = currentChar();
  if (char) { char.fields = readFromForm(); saveState(); }
  window.print();
}

/** Выгрузить текущего персонажа в файл .json */
function exportCurrent() {
  const char = currentChar();
  if (!char) return;
  char.fields = readFromForm();

  const payload = {
    app: 'troika-sheet',
    version: 1,
    character: { fields: char.fields }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'troika-' + safeFileName(char.fields.name) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Файл сохранён');
}

/** Загрузить персонажа из файла .json */
function importFromFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(String(reader.result));
      // Поддерживаем разные формы файла: целиком экспорт или «голые» поля
      const fields = normalizeFields(
        (parsed && parsed.character && parsed.character.fields) ||
        (parsed && parsed.fields) ||
        parsed
      );
      addCharacter(fields);
      toast('Персонаж импортирован');
    } catch (e) {
      window.alert('Не получилось прочитать файл: ' + e.message);
    }
  };
  reader.readAsText(file);
}

/** Кодирование персонажа в кусок адресной строки (URL-safe base64). */
function encodeShare(fields) {
  const bytes = new TextEncoder().encode(JSON.stringify(fields));
  let binary = '';
  bytes.forEach(function (b) { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShare(text) {
  let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Скопировать ссылку, в которой персонаж зашит прямо в адрес. */
function copyShareLink() {
  const char = currentChar();
  if (!char) return;
  char.fields = readFromForm();
  saveState();

  const url =
    location.origin + location.pathname + location.search +
    '#d=' + encodeShare(char.fields);

  const done = function () { toast('Ссылка скопирована в буфер обмена'); };
  const fallback = function () {
    window.prompt('Скопируйте ссылку вручную:', url);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(fallback);
  } else {
    fallback();
  }
}

/** Пустой ли персонаж: ни одно поле не заполнено. */
function isEmptyCharacter(char) {
  const f = char.fields;
  if (f.name || f.background || f.special || f.skill || f.stamina ||
      f.staminaDamage || f.luck || f.luckSpent || f.money || f.defense) return false;
  if (f.skills.some(function (s) { return s.name || s.rank || s.skill || s.total; })) return false;
  if (f.weapons.some(function (w) { return w.name || w.damage.some(Boolean); })) return false;
  if (Object.keys(f.armor).some(function (k) { return f.armor[k]; })) return false;
  if (f.rations.some(Boolean)) return false;
  if (f.inventory.some(Boolean)) return false;
  return true;
}

/** Если открылись по ссылке с персонажем — забрать его. */
function readShareFromUrl() {
  const match = location.hash.match(/^#d=(.+)$/);
  if (!match) return false;

  try {
    const fields = normalizeFields(decodeShare(match[1]));
    // Не плодим копии: если такой же персонаж уже есть — просто открываем его
    const json = JSON.stringify(fields);
    const same = state.chars.find(function (c) { return JSON.stringify(c.fields) === json; });
    if (same) showCharacter(same.id); else addCharacter(fields);

    // В «чистом» браузере при открытии ссылки рядом с присланным персонажем
    // остаётся только что созданный пустой. Если заполнен ровно один —
    // пустые убираем, чтобы список выглядел аккуратно.
    const filled = state.chars.filter(function (c) { return !isEmptyCharacter(c); });
    if (filled.length === 1) {
      state.chars = filled;
      state.currentId = filled[0].id;
      saveState();
      renderSelect();
    }

    document.getElementById('sharedBanner').hidden = false;
  } catch (e) {
    toast('Ссылка повреждена, открыли пустого персонажа');
    addCharacter();
  }

  // Убираем «мусорный» хеш из адреса, чтобы он не мешал дальше
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}


/* --------------------------------------------------------------------------
   8. МАСШТАБИРОВАНИЕ ЛИСТА ПОД ОКНО
   Лист всегда ровно 297×210 мм. Если окно уже — уменьшаем его пропорционально,
   чтобы не появлялась горизонтальная прокрутка. При печати масштаб
   отключается (см. styles.css, раздел «ПЕЧАТЬ»).
   -------------------------------------------------------------------------- */
function fitSheet() {
  const wrap = document.getElementById('sheetWrap');
  const sheet = document.getElementById('sheet');

  sheet.style.setProperty('--scale', 1);
  const natural = sheet.offsetWidth;              // реальная ширина листа
  const available = wrap.clientWidth - 32;         // минус отступы обёртки
  const scale = available > 0 ? Math.min(1, available / natural) : 1;

  sheet.style.setProperty('--scale', scale);
  wrap.style.height = Math.ceil(sheet.offsetHeight * scale + 32) + 'px';
}


/* --------------------------------------------------------------------------
   9. ЗАПУСК
   -------------------------------------------------------------------------- */
function init() {
  // 1) Рисуем все повторяющиеся строки листа
  buildAllRows();

  // 2) Загружаем сохранённых персонажей (или создаём первого)
  state = loadState();

  // 3) Слушаем изменения формы: любая правка → автосохранение
  const sheet = document.getElementById('sheet');
  sheet.addEventListener('input', scheduleSave);
  sheet.addEventListener('change', scheduleSave);
  sheet.addEventListener('submit', function (e) { e.preventDefault(); }); // Enter не «отправляет» форму

  // 4) Кнопки панели
  document.getElementById('btnNew').addEventListener('click', function () {
    addCharacter();
    const nameInput = sheet.querySelector('[data-field="name"]');
    if (nameInput) nameInput.focus();
    toast('Создан новый персонаж');
  });
  document.getElementById('btnDelete').addEventListener('click', deleteCurrent);
  document.getElementById('btnPrint').addEventListener('click', printSheet);
  document.getElementById('btnExport').addEventListener('click', exportCurrent);
  document.getElementById('btnImport').addEventListener('click', function () {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (file) importFromFile(file);
    e.target.value = '';   // чтобы можно было выбрать тот же файл повторно
  });
  document.getElementById('btnLink').addEventListener('click', copyShareLink);
  document.getElementById('btnHideBanner').addEventListener('click', function () {
    document.getElementById('sharedBanner').hidden = true;
  });

  selectEl.addEventListener('change', function () {
    showCharacter(selectEl.value);
  });

  // 5) Персонаж из ссылки (если есть) — перекрывает пустого первого
  const fromLink = readShareFromUrl();

  // 6) Показываем данные и подгоняем размер листа
  showCharacter(state.currentId);
  if (!fromLink) applyToForm(currentChar().fields);
  fitSheet();

  window.addEventListener('resize', fitSheet);
  // Печать может изменить раскладку — пересчитаем после неё
  window.addEventListener('afterprint', fitSheet);
}

// Запускаем, когда DOM полностью готов
document.addEventListener('DOMContentLoaded', init);
