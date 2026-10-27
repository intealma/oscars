(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  // Demon på GitHub Pages: märks som demo, visas inte i sökmotorer och beställningen skickas inte
  const demo = location.hostname.endsWith('github.io');
  if (demo) {
    root.classList.add('demo');
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.append(robots);
  }

  const DAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag'];
  const SHORT = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  const CUTOFF_HOUR = 9;
  const LUNCH_END_HOUR = 14;
  const MIN_PERSONS = 5;
  const STORE = 'oscar-bestallning';
  const CONTACT = 'oscar-kontakt';

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat läge */ } },
  };

  /* ---------- Datum ---------- */

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const isWeekday = (d) => d.getDay() > 0 && d.getDay() < 6;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = (d) => cap(d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }));
  const kr = (n) => `${n.toLocaleString('sv-SE')} kr`;

  function nextWeekday(d) {
    let x = d;
    while (!isWeekday(x)) x = addDays(x, 1);
    return x;
  }

  // Första dag lunchcatering kan levereras: idag före 09:00, annars nästa vardag
  function earliestLunchDate(now = new Date()) {
    const today = startOfDay(now);
    if (isWeekday(today) && now.getHours() < CUTOFF_HOUR) return today;
    return nextWeekday(addDays(today, 1));
  }

  function isoWeekMonday(week, year) {
    const jan4 = new Date(year, 0, 4);
    const monday1 = addDays(jan4, -((jan4.getDay() + 6) % 7));
    return addDays(monday1, (week - 1) * 7);
  }

  /* ---------- Veckans luncher från veckans-luncher.txt ---------- */

  function parseWeek(text) {
    const blocks = [];
    let block = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith('#')) continue;
      if (!line) {
        if (block.length) blocks.push(block);
        block = [];
      } else {
        block.push(line);
      }
    }
    if (block.length) blocks.push(block);

    const week = { label: '', number: null, prices: [], days: [], extras: [] };
    for (const b of blocks) {
      const wk = /^v\.?\s*(\d{1,2})$/i.exec(b[0]);
      const dayIndex = DAYS.indexOf(b[0].toLowerCase());
      if (wk && !week.label) {
        week.label = b[0];
        week.number = +wk[1];
        week.prices = b.slice(1);
      } else if (dayIndex >= 0) {
        week.days.push({ index: dayIndex, name: b[0], dishes: b.slice(1) });
      } else {
        week.extras.push({ name: b[0], dishes: b.slice(1) });
      }
    }
    if (week.number) {
      // Välj det år där vecka N ligger närmast idag
      const now = new Date();
      const candidates = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => isoWeekMonday(week.number, y));
      const monday = candidates.sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
      week.days.forEach((d) => { d.date = addDays(monday, d.index); });
    }
    week.wok = week.extras.find((e) => /wok/i.test(e.name)) || null;
    return week;
  }

  const dayFor = (date) => menuWeek && date && menuWeek.days.find((d) => d.date && iso(d.date) === iso(date));

  // Alternativ 1-3 i lunchcateringen är dagens två rätter och veckans wok
  function dagensNames(date) {
    const day = dayFor(date);
    if (!day) return null;
    return [day.dishes[0], day.dishes[1], menuWeek.wok ? menuWeek.wok.dishes.join(', ') : null];
  }

  function renderWeek() {
    if (!menuWeek || !menuWeek.days.length) return;
    $$('[data-week]').forEach((el) => { el.textContent = menuWeek.label; });
    $$('[data-price]').forEach((el) => {
      const text = menuWeek.prices[+el.dataset.price];
      el.textContent = text || '';
      el.hidden = !text;
    });

    const today = startOfDay(new Date());
    const list = $('[data-days]');
    list.replaceChildren(...menuWeek.days.map((d) => {
      const li = el('li', 'day');
      const isToday = d.date && iso(d.date) === iso(today);
      if (d.date && d.date < today) li.classList.add('is-past');
      if (isToday) li.classList.add('is-today');
      const name = el('p', 'day-name', d.name);
      if (isToday) name.append(el('span', 'day-badge', 'IDAG'));
      const dishes = el('ul', 'day-dishes');
      d.dishes.forEach((t) => dishes.append(el('li', '', t)));
      li.append(name, dishes);
      return li;
    }));

    if (menuWeek.wok) {
      $('[data-wok]').hidden = false;
      $('.wok-label').textContent = menuWeek.wok.name;
      $('[data-wok-dish]').textContent = menuWeek.wok.dishes.join(', ');
    }

    // Kortet i toppen: dagens lunch, eller nästa vardag när lunchen är slut för dagen
    const now = new Date();
    let target = startOfDay(now);
    if (!isWeekday(target) || now.getHours() >= LUNCH_END_HOUR) target = nextWeekday(addDays(target, 1));
    const show = menuWeek.days.find((d) => d.date && d.date >= target);
    if (show) {
      $('[data-today-day]').textContent = show.name;
      $('[data-today-dishes]').replaceChildren(...show.dishes.map((t) => el('li', '', t)));
      const wok = $('[data-today-wok]');
      if (menuWeek.wok) {
        wok.replaceChildren(el('span', '', menuWeek.wok.name), document.createTextNode(menuWeek.wok.dishes.join(', ')));
      } else {
        wok.hidden = true;
      }
      $('[data-today]').hidden = false;
    }
  }

  /* ---------- Hjälpare ---------- */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- Varukorg ---------- */

  let catalog = null;
  let menuWeek = null;
  const items = new Map();
  const saved = store.get(STORE) || {};
  const state = {
    cart: saved.cart && typeof saved.cart === 'object' ? saved.cart : {},
    date: saved.date || '',
    tid: saved.tid || '',
  };
  const save = () => store.set(STORE, state);

  const groupOf = (id) => catalog.grupper[items.get(id).grupp];
  const lines = () => Object.entries(state.cart).filter(([id, n]) => items.has(id) && n > 0);
  const hasType = (typ) => lines().some(([id]) => groupOf(id).typ === typ);
  const totalSum = () => lines().reduce((s, [id, n]) => s + n * items.get(id).pris, 0);
  const totalCount = () => lines().reduce((s, [, n]) => s + n, 0);
  const lunchPersons = () => lines()
    .filter(([id]) => groupOf(id).typ === 'vardag')
    .reduce((s, [id, n]) => s + n * (groupOf(id).personer || 1), 0);

  function itemName(id) {
    const it = items.get(id);
    if (it.id.startsWith('dagens')) {
      const names = dagensNames(fromIso(state.date));
      const name = names && names[+it.id.slice(-1) - 1];
      if (name) return name;
    }
    return it.namn;
  }

  function setQty(id, n) {
    n = Math.max(0, Math.min(999, Math.round(+n || 0)));
    if (n) state.cart[id] = n; else delete state.cart[id];
    save();
    update();
  }

  function qtyControl(id, unit, small) {
    const it = items.get(id);
    const box = el('div', 'qty' + (small ? ' qty-sm' : ''));
    box.dataset.qty = id;
    const add = el('button', 'qty-add', 'Lägg till');
    add.type = 'button';
    add.dataset.add = '';
    const step = el('div', 'qty-step');
    const minus = el('button', '', '−');
    minus.type = 'button';
    minus.dataset.step = '-1';
    minus.setAttribute('aria-label', 'Färre');
    const input = el('input');
    input.type = 'number';
    input.min = '0';
    input.max = '999';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', `Antal ${it.id.startsWith('dagens') ? it.alt : it.namn}`);
    const plus = el('button', '', '+');
    plus.type = 'button';
    plus.dataset.step = '1';
    plus.setAttribute('aria-label', 'Fler');
    step.append(minus, input, plus);
    box.append(add, step);
    if (unit) box.append(el('span', 'qty-unit', unit));
    return box;
  }

  /* ---------- Cateringkorten ---------- */

  function productCard(it) {
    const card = el('article', 'card');
    card.dataset.card = it.id;
    if (it.bild) {
      const img = el('img', 'card-img');
      img.src = it.bild;
      img.alt = it.namn;
      img.width = 273;
      img.height = 198;
      img.loading = 'lazy';
      card.append(img);
    }
    const body = el('div', 'card-body');
    if (it.alt) body.append(el('p', 'card-alt', it.alt));
    body.append(el('h4', 'card-name', it.namn));
    const foot = el('div', 'card-foot');
    foot.append(el('p', 'price', it.prisText), qtyControl(it.id));
    body.append(foot);
    card.append(body);
    return card;
  }

  function dagensCard() {
    const d = catalog.dagens;
    const card = el('article', 'card card-dagens');
    const img = el('img', 'card-img');
    img.src = d.bild;
    img.alt = 'Dagens';
    img.width = 273;
    img.height = 198;
    card.append(img);
    const body = el('div', 'card-body');
    body.append(el('p', 'card-alt', d.alt));
    const name = el('h4', 'card-name');
    const link = el('a', '', d.namn);
    link.href = '#veckans-luncher';
    name.append(link);
    const day = el('p', 'dagens-day');
    day.dataset.dagensDay = '';
    body.append(name, el('p', 'price', d.prisText), day);
    const list = el('ul', 'dagens');
    list.dataset.dagens = '';
    ['dagens1', 'dagens2', 'dagens3'].forEach((id) => {
      const li = el('li');
      li.dataset.dagensRow = id;
      const label = el('span', 'dagens-name');
      label.append(el('small', '', items.get(id).alt), el('span', '', ''));
      li.append(label, qtyControl(id, '', true));
      list.append(li);
    });
    body.append(list);
    card.append(body);
    return card;
  }

  function menuCard(it) {
    const card = el('article', 'card menu-card');
    card.dataset.card = it.id;
    const head = el('div', 'menu-head');
    if (it.bild) {
      const img = el('img', 'card-img');
      img.src = it.bild;
      img.alt = it.namn;
      img.width = 273;
      img.height = 198;
      img.loading = 'lazy';
      head.append(img);
    }
    const headText = el('div', 'menu-head-text');
    headText.append(el('h4', 'card-name', it.namn), el('p', 'price', it.prisText));
    head.append(headText);
    card.append(head);
    const body = el('div', 'card-body');
    it.innehall.forEach((course, i) => {
      if (i) body.append(el('p', 'menu-x', 'x'));
      const ul = el('ul', 'menu-items' + (course.length > 10 ? ' is-long' : ''));
      course.forEach((t) => ul.append(el('li', '', t)));
      body.append(ul);
    });
    if (it.not) body.append(el('p', 'menu-note', it.not));
    const foot = el('div', 'card-foot');
    if (it.pdf) {
      const a = el('a', 'link-pdf menu-pdf', 'PDF');
      a.href = it.pdf;
      foot.append(a);
    } else {
      foot.append(el('span'));
    }
    foot.append(qtyControl(it.id, 'pers'));
    body.append(foot);
    card.append(body);
    return card;
  }

  function renderCatalog() {
    catalog.rader.forEach((it) => items.set(it.id, it));
    // Gamla rader i varukorgen som inte längre finns i menyn
    Object.keys(state.cart).forEach((id) => { if (!items.has(id)) delete state.cart[id]; });

    const byGroup = (g) => catalog.rader.filter((it) => it.grupp === g && !it.id.startsWith('dagens'));
    $('[data-grid="lunch"]').replaceChildren(dagensCard(), ...byGroup('lunch').map(productCard));
    $('[data-grid="baguetter"]').replaceChildren(...byGroup('baguetter').map(productCard));
    $('[data-grid="pajer"]').replaceChildren(...byGroup('pajer').map(productCard));
    $('[data-grid="ovrig"]').replaceChildren(...byGroup('ovrig').map(menuCard));
    $('[data-grid="jul"]').replaceChildren(...byGroup('jul').map(menuCard));
  }

  /* ---------- Leveransdag ---------- */

  function validDate() {
    const d = fromIso(state.date);
    const today = startOfDay(new Date());
    if (!d || d < today) return false;
    if (hasType('vardag') && (!isWeekday(d) || d < earliestLunchDate())) return false;
    return true;
  }

  function ensureDate() {
    if (!validDate()) {
      state.date = iso(hasType('forfragan') && !hasType('vardag') ? addDays(startOfDay(new Date()), 1) : earliestLunchDate());
      save();
    }
  }

  function renderDayPick() {
    const box = $('[data-daypick]');
    const first = earliestLunchDate();
    const days = [];
    for (let d = first; days.length < 5; d = addDays(d, 1)) if (isWeekday(d)) days.push(d);
    box.replaceChildren(...days.map((d) => {
      const b = el('button', 'chip');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.date = iso(d);
      b.setAttribute('aria-label', longDate(d));
      b.append(el('span', '', SHORT[d.getDay()]), el('b', '', `${d.getDate()}/${d.getMonth() + 1}`));
      return b;
    }));
  }

  /* ---------- Uppdatera allt som visar varukorgen ---------- */

  function update() {
    if (!catalog) return;
    ensureDate();

    $$('[data-qty]').forEach((box) => {
      const n = state.cart[box.dataset.qty] || 0;
      box.classList.toggle('has', n > 0);
      const input = $('input', box);
      if (document.activeElement !== input) input.value = n;
    });
    $$('[data-card]').forEach((card) => card.classList.toggle('is-picked', (state.cart[card.dataset.card] || 0) > 0));

    const names = dagensNames(fromIso(state.date));
    $$('[data-dagens-row]').forEach((row) => {
      const i = +row.dataset.dagensRow.slice(-1) - 1;
      const name = names ? names[i] : catalog.dagens.namn;
      row.hidden = names ? !name : false;
      $('.dagens-name span', row).textContent = name || '';
    });
    $$('[data-dagens-day]').forEach((p) => { p.textContent = names ? longDate(fromIso(state.date)) : ''; p.hidden = !names; });
    const dagensPicked = ['dagens1', 'dagens2', 'dagens3'].some((id) => state.cart[id]);
    const dagensCardEl = $('.card-dagens');
    if (dagensCardEl) dagensCardEl.classList.toggle('is-picked', dagensPicked);

    $$('[data-daypick] .chip').forEach((chip) => chip.setAttribute('aria-checked', String(chip.dataset.date === state.date)));

    const count = totalCount();
    $$('[data-cart-count]').forEach((c) => { c.textContent = count; c.hidden = !count; });
    $$('[data-tab-btn]').forEach((tab) => {
      const g = tab.dataset.tabBtn;
      const n = lines().filter(([id]) => items.get(id).grupp === g).reduce((s, [, q]) => s + q, 0);
      let badge = $('.tab-n', tab);
      if (n && !badge) { badge = el('span', 'tab-n'); tab.append(badge); }
      if (badge) { badge.textContent = n; badge.hidden = !n; }
    });

    const bar = $('[data-orderbar]');
    bar.hidden = !count || !drawer.hidden;
    $('[data-bar-count]').textContent = `${count} st`;
    $('[data-bar-total]').textContent = kr(totalSum());

    if (!drawer.hidden && currentStep !== 3) renderDrawer();
  }

  /* ---------- Beställningen ---------- */

  const drawer = $('[data-drawer]');
  const form = $('[data-order-form]');
  let currentStep = 1;
  let lastFocus = null;

  function renderLines(box, cart, withControls) {
    const order = Object.keys(catalog.grupper);
    const groups = order
      .map((g) => [g, Object.entries(cart).filter(([id, n]) => n > 0 && items.has(id) && items.get(id).grupp === g)])
      .filter(([, rows]) => rows.length);
    box.replaceChildren(...groups.map(([g, rows]) => {
      const wrap = el('div');
      wrap.append(el('p', 'line-group', catalog.grupper[g].namn));
      rows.forEach(([id, n]) => {
        const it = items.get(id);
        const line = el('div', 'line');
        const name = el('div', 'line-name', itemName(id));
        const meta = [it.id.startsWith('dagens') ? it.alt : null, it.prisText].filter(Boolean).join(' · ');
        name.append(el('small', '', withControls ? meta : `${n} × ${it.prisText}`));
        line.append(name);
        if (withControls) line.append(qtyControl(id, '', true));
        line.append(el('span', 'line-sum', kr(n * it.pris)));
        wrap.append(line);
      });
      return wrap;
    }));
  }

  function renderDrawer() {
    const empty = !lines().length;
    $('[data-empty]').hidden = !empty;
    $('[data-filled]').hidden = empty;
    if (empty) return;

    // Raderna byggs om vid varje ändring, så fokus flyttas tillbaka till samma knapp
    const active = document.activeElement;
    const activeBox = active && active.closest('[data-lines] [data-qty]');
    const refocus = activeBox && [activeBox.dataset.qty, active.dataset.step || 'input'];

    renderLines($('[data-lines]'), state.cart, true);
    $$('[data-lines] [data-qty]').forEach((box) => {
      const n = state.cart[box.dataset.qty] || 0;
      box.classList.toggle('has', n > 0);
      $('input', box).value = n;
    });
    if (refocus) {
      const box = $(`[data-lines] [data-qty="${refocus[0]}"]`);
      const target = box && (refocus[1] === 'input' ? $('input', box) : $(`[data-step="${refocus[1]}"]`, box));
      (target || $('.drawer-x')).focus();
    }
    $('[data-total]').textContent = kr(totalSum());

    const vardag = hasType('vardag');
    const forfragan = hasType('forfragan');
    const dateInput = $('[data-date-input]');
    dateInput.min = iso(vardag ? earliestLunchDate() : startOfDay(new Date()));
    dateInput.value = state.date;
    $('[data-vardag-hint]').hidden = !vardag;
    $('[data-tid-field]').hidden = !forfragan;
    form.tid.value = state.tid;
    $('[data-submit]').textContent = forfragan ? 'Skicka förfrågan' : 'Skicka beställning';
  }

  function step1Problem() {
    if (!lines().length) return 'Varukorgen är tom';
    const d = fromIso(state.date);
    if (!d) return 'Välj leveransdag';
    if (hasType('vardag')) {
      if (!isWeekday(d)) return 'Vi levererar luncher varje vardag till ditt företag ca kl 10:30-11:30';
      if (d < earliestLunchDate() || lunchPersons() < MIN_PERSONS) return 'Maila eller ring in din beställning senast kl 09:00 (minimum 5 personer)';
    } else if (d < startOfDay(new Date())) {
      return 'Välj leveransdag';
    }
    return '';
  }

  function summaryText() {
    const d = fromIso(state.date);
    const parts = [longDate(d)];
    if (hasType('vardag')) parts.push('ca kl 10:30-11:30');
    if (hasType('forfragan') && state.tid) parts.push(`kl ${state.tid}`);
    parts.push(`${totalCount()} st`, kr(totalSum()));
    return parts.join(' · ');
  }

  function goStep(n) {
    currentStep = n;
    $$('[data-step]', form).forEach((s) => { s.hidden = +s.dataset.step !== n; });
    $$('[data-step-label]').forEach((li) => {
      const k = +li.dataset.stepLabel;
      li.classList.toggle('is-done', k < n);
      if (k === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    $('[data-steps]').hidden = n === 3;
    if (n === 1) renderDrawer();
    if (n === 2) {
      $('[data-summary]').textContent = summaryText();
      $('[data-warn2]').hidden = true;
    }
    $('.drawer-form').scrollTop = 0;
  }

  function openOrder() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.classList.add('locked');
    closeNav();
    goStep(1);
    update();
    $('.drawer-x').focus();
  }

  function closeOrder() {
    drawer.hidden = true;
    document.body.classList.remove('locked');
    $('[data-warn]').hidden = true;
    update();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function prefillContact() {
    const c = store.get(CONTACT);
    if (!c) return;
    ['namn', 'foretag', 'telefon', 'epost', 'adress'].forEach((k) => { if (c[k] && !form[k].value) form[k].value = c[k]; });
  }

  async function submitOrder() {
    const warn = $('[data-warn2]');
    warn.hidden = true;
    const need = ['namn', 'telefon', 'epost', 'adress'];
    let bad = null;
    need.forEach((k) => {
      const input = form[k];
      const ok = input.value.trim() && (k !== 'epost' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim()));
      input.setAttribute('aria-invalid', String(!ok));
      if (!ok && !bad) bad = input;
    });
    if (bad) { bad.focus(); return; }
    if (!form.samtycke.checked) {
      warn.textContent = 'Kryssa i rutan för att skicka.';
      warn.hidden = false;
      return;
    }
    const problem = step1Problem();
    if (problem) { goStep(1); showWarn(problem); return; }

    const forfragan = hasType('forfragan');
    const payload = {
      datum: state.date,
      tid: forfragan ? state.tid : '',
      rader: lines().map(([id, n]) => ({ id, antal: n, namn: id.startsWith('dagens') ? itemName(id) : undefined })),
      namn: form.namn.value.trim(),
      foretag: form.foretag.value.trim(),
      telefon: form.telefon.value.trim(),
      epost: form.epost.value.trim(),
      adress: form.adress.value.trim(),
      meddelande: form.meddelande.value.trim(),
      samtycke: 'ja',
      webbplats: form.webbplats.value,
    };

    const btn = $('[data-submit]');
    btn.disabled = true;
    let ref = '';
    try {
      if (demo) {
        ref = 'DEMO';
      } else {
        const res = await fetch('send.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.fel || res.status);
        ref = data.ref || '';
      }
    } catch (err) {
      warn.textContent = 'Det gick inte att skicka. Ring 013-31 30 20 eller maila restaurangoscars@gmail.com.';
      warn.hidden = false;
      btn.disabled = false;
      return;
    }
    btn.disabled = false;

    store.set(CONTACT, { namn: payload.namn, foretag: payload.foretag, telefon: payload.telefon, epost: payload.epost, adress: payload.adress });
    const done = { ...state.cart };
    $('[data-done-title]').textContent = forfragan ? 'Förfrågan är skickad' : 'Beställningen är skickad';
    $('[data-done-ref]').textContent = [ref, summaryText()].filter(Boolean).join(' · ');
    renderLines($('[data-done-lines]'), done, false);
    state.cart = {};
    form.meddelande.value = '';
    form.samtycke.checked = false;
    save();
    goStep(3);
    update();
  }

  function showWarn(text) {
    const w = $('[data-warn]');
    w.textContent = text;
    w.hidden = !text;
  }

  /* ---------- Flikar ---------- */

  function showTab(name, focus) {
    $$('[data-tab-btn]').forEach((tab) => {
      const on = tab.dataset.tabBtn === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
      if (on) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    markNav();
  }

  /* ---------- Menyn i toppen ---------- */

  const nav = $('#nav');
  const menuBtn = $('.menu-btn');
  function closeNav() {
    nav.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  menuBtn.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  let activeSection = 'hem';
  function markNav() {
    const tab = ($('[data-tab-btn][aria-selected="true"]') || {}).dataset?.tabBtn;
    $$('.nav a').forEach((a) => {
      let on = a.getAttribute('href') === `#${activeSection}`;
      if (on && activeSection === 'catering') on = (a.dataset.tab === 'jul') === (tab === 'jul');
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { activeSection = e.target.id; markNav(); } });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id]').forEach((s) => io.observe(s));
  }

  /* ---------- Händelser ---------- */

  document.addEventListener('click', (e) => {
    const t = e.target;
    const tabLink = t.closest('[data-tab]');
    if (tabLink) showTab(tabLink.dataset.tab);
    if (t.closest('.nav a')) closeNav();

    const tabBtn = t.closest('[data-tab-btn]');
    if (tabBtn) showTab(tabBtn.dataset.tabBtn);

    const chip = t.closest('[data-daypick] .chip');
    if (chip) { state.date = chip.dataset.date; save(); update(); }

    const add = t.closest('[data-add]');
    if (add) {
      const box = add.closest('[data-qty]');
      setQty(box.dataset.qty, 1);
      // Menyer per person: skriv antalet direkt i stället för att klicka upp till 30
      const target = $('.qty-unit', box) ? $('input', box) : $('[data-step="1"]', box);
      target.focus();
      if (target.select) target.select();
    }
    const stepBtn = t.closest('[data-step]');
    if (stepBtn && stepBtn.closest('[data-qty]')) {
      const id = stepBtn.closest('[data-qty]').dataset.qty;
      setQty(id, (state.cart[id] || 0) + +stepBtn.dataset.step);
    }

    if (t.closest('[data-open-order]')) openOrder();
    if (t.closest('[data-close-order]')) closeOrder();

    if (t.closest('[data-next]')) {
      const problem = step1Problem();
      showWarn(problem);
      if (!problem) { prefillContact(); goStep(2); form.namn.focus(); }
    }
    if (t.closest('[data-back]')) goStep(1);
  });

  document.addEventListener('change', (e) => {
    const box = e.target.closest('[data-qty]');
    if (box && e.target.matches('input')) setQty(box.dataset.qty, e.target.value);
    if (e.target.matches('[data-date-input]')) { state.date = e.target.value; save(); showWarn(''); update(); }
    if (e.target.name === 'tid') { state.tid = e.target.value; save(); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') e.target.removeAttribute('aria-invalid');
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); submitOrder(); });

  $('[role="tablist"]').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = $$('[data-tab-btn]');
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    showTab(tabs[next].dataset.tabBtn, true);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!drawer.hidden) closeOrder();
      else closeNav();
    }
    if (e.key === 'Tab' && !drawer.hidden) {
      const f = $$('button:not([disabled]), a[href], input:not([tabindex="-1"]), textarea', $('.drawer-box')).filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- Start ---------- */

  Promise.all([
    fetch('meny.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('veckans-luncher.txt', { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
  ]).then(([menu, week]) => {
    catalog = menu;
    menuWeek = week ? parseWeek(week) : null;
    renderWeek();
    renderCatalog();
    renderDayPick();
    update();
  }).catch(() => {
    $$('[data-grid]').forEach((g) => {
      const p = el('p', '', 'Ring 013-31 30 20 eller maila ');
      const a = el('a', '', 'restaurangoscars@gmail.com');
      a.href = 'mailto:restaurangoscars@gmail.com';
      p.append(a);
      g.replaceChildren(p);
    });
  });
})();
