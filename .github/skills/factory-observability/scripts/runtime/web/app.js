import { createArtifactLibrary } from './artifacts.js';

const $ = (id) => document.getElementById(id);
const state = {
  snapshot: null, events: [], filters: {}, mode: 'live', facet: 'metadata', entityTab: 'agents',
  paused: false, pending: 0, hasMore: false, request: 0, stream: null, captureError: false,
};
let searchTimer;
let refreshTimer;
let analyticsRequest = 0;
let metadataSignature;
let chartData;
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
  if (!response.ok) {
    const error = new Error(data.error ?? `Operations Center returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const artifactLibrary = createArtifactLibrary({ api, element });

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

const metadataLabel = (key) => key.replaceAll('_', ' ').replace(/\b(api|mcp|id|ids|json|http)\b/gi, (word) => word.toUpperCase()).replace(/^./, (letter) => letter.toUpperCase());

function metadataValue(value, path) {
  if (value === null) return element('span', 'Not recorded', 'metadata-missing');
  if (Array.isArray(value)) {
    if (!value.length) return element('span', 'None recorded', 'metadata-missing');
    const list = element('ul', undefined, 'metadata-list');
    for (const [index, entry] of value.entries()) {
      const item = element('li');
      item.append(metadataValue(entry, `${path}.${index}`));
      list.append(item);
    }
    return list;
  }
  if (typeof value === 'object') {
    const list = element('dl', undefined, 'metadata-values');
    for (const [key, entry] of Object.entries(value)) {
      const detail = element('dd');
      detail.dataset.metadataPath = `${path}.${key}`;
      detail.append(metadataValue(entry, `${path}.${key}`));
      list.append(element('dt', metadataLabel(key)), detail);
    }
    return list;
  }
  return element('span', String(value));
}

function renderMetadata(metadata) {
  state.snapshot.metadata = metadata;
  $('metadata-loading').hidden = true;
  $('metadata-content').hidden = false;
  $('metadata-warning').hidden = true;
  const recorded = metadata.provenance.profile_status === 'recorded';
  const incomplete = metadata.provenance.profile_missing_fields.length > 0;
  $('metadata-state').textContent = !recorded ? 'PROFILE NOT RECORDED' : incomplete ? 'PARTIAL PROFILE' : 'PROFILE RECORDED';
  $('metadata-state').className = `badge ${!recorded || incomplete ? 'warning' : 'recent'}`;
  $('metadata-asof').dateTime = metadata.provenance.collected_at;
  $('metadata-asof').textContent = `AS OF ${dateTime(metadata.provenance.collected_at)}`;
  const collectedField = $('metadata-groups').querySelector('[data-metadata-path="provenance.collected_at"]');
  if (collectedField) collectedField.textContent = metadata.provenance.collected_at;
  const { collected_at: collectedAt, ...provenance } = metadata.provenance;
  const signature = JSON.stringify({ ...metadata, provenance });
  if (signature === metadataSignature) return;
  metadataSignature = signature;
  $('metadata-mission').textContent = metadata.profile.mission ?? 'Mission: Not recorded';
  const summary = [
    ['Factory ID', metadata.identity.factory_id], ['Product', metadata.profile.product.name],
    ['Factory owner', metadata.profile.owners.factory], ['Operations owner', metadata.profile.owners.operations],
    ['Last reported lifecycle', metadata.lifecycle.reported_state], ['Center runtime', metadata.configuration.runtime_version],
    ['Product owner', metadata.profile.owners.product], ['Workspace', metadata.profile.product.workspace],
  ];
  $('metadata-summary').replaceChildren(...summary.map(([label, value]) => {
    const group = element('div');
    const detail = element('dd');
    detail.append(metadataValue(value, label));
    group.append(element('dt', label), detail);
    return group;
  }));
  $('metadata-groups').replaceChildren(...Object.entries(metadata).map(([key, value]) => {
    const group = element('section', undefined, 'metadata-group');
    const title = element('h3', metadataLabel(key));
    title.id = `metadata-group-${key}`;
    group.setAttribute('aria-labelledby', title.id);
    const content = element('div');
    content.dataset.metadataPath = key;
    content.append(metadataValue(value, key));
    group.append(title, content);
    return group;
  }));
}

function metadataError(message) {
  $('metadata-state').textContent = state.snapshot?.metadata ? 'LAST KNOWN METADATA' : 'UNAVAILABLE';
  $('metadata-state').className = 'badge error';
  $('metadata-loading').hidden = true;
  $('metadata-warning').textContent = message;
  $('metadata-warning').hidden = false;
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

function renderAssignments(operations) {
  const rows = operations?.value_stream?.assignments ?? [];
  $('assignment-list').replaceChildren(...rows.map((row) => {
    const item = element('li');
    item.append(element('span', `${row.role} / ${row.agent_id}`, 'entity-title'), element('span', `${row.item_id} / ${row.title} / ${row.state}`, 'entity-subtitle'));
    return item;
  }));
  $('assignment-empty').hidden = rows.length > 0;
}

function renderOperations(operations) {
  if (!operations) return;
  const internals = operations.internals;
  $('live-agents').textContent = number(internals.agent_count);
  $('live-active-agents').textContent = number(internals.active_agents);
  $('live-squads').textContent = internals.squads_observed == null ? 'Not recorded' : number(internals.squads_observed);
  $('live-mcp').textContent = number(internals.mcp_calls);
  $('live-tools').textContent = number(internals.tool_events);
  $('live-hooks').textContent = number(internals.hook_facts);
  $('live-workflows').textContent = number(internals.workflows.length);
  $('live-uptime').textContent = internals.factory_uptime_ms == null ? 'Not recorded' : duration(internals.factory_uptime_ms);
  $('live-todo').textContent = number(operations.value_stream.todo);
  $('live-in-progress').textContent = number(operations.value_stream.in_progress);
  $('live-blocked').textContent = number(operations.value_stream.blocked);
  $('live-completed').textContent = number(operations.value_stream.completed);
  renderAssignments(operations);
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
  renderMetadata(snapshot.metadata);
  renderOperations(snapshot.operations);
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
  loadAnalytics();
  loadEvents();
}

function svgElement(tag, attributes, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function seriesPath(buckets, maximum, width) {
  return buckets.map((bucket, index) => {
    const x = 40 + index * ((width - 50) / Math.max(1, buckets.length - 1));
    const y = 150 - (bucket.value / maximum) * 125;
    return `${index ? 'L' : 'M'}${x} ${y}`;
  }).join(' ');
}

function renderChart(data) {
  chartData = data;
  const svg = $('overlay-chart');
  const width = svg.clientWidth;
  if (!width) return;
  svg.setAttribute('viewBox', `0 0 ${width} 180`);
  const live = data.overlay?.live?.buckets ?? [];
  const historical = data.overlay?.historical?.buckets ?? [];
  const maximum = Math.max(1, ...live.map((bucket) => bucket.value), ...historical.map((bucket) => bucket.value));
  const metric = data.overlay?.metric === 'in_progress_items' ? 'In-progress cards' : 'Active agents';
  const nodes = [
    svgElement('title', {}, `${metric} with Live and Historical series superimposed`),
    svgElement('line', { x1: 35, x2: width - 10, y1: 150, y2: 150 }),
    svgElement('line', { x1: 35, x2: width - 10, y1: 20, y2: 20 }),
    svgElement('text', { x: 0, y: 25 }, String(maximum)),
    svgElement('text', { x: 10, y: 154 }, '0'),
  ];
  if (historical.length) nodes.push(svgElement('path', { d: seriesPath(historical, maximum, width), class: 'historical-series' }));
  if (live.length) nodes.push(svgElement('path', { d: seriesPath(live, maximum, width), class: 'live-series' }));
  svg.replaceChildren(...nodes);
  $('chart-metric').textContent = metric;
  svg.setAttribute('aria-label', `${metric} with Live last-hour and Historical window series superimposed on 24 normalized buckets.`);
  $('chart-caption').textContent = `Live ${dateTime(data.overlay.live.window.from)}–${dateTime(data.overlay.live.window.to)} superimposed on Historical ${dateTime(data.overlay.historical.window.from)}–${dateTime(data.overlay.historical.window.to)}`;
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

function historicalFacetMetrics(data) {
  const snapshot = data.overlay?.historical?.snapshot;
  if (!snapshot) {
    $('historical-facet-metrics').replaceChildren();
    return;
  }
  const rows = state.facet === 'value-stream'
    ? [
      ['To Do', snapshot.value_stream.todo],
      ['In progress', snapshot.value_stream.in_progress],
      ['Blocked', snapshot.value_stream.blocked],
      ['Reported done', snapshot.value_stream.completed],
    ]
    : [
      ['Agents', snapshot.internals.agent_count],
      ['Active agents', snapshot.internals.active_agents],
      ['MCP calls (last hour at window end)', snapshot.internals.mcp_calls],
      ['Factory uptime', snapshot.internals.factory_uptime_ms == null ? 'Not recorded' : duration(snapshot.internals.factory_uptime_ms)],
    ];
  $('historical-facet-metrics').replaceChildren(...rows.map(([label, value]) => {
    const article = element('article', undefined, 'mini-metric');
    article.append(element('span', label), element('strong', String(value)));
    return article;
  }));
}

async function loadAnalytics() {
  const request = ++analyticsRequest;
  const end = Date.now();
  const from = new Date(end - Number($('window').value) * 86_400_000).toISOString();
  const to = new Date(end).toISOString();
  $('chart-caption').textContent = 'Loading superimposed Live and Historical series...';
  try {
    const data = await api('/api/v1/analytics', { ...state.filters, from, to, facet: state.facet });
    if (request !== analyticsRequest) return;
    $('window-events').textContent = number(data.counts.events);
    $('window-errors').textContent = number(data.counts.errors);
    $('window-completions').textContent = number(data.counts.reported_completions);
    $('lead-time').textContent = duration(data.lead_time.median_ms);
    $('lead-sample').textContent = `n = ${data.lead_time.sample_size} matched / ${data.lead_time.unmatched_completions} unmatched`;
    renderChart(data);
    historicalFacetMetrics(data);
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

function applyView() {
  const browsing = state.mode === 'artifacts';
  const live = state.mode === 'live';
  const historical = state.mode === 'historical';
  const metadata = state.facet === 'metadata';
  $('artifacts-view').hidden = !browsing;
  $('observation-facets').hidden = browsing;
  $('observation-totals').hidden = browsing;
  $('observation-filters').hidden = browsing;
  document.querySelector('.overlay-heading').hidden = browsing;
  document.querySelector('.overlay-panel').hidden = browsing;
  $('live-view').hidden = !live;
  $('historical-view').hidden = !historical;
  $('live-internals').hidden = !live || !metadata;
  $('live-value-stream').hidden = !live || metadata;
  $('assignment-panel').hidden = !live || metadata;
  $('factory-metadata').hidden = browsing || !metadata;
  $('nav-live').classList.toggle('selected', live);
  $('nav-historical').classList.toggle('selected', historical);
  $('nav-artifacts').classList.toggle('selected', browsing);
  for (const name of ['live', 'historical', 'artifacts']) {
    if (state.mode === name) $(`nav-${name}`).setAttribute('aria-current', 'page');
    else $(`nav-${name}`).removeAttribute('aria-current');
  }
  $('nav-facet-metadata').classList.toggle('selected', metadata);
  $('nav-facet-value-stream').classList.toggle('selected', !metadata);
  $('nav-facet-metadata').setAttribute('aria-pressed', String(metadata));
  $('nav-facet-value-stream').setAttribute('aria-pressed', String(!metadata));
  if (browsing) {
    $('page-title').textContent = 'Factory artifacts';
    $('page-description').textContent = 'Browse cataloged documents, source code, evidence, reports, and other Factory outputs.';
    return;
  }
  const title = `${live ? 'Live' : 'Historical'} × ${metadata ? 'Metadata' : 'Value stream'}`;
  $('page-title').textContent = title;
  $('page-description').textContent = metadata
    ? (live ? 'Near-real-time factory internals reconstructed from emitted facts.' : 'The same factory-internal measures aggregated over 1 day to 1 year.')
    : (live ? 'Reported product/subproduct cards and To Do → Done flow.' : 'Reported card-flow stocks aggregated over 1 day to 1 year.');
}

function setMode(mode) {
  state.mode = mode;
  applyView();
  if (mode === 'artifacts') artifactLibrary.refresh();
  else loadAnalytics();
}

function setFacet(facet) {
  if (state.mode === 'artifacts') state.mode = 'live';
  state.facet = facet;
  applyView();
  loadAnalytics();
}

async function refreshSnapshot() {
  try {
    renderSnapshot(await api('/api/v1/overview'));
    if (state.mode === 'artifacts') artifactLibrary.refresh();
    else loadAnalytics();
  } catch (error) { showError(`Snapshot unavailable: ${error.message}`); metadataError(error.message); }
}

function connectStream(after) {
  state.stream?.close();
  state.stream = new EventSource(`/api/v1/stream?after=${after}`);
  state.stream.onopen = () => connection(true, 'Stream connected');
  state.stream.onerror = () => {
    connection(false, 'Reconnecting / displayed facts may be old');
    metadataError('Connection lost. The card contains last known metadata and may be outdated.');
  };
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
      renderMetadata(status.metadata);
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
    metadataError(JSON.parse(message.data).error);
  });
}

$('nav-live').addEventListener('click', () => setMode('live'));
$('nav-historical').addEventListener('click', () => setMode('historical'));
$('nav-artifacts').addEventListener('click', () => setMode('artifacts'));
$('nav-facet-metadata').addEventListener('click', () => setFacet('metadata'));
$('nav-facet-value-stream').addEventListener('click', () => setFacet('value-stream'));
document.querySelector('a[href="#coverage"]').addEventListener('click', () => {
  setFacet('metadata');
  setMode('live');
});
document.querySelector('a[href="#factory-metadata"]').addEventListener('click', () => setFacet('metadata'));
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
const chartObserver = new ResizeObserver(() => { if (chartData) renderChart(chartData); });
chartObserver.observe($('overlay-chart'));
const freshnessTimer = setInterval(renderFreshness, 1000);
window.addEventListener('pagehide', () => { state.stream?.close(); clearInterval(freshnessTimer); chartObserver.disconnect(); artifactLibrary.stop(); });

try {
  const snapshot = await api('/api/v1/overview');
  renderSnapshot(snapshot);
  applyView();
  await Promise.all([loadEvents(), loadAnalytics()]);
  connectStream(snapshot.last_sequence);
} catch (error) {
  connection(false, 'Service unavailable');
  showError(`Cannot load this Factory: ${error.message}. Check the local center process and product records, then reload.`);
  metadataError(error.message);
}
