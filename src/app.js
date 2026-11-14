/**
 * UI controller: wires the static markup in index.html to the pool domain
 * logic, persistence and geolocation. Dependencies are injected so the
 * controller can be exercised in tests with a fake DOM and storage.
 */

import { h, icon } from './dom.js';
import { formatCurrency, formatPhone, formatTime, plural } from './format.js';
import { describeLocation, getPosition, loadGeocoder } from './geolocation.js';
import {
  MAX_SEATS,
  PoolError,
  createPool,
  farePerSeat,
  farePerSeatAfterJoin,
  hostOf,
  isFull,
  joinPool,
  leavePool,
  minimumFarePerSeat,
  seatsLeft,
  seatsTaken,
  sortPools,
} from './pool.js';
import { samplePools } from './sample-data.js';
import { emptyState, loadState, saveState } from './storage.js';
import { validateJoinForm, validatePoolForm } from './validation.js';

const THEME_KEY = 'rideshare:theme';

/**
 * @param {object} deps
 * @param {Document} deps.root
 * @param {Storage | undefined} deps.storage
 * @param {Geolocation | undefined} deps.geolocation
 * @param {string | undefined} deps.mapsApiKey
 */
export function createApp({ root, storage, geolocation, mapsApiKey }) {
  const $ = (id) => /** @type {HTMLElement} */ (root.getElementById(id));

  const els = {
    poolForm: /** @type {HTMLFormElement} */ ($('poolForm')),
    partySize: /** @type {HTMLInputElement} */ ($('partySize')),
    partySizeValue: $('partySizeValue'),
    farePreview: $('farePreview'),
    locateBtn: /** @type {HTMLButtonElement} */ ($('locateBtn')),
    pickup: /** @type {HTMLInputElement} */ ($('pickup')),
    tabs: [$('tab-available'), $('tab-mine')],
    panels: { available: $('panel-available'), mine: $('panel-mine') },
    availableList: $('availableList'),
    mineList: $('mineList'),
    availableCount: $('availableCount'),
    mineCount: $('mineCount'),
    joinDialog: /** @type {HTMLDialogElement} */ ($('joinDialog')),
    joinForm: /** @type {HTMLFormElement} */ ($('joinForm')),
    joinRoute: $('joinRoute'),
    joinSeats: /** @type {HTMLSelectElement} */ ($('joinSeats')),
    joinPreview: $('joinPreview'),
    detailsDialog: /** @type {HTMLDialogElement} */ ($('detailsDialog')),
    detailsTitle: $('detailsTitle'),
    detailsBody: $('detailsBody'),
    confirmDialog: /** @type {HTMLDialogElement} */ ($('confirmDialog')),
    confirmTitle: $('confirmTitle'),
    confirmMessage: $('confirmMessage'),
    confirmOk: $('confirmOk'),
    toaster: $('toaster'),
    themeToggle: $('themeToggle'),
  };

  let state = loadState(storage);
  /** @type {'available' | 'mine'} */
  let activeTab = Object.keys(state.mine).length > 0 ? 'mine' : 'available';
  /** @type {string | null} */
  let joiningPoolId = null;

  // ---------------------------------------------------------------------------
  // State

  function commit(next) {
    state = next;
    if (!saveState(storage, state)) {
      toast('Could not save to this browser. Your pools will be lost on refresh.', 'error');
    }
    render();
  }

  const poolById = (id) => state.pools.find((pool) => pool.id === id);
  const replacePool = (pool) => state.pools.map((p) => (p.id === pool.id ? pool : p));

  // ---------------------------------------------------------------------------
  // Rendering

  function render() {
    const pools = sortPools(state.pools);
    const mine = pools.filter((pool) => state.mine[pool.id]);
    const available = pools.filter((pool) => !state.mine[pool.id]);

    els.availableCount.textContent = String(available.length);
    els.mineCount.textContent = String(mine.length);

    els.availableList.replaceChildren(
      ...(available.length
        ? available.map((pool) => listItem(poolCard(pool, null)))
        : [listItem(availableEmptyState())]),
    );
    els.mineList.replaceChildren(
      ...(mine.length
        ? mine.map((pool) => listItem(poolCard(pool, state.mine[pool.id])))
        : [listItem(mineEmptyState())]),
    );
    renderTabs();
  }

  const listItem = (child) => h('li', null, child);

  function renderTabs() {
    for (const tab of els.tabs) {
      const selected = tab.id === `tab-${activeTab}`;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    els.panels.available.hidden = activeTab !== 'available';
    els.panels.mine.hidden = activeTab !== 'mine';
  }

  function seatDots(pool) {
    const taken = seatsTaken(pool);
    return h(
      'span',
      { class: 'seat-dots', 'aria-hidden': 'true' },
      ...Array.from({ length: pool.capacity }, (_, i) =>
        h('span', { class: `seat-dot${i < taken ? ' is-taken' : ''}` }),
      ),
    );
  }

  /**
   * @param {import('./pool.js').Pool} pool
   * @param {'host' | 'rider' | null} role  This device's role in the pool.
   */
  function poolCard(pool, role) {
    const left = seatsLeft(pool);
    const full = isFull(pool);
    const host = hostOf(pool);
    const titleId = `pool-${pool.id}-title`;

    let status;
    if (role === 'host') status = h('span', { class: 'chip chip-accent' }, 'Hosting');
    else if (role === 'rider') status = h('span', { class: 'chip chip-success' }, 'Joined');
    else if (full) status = h('span', { class: 'chip chip-muted' }, 'Full');

    const actions = [];
    if (role) {
      actions.push(
        h(
          'button',
          { type: 'button', class: 'btn btn-secondary', onclick: () => openDetails(pool.id) },
          icon('users'),
          'Details',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost btn-danger-text',
            onclick: () => (role === 'host' ? cancelPool(pool.id) : leave(pool.id)),
          },
          role === 'host' ? 'Cancel pool' : 'Leave',
        ),
      );
    } else {
      actions.push(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary',
            disabled: full,
            'aria-describedby': titleId,
            onclick: () => openJoin(pool.id),
          },
          full ? 'Pool full' : 'Join pool',
        ),
      );
    }

    return h(
      'article',
      { class: `card pool-card${full ? ' is-full' : ''}`, 'aria-labelledby': titleId },
      h(
        'header',
        { class: 'pool-card-header' },
        h(
          'div',
          { class: 'pool-when' },
          h(
            'p',
            { class: 'pool-time' },
            icon('clock'),
            h('time', { datetime: pool.time }, formatTime(pool.time)),
          ),
          status,
        ),
        h(
          'p',
          { class: 'pool-fare' },
          h('span', { class: 'pool-fare-amount' }, formatCurrency(farePerSeat(pool))),
          h('span', { class: 'pool-fare-unit' }, ' / seat'),
        ),
      ),
      h(
        'h3',
        { class: 'route', id: titleId },
        h(
          'span',
          { class: 'route-stop' },
          icon('pin', 'icon route-icon'),
          h('span', null, pool.pickup),
        ),
        h('span', { class: 'visually-hidden' }, ' to '),
        h(
          'span',
          { class: 'route-stop' },
          icon('flag', 'icon route-icon'),
          h('span', null, pool.drop),
        ),
      ),
      h(
        'div',
        { class: 'pool-meta' },
        h('span', { class: 'pool-host' }, icon('user'), `Hosted by ${host.name}`),
        h(
          'span',
          { class: 'pool-seats' },
          seatDots(pool),
          full ? 'No seats left' : `${plural(left, 'seat')} left of ${pool.capacity}`,
        ),
      ),
      full
        ? null
        : h(
            'p',
            { class: 'pool-hint' },
            `Total ${formatCurrency(pool.fare)} · drops to ${formatCurrency(minimumFarePerSeat(pool))}/seat when full`,
          ),
      h('div', { class: 'pool-actions' }, ...actions),
    );
  }

  function availableEmptyState() {
    const hasAny = state.pools.length > 0;
    return h(
      'div',
      { class: 'empty-state' },
      h('span', { class: 'empty-icon' }, icon('car')),
      h('h3', null, hasAny ? 'No other pools right now' : 'No pools yet'),
      h(
        'p',
        null,
        hasAny
          ? 'Every pool here is one you are already in. Check “Your rides”.'
          : 'Create a pool with the form, or load a few sample pools to try joining one.',
      ),
      h(
        'button',
        { type: 'button', class: 'btn btn-secondary', onclick: loadSamples },
        icon('sparkles'),
        'Load sample pools',
      ),
    );
  }

  function mineEmptyState() {
    return h(
      'div',
      { class: 'empty-state' },
      h('span', { class: 'empty-icon' }, icon('users')),
      h('h3', null, 'No rides yet'),
      h('p', null, 'Pools you create or join will appear here.'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: () => root.getElementById('pickup')?.focus(),
        },
        'Offer a ride',
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Feedback

  /** @param {'success' | 'error' | 'info'} kind */
  function toast(message, kind = 'success') {
    const el = h(
      'div',
      { class: `toast toast-${kind}` },
      icon(kind === 'error' ? 'alert' : 'check'),
      h('span', null, message),
    );
    els.toaster.append(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 250);
    }, 4000);
  }

  /**
   * Shows or clears inline errors. Field ids follow `${prefix}${Name}` and
   * error paragraphs `${fieldId}-error`.
   * @param {HTMLFormElement} form
   * @param {Record<string, string>} errors
   * @param {(field: string) => string} idFor
   */
  function showErrors(form, errors, idFor) {
    let first = null;
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    for (const [field, message] of Object.entries(errors)) {
      const id = idFor(field);
      const errorEl = root.getElementById(`${id}-error`);
      if (errorEl) errorEl.textContent = message;
      const input = root.getElementById(id);
      if (input && input.tagName !== 'OUTPUT') input.setAttribute('aria-invalid', 'true');
      first ??= input;
    }
    if (first?.type === 'hidden') first = form.querySelector('[data-step]');
    first?.focus();
  }

  // ---------------------------------------------------------------------------
  // Create pool form

  function setPartySize(value) {
    const next = Math.min(Math.max(value, 1), MAX_SEATS - 1);
    els.partySize.value = String(next);
    els.partySizeValue.textContent = String(next);
    for (const btn of els.poolForm.querySelectorAll('[data-step]')) {
      const step = Number(/** @type {HTMLElement} */ (btn).dataset.step);
      /** @type {HTMLButtonElement} */ (btn).disabled =
        (step < 0 && next <= 1) || (step > 0 && next >= MAX_SEATS - 1);
    }
    updateFarePreview();
  }

  function updateFarePreview() {
    const fare = Number(new FormData(els.poolForm).get('fare'));
    const party = Number(els.partySize.value);
    if (!Number.isFinite(fare) || fare <= 0) {
      els.farePreview.hidden = true;
      return;
    }
    els.farePreview.hidden = false;
    els.farePreview.replaceChildren(
      'Your party pays between ',
      h('strong', null, formatCurrency((fare / MAX_SEATS) * party)),
      ' and ',
      h('strong', null, formatCurrency(fare)),
      ', depending on how many riders join.',
    );
  }

  function onCreatePool(event) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(els.poolForm));
    const { values, errors } = validatePoolForm(raw);
    showErrors(els.poolForm, errors, (field) => field);
    if (Object.keys(errors).length) return;

    const pool = createPool(values);
    commit({
      pools: [...state.pools, pool],
      mine: { ...state.mine, [pool.id]: 'host' },
      myPhones: { ...state.myPhones, [pool.id]: values.host.phone },
    });

    els.poolForm.reset();
    setPartySize(1);
    activeTab = 'mine';
    renderTabs();
    revealLists();
    toast('Pool created. Share it with riders heading your way.');
  }

  async function onLocate() {
    const btn = els.locateBtn;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-label', 'Finding your location…');
    btn.replaceChildren(icon('loader', 'icon spin'));
    try {
      const [coords, geocoder] = await Promise.all([
        getPosition(geolocation),
        loadGeocoder(mapsApiKey),
      ]);
      els.pickup.value = await describeLocation(geocoder, coords);
      els.pickup.dispatchEvent(new Event('input', { bubbles: true }));
      toast('Pickup set to your current location.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not get your location.', 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.setAttribute('aria-label', 'Use my current location');
      btn.replaceChildren(icon('crosshair'));
    }
  }

  // ---------------------------------------------------------------------------
  // Join / details / leave

  function openJoin(poolId) {
    const pool = poolById(poolId);
    if (!pool) return;
    joiningPoolId = poolId;
    els.joinForm.reset();
    showErrors(els.joinForm, {}, () => '');
    els.joinRoute.replaceChildren(
      h('strong', null, `${pool.pickup} → ${pool.drop}`),
      h('br'),
      `${formatTime(pool.time)} · hosted by ${hostOf(pool).name}`,
    );
    els.joinSeats.replaceChildren(
      ...Array.from({ length: seatsLeft(pool) }, (_, i) =>
        h('option', { value: i + 1 }, plural(i + 1, 'seat')),
      ),
    );
    updateJoinPreview();
    openDialog(els.joinDialog);
  }

  function updateJoinPreview() {
    const pool = joiningPoolId && poolById(joiningPoolId);
    if (!pool) return;
    const seats = Number(els.joinSeats.value) || 1;
    const perSeat = farePerSeatAfterJoin(pool, seats);
    els.joinPreview.replaceChildren(
      'Fare drops to ',
      h('strong', null, `${formatCurrency(perSeat)}/seat`),
      ` for everyone. You pay ${formatCurrency(perSeat * seats)}.`,
    );
  }

  function onJoin(event) {
    event.preventDefault();
    const pool = joiningPoolId && poolById(joiningPoolId);
    if (!pool) {
      closeDialog(els.joinDialog);
      return;
    }
    const raw = Object.fromEntries(new FormData(els.joinForm));
    const { values, errors } = validateJoinForm(raw, seatsLeft(pool));
    const idFor = (field) => ({ name: 'joinName', phone: 'joinPhone', seats: 'joinSeats' })[field];
    showErrors(els.joinForm, errors, idFor);
    if (Object.keys(errors).length) return;

    try {
      const updated = joinPool(pool, values);
      commit({
        pools: replacePool(updated),
        mine: { ...state.mine, [pool.id]: 'rider' },
        myPhones: { ...state.myPhones, [pool.id]: values.phone },
      });
      closeDialog(els.joinDialog);
      activeTab = 'mine';
      renderTabs();
      toast(`You're in! Your fare is now ${formatCurrency(farePerSeat(updated) * values.seats)}.`);
    } catch (error) {
      if (error instanceof PoolError) {
        const field = error.code === 'ALREADY_JOINED' ? 'phone' : 'seats';
        showErrors(els.joinForm, { [field]: error.message }, idFor);
      } else {
        throw error;
      }
    }
  }

  function openDetails(poolId) {
    const pool = poolById(poolId);
    if (!pool) return;
    els.detailsTitle.textContent = `${formatTime(pool.time)} ride`;
    const perSeat = farePerSeat(pool);
    els.detailsBody.replaceChildren(
      h('p', { class: 'dialog-route' }, h('strong', null, `${pool.pickup} → ${pool.drop}`)),
      h(
        'dl',
        { class: 'summary' },
        h('div', null, h('dt', null, 'Total fare'), h('dd', null, formatCurrency(pool.fare))),
        h('div', null, h('dt', null, 'Per seat'), h('dd', null, formatCurrency(perSeat))),
        h(
          'div',
          null,
          h('dt', null, 'Seats'),
          h('dd', null, `${seatsTaken(pool)} of ${pool.capacity}`),
        ),
      ),
      h('h3', { class: 'subheading' }, 'Riders'),
      h(
        'ul',
        { class: 'rider-list' },
        ...pool.riders.map((rider) =>
          h(
            'li',
            { class: 'rider' },
            h(
              'span',
              { class: 'avatar', 'aria-hidden': 'true' },
              rider.name.charAt(0).toUpperCase(),
            ),
            h(
              'div',
              { class: 'rider-info' },
              h(
                'p',
                { class: 'rider-name' },
                rider.name,
                rider.role === 'host' ? h('span', { class: 'chip chip-accent' }, 'Host') : null,
                state.myPhones[pool.id] === rider.phone
                  ? h('span', { class: 'chip chip-muted' }, 'You')
                  : null,
              ),
              h(
                'p',
                { class: 'rider-sub' },
                `${plural(rider.seats, 'seat')} · pays ${formatCurrency(perSeat * rider.seats)}`,
              ),
            ),
            h(
              'a',
              {
                class: 'btn btn-icon btn-secondary',
                href: `tel:${rider.phone}`,
                'aria-label': `Call ${rider.name} on ${formatPhone(rider.phone)}`,
              },
              icon('phone'),
            ),
          ),
        ),
      ),
    );
    openDialog(els.detailsDialog);
  }

  async function leave(poolId) {
    const pool = poolById(poolId);
    if (!pool) return;
    const ok = await confirmAction({
      title: 'Leave this pool?',
      message: `Your seat on the ${formatTime(pool.time)} ride to ${pool.drop} will be released.`,
      confirmLabel: 'Leave pool',
    });
    if (!ok) return;
    const { [poolId]: _role, ...mine } = state.mine;
    const { [poolId]: phone, ...myPhones } = state.myPhones;
    commit({ pools: replacePool(leavePool(pool, phone)), mine, myPhones });
    toast('You left the pool.', 'info');
  }

  async function cancelPool(poolId) {
    const pool = poolById(poolId);
    if (!pool) return;
    const others = pool.riders.length - 1;
    const ok = await confirmAction({
      title: 'Cancel this pool?',
      message:
        others > 0
          ? `${plural(others, 'rider')} will lose their seat. This can't be undone.`
          : "The pool will be removed. This can't be undone.",
      confirmLabel: 'Cancel pool',
    });
    if (!ok) return;
    const { [poolId]: _role, ...mine } = state.mine;
    const { [poolId]: _phone, ...myPhones } = state.myPhones;
    commit({ pools: state.pools.filter((p) => p.id !== poolId), mine, myPhones });
    toast('Pool cancelled.', 'info');
  }

  function loadSamples() {
    const existing = new Set(state.pools.map((pool) => pool.id));
    const fresh = samplePools().filter((pool) => !existing.has(pool.id));
    commit({ ...state, pools: [...state.pools, ...fresh] });
    activeTab = 'available';
    renderTabs();
    toast(`Loaded ${plural(fresh.length, 'sample pool')}.`, 'info');
  }

  // ---------------------------------------------------------------------------
  // Dialog helpers (fall back to the `open` attribute where showModal is missing)

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  /** @returns {Promise<boolean>} */
  function confirmAction({ title, message, confirmLabel }) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmOk.textContent = confirmLabel;
    return new Promise((resolve) => {
      const dialog = els.confirmDialog;
      dialog.returnValue = '';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {
        once: true,
      });
      openDialog(dialog);
    });
  }

  for (const dialog of [els.joinDialog, els.detailsDialog]) {
    dialog.addEventListener('click', (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      // Close on the explicit close buttons or a click on the backdrop.
      if (target.closest('[data-close]') || target === dialog) closeDialog(dialog);
    });
  }

  // ---------------------------------------------------------------------------
  // Tabs (WAI-ARIA tabs pattern with arrow-key navigation)

  /** On single-column layouts the lists sit below the form; bring them into view. */
  function revealLists() {
    const section = root.querySelector('.pools');
    const view = root.defaultView;
    if (!section || !view?.matchMedia || view.matchMedia('(min-width: 900px)').matches) return;
    const reduce = view.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function selectTab(name, focus = false) {
    activeTab = name;
    renderTabs();
    if (focus) root.getElementById(`tab-${name}`)?.focus();
  }

  els.tabs.forEach((tab, index) => {
    const name = tab.id === 'tab-mine' ? 'mine' : 'available';
    tab.addEventListener('click', () => selectTab(name));
    tab.addEventListener('keydown', (event) => {
      const keys = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: els.tabs.length - 1 - index };
      if (!(event.key in keys)) return;
      event.preventDefault();
      const next = els.tabs[(index + keys[event.key] + els.tabs.length) % els.tabs.length];
      selectTab(next.id === 'tab-mine' ? 'mine' : 'available', true);
    });
  });

  // ---------------------------------------------------------------------------
  // Theme

  function currentTheme() {
    const explicit = root.documentElement.dataset.theme;
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return root.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function renderThemeToggle() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    els.themeToggle.setAttribute('aria-label', `Switch to ${next} theme`);
    els.themeToggle.replaceChildren(icon(next === 'dark' ? 'moon' : 'sun'));
  }

  els.themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.documentElement.dataset.theme = next;
    try {
      storage?.setItem(THEME_KEY, next);
    } catch {
      /* theme just won't persist */
    }
    renderThemeToggle();
  });

  // ---------------------------------------------------------------------------
  // Wire up

  els.poolForm.addEventListener('submit', onCreatePool);
  els.poolForm.addEventListener('input', (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.name === 'fare') updateFarePreview();
    if (target.getAttribute('aria-invalid')) {
      target.removeAttribute('aria-invalid');
      const errorEl = root.getElementById(`${target.id}-error`);
      if (errorEl) errorEl.textContent = '';
    }
  });
  for (const btn of els.poolForm.querySelectorAll('[data-step]')) {
    btn.addEventListener('click', () => {
      setPartySize(
        Number(els.partySize.value) + Number(/** @type {HTMLElement} */ (btn).dataset.step),
      );
      const errorEl = root.getElementById('partySize-error');
      if (errorEl) errorEl.textContent = '';
    });
  }
  els.locateBtn.addEventListener('click', onLocate);
  els.joinForm.addEventListener('submit', onJoin);
  els.joinSeats.addEventListener('change', updateJoinPreview);

  setPartySize(1);
  renderThemeToggle();
  render();

  return {
    getState: () => state,
    reset: () => commit(emptyState()),
  };
}
