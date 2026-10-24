const $ = (id) => document.getElementById(id);
const state = {
  snapshot: null, events: [], filters: {}, mode: 'live', entityTab: 'agents',
  paused: false, pending: 0, hasMore: false, request: 0, stream: null, captureError: false,
};
let searchTimer;
let refreshTimer;
let analyticsRequest = 0;
const number = (value) => new Intl.NumberFormat().format(value);
const time = (value) => new Date(value).toLocaleTimeString([], { hour12: false });
const dateTime = (value) => new Date(value).toLocaleString([], { hour12: false });
const duration = (ms) => ms === null ? 'Unknown' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : ms < 3_600_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 3_600_000).toFixed(1)} h`;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}

async function api(path, query = {}) {
  const response = await fetch(`${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Operations Center returned HTTP ${response.status}`);
  return data;
}

function connection(connected, text) {
  $('connection').classList.toggle('connected', connected);
  $('connection-text').textContent = text;
}

function renderFreshness() {
  const freshness = state.snapshot?.freshness;
  if (!freshness) return;
  const age = freshness.last_source_at ? Math.max(0, Date.now() - Date.parse(freshness.last_source_at)) : null;
  const status = age === null ? 'unknown' : age > freshness.threshold_ms ? 'stale' : 'recent';
  $('freshness-badge').textContent = status === 'recent' ? 'RECENT FACTS' : status.toUpperCase();
  $('freshness-badge').className = `badge ${status === 'recent' ? 'recent' : 'warning'}`;
  $('freshness-text').textContent = freshness.last_source_at
    ? `Latest source fact ${duration(age)} ago. Freshness threshold: ${duration(freshness.threshold_ms)}.`
    : 'No Factory operational facts emitted yet. Provisioning is not Factory activity.';
  $('collected-at').textContent = freshness.last_collected_at ? `LAST COLLECTED ${dateTime(freshness.last_collected_at)}` : 'NO COLLECTED RECORDS';
}

function renderCoverage() {
  const coverage = state.snapshot?.coverage;
  if (!coverage) return;
  $('bound-sessions').textContent = number(coverage.bound_sessions);
  $('host-state').textContent = coverage.host_hooks.replaceAll('-', ' ');
  $('gap-count').textContent = number(coverage.gap_events);
  $('unattributed').textContent = number(coverage.unattributed_events);
  $('coverage-badge').textContent = coverage.ingestion_errors.length ? 'INGESTION GAPS' : coverage.host_hooks === 'observed' ? 'PARTIAL / OBSERVED' : 'CAPTURE UNVERIFIED';
  $('coverage-badge').className = `badge ${coverage.ingestion_errors.length ? 'error' : 'warning'}`;
  $('ingestion-errors').replaceChildren(...coverage.ingestion_errors.map((error) => element('li', `${error.file}: ${error.error}`)));
}

function renderEntities() {
  if (!state.snapshot) return;
  const focused = document.activeElement?.dataset?.entity;
  const values = state.snapshot[state.entityTab];
  const rows = values.map((value) => {
    const key = state.entityTab === 'agents' ? 'agent_id' : state.entityTab === 'skills' ? 'skill' : 'item_id';
    const id = state.entityTab === 'skills' ? value.name : value.id;
    const row = element('li');
    const button = element('button', undefined, 'entity-button');
    button.type = 'button';
    button.dataset.entity = `${key}:${id}`;
    const main = element('span', undefined, 'entity-main');
    const title = state.entityTab === 'items' ? value.title : state.entityTab === 'agents' ? value.role : value.name;
    const subtitle = state.entityTab === 'skills'
      ? `${value.loaded} loads / ${value.started} reported starts / ${value.completed} reported completions`
      : state.entityTab === 'agents' ? `${value.id} / ${value.events} facts` : `${value.id} / ${value.type}`;
    main.append(element('span', title, 'entity-title'), element('span', subtitle, 'entity-subtitle'));
    button.append(main);
    if (state.entityTab !== 'skills') button.append(element('span', value.state, `badge ${['failed', 'blocked'].includes(value.state) ? 'error' : value.state === 'active' ? 'recent' : ''}`));
    else button.append(element('span', `${value.failed} failures`, `badge ${value.failed ? 'error' : 'subdued'}`));
    button.addEventListener('click', () => {
      for (const field of ['agent_id', 'skill', 'item_id']) delete state.filters[field];
      state.filters[key] = id;
      updateFilters();
    });
    row.append(button);
    return row;
  });
  $('entity-list').replaceChildren(...rows);
  $('entities-empty').hidden = values.length > 0;
  $('entities-empty').textContent = `No ${state.entityTab === 'items' ? 'product items' : state.entityTab} reported yet.`;
  if (focused) [...$('entity-list').querySelectorAll('button')].find((button) => button.dataset.entity === focused)?.focus({ preventScroll: true });
}

function renderSnapshot(snapshot) {
  const changed = state.snapshot?.last_sequence !== snapshot.last_sequence;
  state.snapshot = snapshot;
  $('factory-name').textContent = snapshot.factory.label;
  $('factory-id').textContent = snapshot.factory.id;
  document.title = `${snapshot.factory.label} | Factory Operations Center`;
  $('mcp-server').textContent = `factory-observability-${snapshot.factory.id}`;
  for (const name of ['events', 'agents', 'skills', 'items']) $(`count-${name}`).textContent = number(snapshot.counts[name]);
  renderFreshness();
  renderCoverage();
  if (changed) renderEntities();
}

function matches(event) {
  const filters = state.filters;
  if (filters.agent_id && event.agent?.id !== filters.agent_id) return false;
  if (filters.skill && event.skill !== filters.skill) return false;
  if (filters.item_id && event.item?.id !== filters.item_id) return false;
  if (filters.severity && event.severity !== filters.severity) return false;
  return !filters.q || [event.message, event.kind, event.agent?.id, event.agent?.role, event.skill, event.item?.id, event.item?.title, event.tool]
    .filter(Boolean).join(' ').toLowerCase().includes(filters.q.toLowerCase());
}

function renderEvents() {
  if (state.paused) {
    $('feed-status').textContent = `Feed paused / ${number(state.pending)} matching facts received. Collection continues.`;
    return;
  }
  const list = $('event-list');
  const scroll = list.scrollTop;
  const focused = document.activeElement?.dataset?.event;
  const rows = state.events.map((event) => {
    const row = element('li', undefined, `event-row ${event.severity}`);
    const button = element('button', undefined, 'event-button');
    button.type = 'button';
    button.dataset.event = event.event_id;
    const clock = element('time', time(event.occurred_at), 'event-time');
    clock.dateTime = event.occurred_at;
    clock.title = dateTime(event.occurred_at);
    const content = element('span');
    const metadata = element('span', undefined, 'event-meta');
    metadata.append(element('span', event.kind, `kind-tag ${event.kind.split('.')[0]}`));
    metadata.append(element('span', event.agent ? `${event.agent.role} / ${event.agent.id}` : 'Agent attribution unknown', 'event-actor'));
    if (event.severity !== 'info') metadata.append(element('span', event.severity.toUpperCase(), `badge ${['error', 'critical'].includes(event.severity) ? 'error' : 'warning'}`));
    const message = element('span', event.message, 'event-message');
    const source = element('span', `#${event.sequence} / ${event.source.kind} / ${event.source.ref}`, 'event-source');
    content.append(metadata, message, source);
    button.append(clock, content);
    button.addEventListener('click', () => {
      $('fact-dialog-title').textContent = `${event.kind} / fact #${event.sequence}`;
      $('fact-json').textContent = JSON.stringify(event, null, 2);
      $('fact-dialog').showModal();
    });
    row.append(button);
    return row;
  });
  list.replaceChildren(...rows);
  list.scrollTop = $('follow').checked ? 0 : scroll;
  if (focused) [...list.querySelectorAll('button')].find((button) => button.dataset.event === focused)?.focus({ preventScroll: true });
  $('events-empty').hidden = state.events.length > 0;
  $('event-count').textContent = `${number(state.events.length)} matching facts shown${state.events.length >= 500 ? ' / 500-row view limit; use the API for further history' : ''}`;
  $('feed-status').textContent = 'Live view / durable journal';
  $('load-older').disabled = !state.hasMore || state.events.length >= 500;
}

async function loadEvents(older = false) {
  const request = ++state.request;
  const query = { ...state.filters, order: 'desc', limit: 60 };
  if (older && state.events.length) query.before = state.events.at(-1).sequence;
  try {
    const page = await api('/api/v1/events', query);
    if (request !== state.request) return;
    const arrivedDuringRead = state.events.filter((event) => event.sequence > page.last_sequence && matches(event));
    const combined = older ? [...state.events, ...page.events] : [...arrivedDuringRead, ...page.events];
    state.events = [...new Map(combined.map((event) => [event.event_id, event])).values()].sort((a, b) => b.sequence - a.sequence).slice(0, 500);
    state.hasMore = page.has_more;
    renderEvents();
    showError('');
  } catch (error) {
    if (request === state.request) showError(`Fact history unavailable: ${error.message}`);
  }
}

function updateFilters() {
  const labels = Object.entries(state.filters).map(([key, value]) => `${key}: ${value}`);
  $('active-filter').textContent = labels.length ? labels.join(' / ') : 'All entities';
  if (state.mode === 'analytics') loadAnalytics();
  loadEvents();
}

function svgElement(tag, attributes, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderChart(data) {
  const svg = $('volume-chart');
  const maximum = Math.max(1, ...data.buckets.map((bucket) => bucket.events));
  const nodes = [
    svgElement('title', {}, `${data.counts.events} emitted facts, ${data.counts.errors} error or critical facts in 24 time buckets`),
    svgElement('line', { x1: 35, x2: 950, y1: 150, y2: 150 }),
    svgElement('line', { x1: 35, x2: 950, y1: 20, y2: 20 }),
    svgElement('text', { x: 0, y: 25 }, String(maximum)),
    svgElement('text', { x: 10, y: 154 }, '0'),
  ];
  data.buckets.forEach((bucket, index) => {
    const x = 40 + index * 38;
    const height = bucket.events / maximum * 125;
    const rect = svgElement('rect', { x, y: 150 - height, width: 25, height, rx: 2, class: 'fact-bar' });
    rect.append(svgElement('title', {}, `${dateTime(bucket.from)}: ${bucket.events} facts, ${bucket.errors} error/critical`));
    nodes.push(rect);
    if (bucket.errors) {
      const errorHeight = bucket.errors / maximum * 125;
      nodes.push(svgElement('rect', { x, y: 150 - errorHeight, width: 25, height: errorHeight, rx: 2, class: 'error-bar' }));
    }
  });
  svg.replaceChildren(...nodes);
  svg.setAttribute('aria-label', `${data.counts.events} emitted facts and ${data.counts.errors} error/critical facts; each of 24 bars is one equal time bucket.`);
  $('chart-caption').textContent = `${dateTime(data.window.from)} to ${dateTime(data.window.to)} / 24 equal time buckets`;
}

function renderBreakdown(id, rows) {
  if (!rows.length) {
    $(id).replaceChildren(element('li', 'No matching emissions in this window.', 'muted'));
    return;
  }
  const max = Math.max(...rows.map((row) => row.count));
  $(id).replaceChildren(...rows.map((row) => {
    const item = element('li');
    const meter = element('meter');
    meter.min = 0;
    meter.max = max;
    meter.value = row.count;
    meter.setAttribute('aria-label', `${row.name}: ${row.count} emitted facts`);
    item.append(element('span', row.name), element('span', number(row.count), 'mono'), meter);
    return item;
  }));
}

async function loadAnalytics() {
  const request = ++analyticsRequest;
  const from = new Date(Date.now() - Number($('window').value) * 3_600_000).toISOString();
  $('chart-caption').textContent = 'Loading analysis window...';
  try {
    const data = await api('/api/v1/analytics', { ...state.filters, from });
    if (request !== analyticsRequest) return;
    $('window-events').textContent = number(data.counts.events);
    $('window-errors').textContent = number(data.counts.errors);
    $('window-completions').textContent = number(data.counts.reported_completions);
    $('lead-time').textContent = duration(data.lead_time.median_ms);
    $('lead-sample').textContent = `n = ${data.lead_time.sample_size} matched / ${data.lead_time.unmatched_completions} unmatched`;
    renderChart(data);
    $('insights').replaceChildren(...data.insights.map((insight) => {
      const item = element('li');
      item.append(element('span', insight.level.toUpperCase(), `badge ${insight.level === 'error' ? 'error' : insight.level === 'warning' ? 'warning' : 'subdued'}`), element('span', insight.text));
      return item;
    }));
    renderBreakdown('role-breakdown', data.by_role);
    renderBreakdown('skill-breakdown', data.by_skill);
    showError('');
  } catch (error) {
    if (request === analyticsRequest) showError(`Analytics unavailable: ${error.message}`);
  }
}

function setMode(mode) {
  state.mode = mode;
  $('live-view').hidden = mode !== 'live';
  $('analytics-view').hidden = mode !== 'analytics';
  for (const name of ['live', 'analytics']) {
    $(`nav-${name}`).classList.toggle('selected', mode === name);
    if (mode === name) $(`nav-${name}`).setAttribute('aria-current', 'page');
    else $(`nav-${name}`).removeAttribute('aria-current');
  }
  $('page-title').textContent = mode === 'live' ? 'Live operations' : 'Analytics & insights';
  $('page-description').textContent = mode === 'live' ? 'Follow emitted facts across agents, skills, and product work.' : 'Find patterns in reported activity, outcomes, and observation gaps.';
  if (mode === 'analytics') loadAnalytics();
}

async function refreshSnapshot() {
  try {
    renderSnapshot(await api('/api/v1/overview'));
    if (state.mode === 'analytics') loadAnalytics();
  } catch (error) { showError(`Snapshot unavailable: ${error.message}`); }
}

function connectStream(after) {
  state.stream?.close();
  state.stream = new EventSource(`/api/v1/stream?after=${after}`);
  state.stream.onopen = () => connection(true, 'Stream connected');
  state.stream.onerror = () => connection(false, 'Reconnecting / displayed facts may be old');
  state.stream.addEventListener('snapshot', (message) => {
    renderSnapshot(JSON.parse(message.data));
    showError('');
  });
  state.stream.addEventListener('fact', (message) => {
    const event = JSON.parse(message.data);
    if (matches(event) && !state.events.some((entry) => entry.event_id === event.event_id)) {
      state.events = [event, ...state.events].sort((a, b) => b.sequence - a.sequence).slice(0, 500);
      if (state.paused) state.pending += 1;
      renderEvents();
    }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshSnapshot, 200);
  });
  state.stream.addEventListener('status', (message) => {
    const status = JSON.parse(message.data);
    if (state.snapshot) {
      state.snapshot.freshness = status.freshness;
      state.snapshot.coverage = status.coverage;
      renderFreshness();
      renderCoverage();
    }
    if (state.captureError) {
      state.captureError = false;
      connection(true, 'Stream connected');
      showError('');
    }
  });
  state.stream.addEventListener('capture-error', (message) => {
    state.captureError = true;
    connection(false, 'Capture degraded');
    showError(`Capture unavailable: ${JSON.parse(message.data).error}`);
  });
}

$('nav-live').addEventListener('click', () => setMode('live'));
$('nav-analytics').addEventListener('click', () => setMode('analytics'));
document.querySelector('a[href="#coverage"]').addEventListener('click', () => setMode('live'));
$('window').addEventListener('change', loadAnalytics);
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if ($('search').value.trim()) state.filters.q = $('search').value.trim();
    else delete state.filters.q;
    updateFilters();
  }, 200);
});
$('severity').addEventListener('change', () => {
  if ($('severity').value) state.filters.severity = $('severity').value;
  else delete state.filters.severity;
  updateFilters();
});
$('clear-filters').addEventListener('click', () => {
  state.filters = {};
  $('search').value = '';
  $('severity').value = '';
  updateFilters();
});
$('pause').addEventListener('click', () => {
  state.paused = !state.paused;
  $('pause').textContent = state.paused ? 'Resume feed' : 'Pause feed';
  $('pause').setAttribute('aria-pressed', String(state.paused));
  state.pending = 0;
  renderEvents();
});
$('load-older').addEventListener('click', () => loadEvents(true));
const entityTabs = ['agents', 'skills', 'items'];
for (const [index, name] of entityTabs.entries()) {
  $(`tab-${name}`).addEventListener('click', () => {
    state.entityTab = name;
    for (const tab of entityTabs) {
      $(`tab-${tab}`).setAttribute('aria-selected', String(tab === name));
      $(`tab-${tab}`).tabIndex = tab === name ? 0 : -1;
    }
    $('entity-panel').setAttribute('aria-labelledby', `tab-${name}`);
    renderEntities();
  });
  $(`tab-${name}`).addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    $(`tab-${entityTabs[next]}`).click();
    $(`tab-${entityTabs[next]}`).focus();
  });
}
$('mcp-info').addEventListener('click', () => $('mcp-dialog').showModal());
$('close-mcp').addEventListener('click', () => $('mcp-dialog').close());
$('close-fact').addEventListener('click', () => $('fact-dialog').close());
for (const id of ['fact-dialog', 'mcp-dialog']) {
  $(id).addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      $(id).close();
    }
  });
}
const freshnessTimer = setInterval(renderFreshness, 1000);
window.addEventListener('pagehide', () => { state.stream?.close(); clearInterval(freshnessTimer); });

try {
  const snapshot = await api('/api/v1/overview');
  renderSnapshot(snapshot);
  await loadEvents();
  connectStream(snapshot.last_sequence);
} catch (error) {
  connection(false, 'Service unavailable');
  showError(`Cannot load this Factory: ${error.message}. Check the local center process and product records, then reload.`);
}
