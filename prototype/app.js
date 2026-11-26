'use strict';

const $ = (id) => document.getElementById(id);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function icon(name) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  node.setAttribute('aria-hidden', 'true');
  node.append(use);
  return node;
}

const paths = [
  {
    id: 'hosted', title: 'Just a browser', caption: 'Connect to your owner-hosted execution service.',
    symbol: 'cloud', color: 'purple', status: 'Hosted service', documented: true,
    install: 'No local installation', runner: 'A separately hosted agent service',
    consideration: 'Use a private HTTPS service you operate or trust. Its owner supplies the product workspace, Copilot account, access token, and operating limits.',
    requirements: ['A browser and internet access', 'A deployed HTTPS Studio service and its owner-issued access token', 'Copilot authentication and a product-owned Git workspace on the service host'],
  },
  {
    id: 'local', title: 'Browser + my computer', caption: 'A browser workspace, with an agent service on your device.',
    symbol: 'laptop', color: 'green', status: 'Local companion', documented: true,
    install: 'A lightweight local agent service', runner: 'Your device, through that service',
    consideration: 'Run the Studio companion on loopback with a separate product repository and an owner-configured acceptance command. No editor is required.',
    requirements: ['A browser and Node.js', 'The installed Studio companion and its access token', 'Copilot sign-in, Git, and a separate product workspace'],
  },
  {
    id: 'self-hosted', title: "My team's infrastructure", caption: 'A shared workspace on infrastructure your team manages.',
    symbol: 'network', color: 'orange', status: 'Self-hosted service', documented: true,
    install: 'Team-managed hosting or containers', runner: 'Your approved team infrastructure',
    consideration: 'A designated owner manages a private Studio instance, TLS, secrets, Git storage, provider access, and costs. This is not an anonymous multi-tenant service.',
    requirements: ['An approved team-managed Node.js hosting environment', 'TLS certificates and a protected service access token', 'An authenticated Copilot runtime, product Git workspace, and operations owner'],
  },
];

const agents = [
  ['Launch guide', 'FactoryLauncher', 'Helps establish the right starting conditions and hands delivery to a Factory.', 'spark', 'purple'],
  ['Delivery coordinator', 'Factory', 'Coordinates Squads and integrated results. Does not set product priority or write product code.', 'factory', 'purple'],
  ['Research partner', 'VOC', 'Keeps real customer needs, evidence, and unanswered questions traceable.', 'heart', 'pink'],
  ['Product guide', 'ProductOwner', 'Owns shared product direction, priorities, and value decisions within approved limits.', 'map', 'orange'],
  ['Specialist product guide', 'AssociateProductOwner', 'Refines distinct outcomes under the product guide, without creating a competing roadmap.', 'map', 'purple'],
  ['Work organizer', 'Kanban', 'Governs shared Squad boards, readiness, capacity, and verified completion records.', 'board', 'blue'],
  ['Team coordinator', 'Squad', 'Gives builders clear, non-overlapping tasks and checks the combined result.', 'network', 'green'],
  ['Builder', 'Fullstacker', 'Builds and verifies an authorized outcome end to end, not just one isolated layer.', 'robot', 'green'],
  ['History keeper', 'Historian', 'Preserves assigned decisions, demand events, handoffs, and explicit evidence gaps.', 'board', 'pink'],
];

function initialPlan() {
  return {
    path: null, name: '', goal: '', nextFactory: 2, nextSquad: 2,
    factories: [{ id: 'f1', name: 'My first Factory', squads: [{ id: 's1', name: 'Launch Squad', members: '3' }] }],
  };
}

let plan = initialPlan();
let currentStep = 0;
let editorView = 'guided';
let pendingAction = null;
const activation = new StudioClient();
let activationStep = 0;
let activeView = 'welcome';

function announce(message) {
  $('announcements').textContent = message;
}

function pathIcon(path) {
  const node = element('span', undefined, `path-icon ${path.color}`);
  node.append(icon(path.symbol));
  return node;
}

function availability(path) {
  return element('span', path.status, `availability${path.documented ? ' documented' : ''}`);
}

function pathFacts(path) {
  const list = element('dl', undefined, 'path-facts');
  for (const [label, value] of [
    ['On your device, for real use', path.install],
    ['Where agents would run', path.runner],
    ['Runtime support', 'The same authenticated Studio backend; readiness is checked at connection time'],
  ]) {
    const group = element('div');
    group.append(element('dt', label), element('dd', value));
    list.append(group);
  }
  return list;
}

function choosePath(id) {
  if (!paths.some((path) => path.id === id)) {
    announce('Choose one of the three supported hosting locations.');
    return;
  }
  plan.path = id;
  for (const card of $('path-options').children) {
    const selected = card.dataset.path === id;
    card.classList.toggle('selected', selected);
    card.querySelector('input').checked = selected;
  }
  clearError();
  renderPathDetail();
}

function renderPathDetail() {
  const path = paths.find((entry) => entry.id === plan.path);
  if (!path) {
    $('path-detail').replaceChildren(
      element('h3', 'Choose where your execution service will run.'),
      element('p', 'Planning works in this browser. Real execution connects to a hosted service, local companion, or self-hosted instance.'),
    );
    return;
  }
  $('path-detail').replaceChildren(
    element('h3', `Your path: ${path.title}`),
    element('p', path.consideration), pathFacts(path),
  );
}

function renderPathChoices() {
  for (const path of paths) {
    const welcomeCard = element('button', undefined, 'comfort-card');
    welcomeCard.type = 'button';
    welcomeCard.dataset.selectPath = path.id;
    welcomeCard.append(pathIcon(path), element('strong', path.title), element('span', path.caption), availability(path));
    welcomeCard.setAttribute('aria-label', `Explore ${path.title}`);
    $('welcome-paths').append(welcomeCard);

    const label = element('label', undefined, 'path-card');
    label.dataset.path = path.id;
    const input = element('input');
    input.type = 'radio';
    input.name = 'setup-path';
    input.value = path.id;
    input.id = `path-${path.id}`;
    input.addEventListener('change', () => choosePath(path.id));
    label.append(input, pathIcon(path), element('strong', path.title), element('span', path.caption, 'path-caption'), availability(path));
    $('path-options').append(label);

    const row = element('article', undefined, 'comparison-row');
    const heading = element('div');
    heading.append(pathIcon(path), element('h3', path.title), availability(path));
    const detail = element('div');
    const requirements = element('ul');
    requirements.append(...path.requirements.map((requirement) => element('li', requirement)));
    detail.append(requirements, element('p', `Agents would run: ${path.runner}.`));
    const select = element('button', 'Choose this path', 'button secondary');
    select.type = 'button';
    select.dataset.selectPath = path.id;
    select.setAttribute('aria-label', `Choose ${path.title}`);
    row.append(heading, detail, select);
    $('comparison-options').append(row);
  }
}

function renderAgents() {
  for (const [title, role, description, symbol, color] of agents) {
    const card = element('article', undefined, 'agent-card');
    const mark = element('span', undefined, `role-symbol ${color}`);
    mark.append(icon(symbol));
    card.append(mark, element('h3', title), element('p', role, 'agent-name'), element('p', description));
    $('agent-cards').append(card);
  }
}

function builderNumber(squad) {
  if (squad.members.trim() === '') return null;
  const count = Number(squad.members);
  return Number.isInteger(count) && count >= 1 && count <= 12 ? count : null;
}

function issueForStep(step) {
  if (step === 0 && !paths.some((path) => path.id === plan.path)) {
    return { message: 'Choose a setup path to continue. You can change it later.', target: 'path-hosted' };
  }
  if (step === 1) {
    if (!plan.name.trim()) return { message: 'Give your product a working name, or try the sample idea.', target: 'product-name' };
    if (!plan.goal.trim()) return { message: 'Describe who your idea helps and how, or try the sample idea.', target: 'product-goal' };
  }
  if (step === 2) {
    const factoryNames = new Set();
    for (const factory of plan.factories) {
      const name = factory.name.trim().toLowerCase();
      if (!name) return { message: 'Give each Factory a name so you can tell them apart.', target: `factory-name-${factory.id}` };
      if (factoryNames.has(name)) return { message: 'Use a different name for each Factory.', target: `factory-name-${factory.id}` };
      factoryNames.add(name);
      const squadNames = new Set();
      for (const squad of factory.squads) {
        const squadName = squad.name.trim().toLowerCase();
        if (!squadName) return { message: 'Give each Squad a name.', target: `squad-name-${squad.id}` };
        if (squadNames.has(squadName)) return { message: 'Use a different name for each Squad in this Factory.', target: `squad-name-${squad.id}` };
        squadNames.add(squadName);
        if (builderNumber(squad) === null) return { message: 'Choose a whole number of builders from 1 to 12 for each Squad. This is a prototype preview limit.', target: `builders-${squad.id}` };
      }
    }
  }
  return null;
}

function firstMissingStep() {
  return [0, 1, 2].find((step) => issueForStep(step)) ?? 3;
}

function clearError() {
  $('form-error').hidden = true;
  $('form-error').textContent = '';
  for (const field of $('setup-form').querySelectorAll('[aria-invalid="true"]')) {
    field.removeAttribute('aria-invalid');
    const descriptions = (field.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== 'form-error');
    if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' '));
    else field.removeAttribute('aria-describedby');
  }
}

function showError(issue) {
  clearError();
  $('form-error').textContent = issue.message;
  $('form-error').hidden = false;
  const field = $(issue.target);
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', `${field.getAttribute('aria-describedby') ?? ''} form-error`.trim());
  field.focus();
}

function navigate(hash) {
  if (window.location.hash === hash) renderRoute();
  else window.location.hash = hash;
}

function renderProgress(step) {
  const readyThrough = firstMissingStep();
  const list = $('wizard-steps');
  list.replaceChildren();
  for (const [index, label] of ['Your setup', 'Your idea', 'Your team', 'Your blueprint'].entries()) {
    const item = element('li');
    const button = element('button');
    button.type = 'button';
    button.disabled = index > readyThrough;
    if (index === step) button.setAttribute('aria-current', 'step');
    if (index < step) item.className = 'complete';
    const number = element('span', index < step ? undefined : String(index + 1), 'step-number');
    if (index < step) number.append(icon('check'));
    number.setAttribute('aria-hidden', 'true');
    button.append(number, element('span', label));
    button.addEventListener('click', () => navigate(index === 3 ? '#blueprint' : `#setup/${index + 1}`));
    item.append(button);
    list.append(item);
  }
}

function field(label, id, value, fieldName, factoryId, squadId) {
  const container = element('div');
  const heading = element('label', label);
  heading.htmlFor = id;
  const input = element('input');
  input.id = id;
  input.value = value;
  input.type = fieldName === 'members' ? 'number' : 'text';
  input.required = true;
  input.dataset.field = fieldName;
  input.dataset.factoryId = factoryId;
  if (squadId) input.dataset.squadId = squadId;
  if (fieldName === 'members') {
    input.min = '1';
    input.max = '12';
    input.step = '1';
    input.setAttribute('aria-describedby', 'capacity-note');
    container.className = 'builder-field';
  } else {
    input.maxLength = 60;
    input.autocomplete = 'off';
  }
  container.append(heading, input);
  return container;
}

function actionButton(label, action, factoryId, squadId, className = 'text-button') {
  const button = element('button', label, className);
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.factoryId = factoryId;
  if (squadId) button.dataset.squadId = squadId;
  return button;
}

function removeButton(label, action, factoryId, squadId, disabled) {
  const button = actionButton(undefined, action, factoryId, squadId, 'icon-button');
  button.append(icon('close'));
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  if (disabled) button.title = 'Keep at least one Factory and one Squad in this preview.';
  return button;
}

function avatars(count) {
  const group = element('div', undefined, 'builder-avatars');
  group.setAttribute('aria-hidden', 'true');
  if (count === null) {
    group.append(element('span', 'Enter 1-12 builders', 'field-help'));
    return group;
  }
  for (let i = 0; i < Math.min(count, 5); i += 1) {
    const avatar = element('span', undefined, 'avatar');
    avatar.append(icon('robot'));
    group.append(avatar);
  }
  if (count > 5) group.append(element('span', `+${count - 5}`, 'avatar-more'));
  return group;
}

function boardPreview() {
  const board = element('div', undefined, 'board-preview');
  board.append(element('span', 'To Do'), element('span', 'In Progress'));
  const wrapper = element('div');
  wrapper.append(board, element('p', 'One common Squad board. No real cards created.', 'board-caption'));
  return wrapper;
}

function reorderControls(kind, factoryId, squadId, index, total) {
  const group = element('div', undefined, 'reorder-controls');
  for (const [label, direction, disabled] of [['Move earlier', -1, index === 0], ['Move later', 1, index === total - 1]]) {
    const button = actionButton(label, `move-${kind}`, factoryId, squadId, '');
    button.dataset.direction = String(direction);
    button.disabled = disabled;
    const name = squadId ? plan.factories.find((factory) => factory.id === factoryId).squads.find((squad) => squad.id === squadId).name : plan.factories.find((factory) => factory.id === factoryId).name;
    button.setAttribute('aria-label', `${label}: ${name}`);
    group.append(button);
  }
  return group;
}

function sharedChips() {
  const group = element('div', undefined, 'shared-chips');
  for (const [symbol, label] of [['board', 'Shared backlog'], ['map', 'Shared roadmap'], ['heart', 'One product direction']]) {
    const chip = element('span', undefined, 'shared-chip');
    chip.append(icon(symbol), element('span', label));
    group.append(chip);
  }
  return group;
}

function teamTotals() {
  const squads = plan.factories.flatMap((factory) => factory.squads);
  const numbers = squads.map(builderNumber);
  return { factories: plan.factories.length, squads: squads.length, builders: numbers.includes(null) ? null : numbers.reduce((sum, count) => sum + count, 0) };
}

function renderTeamCount() {
  const totals = teamTotals();
  $('team-count').textContent = `${totals.factories} ${totals.factories === 1 ? 'Factory' : 'Factories'} / ${totals.squads} ${totals.squads === 1 ? 'Squad' : 'Squads'} / ${totals.builders === null ? 'check builder counts' : `${totals.builders} planned builders`}`;
}

function updateNameControls(input, kind, name) {
  const container = input.closest(kind === 'factory' ? '.factory-editor' : '.squad-editor');
  const label = name.trim() || `this ${kind === 'factory' ? 'Factory' : 'Squad'}`;
  for (const button of container.querySelectorAll(`[data-action="remove-${kind}"], [data-action="move-${kind}"]`)) {
    const action = button.dataset.action.startsWith('remove') ? 'Remove' : Number(button.dataset.direction) === -1 ? 'Move earlier:' : 'Move later:';
    button.setAttribute('aria-label', `${action} ${label}`);
  }
}

function renderTeams() {
  const canvas = editorView === 'canvas';
  $('guided-view').setAttribute('aria-pressed', String(!canvas));
  $('canvas-view').setAttribute('aria-pressed', String(canvas));
  $('teams-editor').classList.toggle('canvas', canvas);
  $('canvas-product').hidden = !canvas;
  $('canvas-product').replaceChildren(
    element('h3', plan.name.trim()), element('p', 'All Factories below share this product plan.'), sharedChips(),
  );
  const cards = plan.factories.map((factory, factoryIndex) => {
    const card = element('article', undefined, 'factory-editor');
    card.dataset.factoryId = factory.id;
    const header = element('header');
    const mark = element('span', undefined, 'path-icon purple');
    mark.append(icon('factory'));
    const name = field(`Factory ${factoryIndex + 1} name`, `factory-name-${factory.id}`, factory.name, 'factory-name', factory.id);
    name.className = 'factory-name-field';
    header.append(mark, name, removeButton(`Remove ${factory.name}`, 'remove-factory', factory.id, undefined, plan.factories.length === 1));
    card.append(header);
    const squads = element('div', undefined, 'squad-list');
    for (const [squadIndex, squad] of factory.squads.entries()) {
      const squadCard = element('section', undefined, 'squad-editor');
      squadCard.dataset.squadId = squad.id;
      const heading = element('header');
      heading.append(element('span', `SQUAD ${squadIndex + 1}`), removeButton(`Remove ${squad.name}`, 'remove-squad', factory.id, squad.id, factory.squads.length === 1));
      const control = element('div', undefined, 'builder-control');
      control.append(field('AI builders', `builders-${squad.id}`, squad.members, 'members', factory.id, squad.id), avatars(builderNumber(squad)));
      squadCard.append(heading, field('Squad name', `squad-name-${squad.id}`, squad.name, 'squad-name', factory.id, squad.id), control, boardPreview());
      if (canvas) squadCard.append(reorderControls('squad', factory.id, squad.id, squadIndex, factory.squads.length));
      squads.append(squadCard);
    }
    const add = actionButton('+ Add a Squad to this Factory', 'add-squad', factory.id);
    add.disabled = factory.squads.length >= 4;
    if (add.disabled) add.title = 'This preview supports up to four Squads per Factory.';
    card.append(squads, add);
    if (canvas) card.append(reorderControls('factory', factory.id, undefined, factoryIndex, plan.factories.length));
    return card;
  });
  $('teams-editor').replaceChildren(...cards);
  $('add-factory').disabled = plan.factories.length >= 4;
  $('add-factory').title = plan.factories.length >= 4 ? 'This preview supports up to four Factories.' : '';
  renderTeamCount();
}

function showDialog(id) {
  $(id).showModal();
}

function confirmChange(action, title, copy, label = 'Remove') {
  pendingAction = action;
  $('confirm-title').textContent = title;
  $('confirm-copy').textContent = copy;
  $('confirm-action').textContent = label;
  showDialog('confirm-dialog');
}

function newSquad() {
  const id = plan.nextSquad++;
  return { id: `s${id}`, name: `Squad ${id}`, members: '3' };
}

function actOnTeam(button) {
  const action = button.dataset.action;
  const factory = plan.factories.find((entry) => entry.id === button.dataset.factoryId);
  if (!factory) {
    announce('That Factory is no longer in the blueprint. Use the current team controls.');
    return;
  }
  const squad = factory.squads.find((entry) => entry.id === button.dataset.squadId);
  if (action === 'add-squad') {
    if (factory.squads.length >= 4) { announce('The prototype limit is four Squads per Factory.'); return; }
    const added = newSquad();
    factory.squads.push(added);
    renderTeams();
    $(`squad-name-${added.id}`).focus();
    announce(`Added ${added.name}. It shares the same product plan.`);
  } else if (action === 'remove-factory') {
    confirmChange({ kind: 'factory', factoryId: factory.id }, `Remove ${factory.name}?`, 'This removes this Factory and its Squads from the preview only. Your product and its shared plan stay.');
  } else if (action === 'remove-squad' && squad) {
    confirmChange({ kind: 'squad', factoryId: factory.id, squadId: squad.id }, `Remove ${squad.name}?`, 'This removes this Squad from the preview only. No real agents, cards, or files are changed.');
  } else if (action === 'move-factory' || action === 'move-squad') {
    const list = action === 'move-factory' ? plan.factories : factory.squads;
    const id = action === 'move-factory' ? factory.id : squad?.id;
    const index = list.findIndex((entry) => entry.id === id);
    const direction = Number(button.dataset.direction);
    const destination = index + direction;
    if (index < 0 || ![-1, 1].includes(direction) || destination < 0 || destination >= list.length) {
      announce('That move is not available. Use the enabled arrangement controls.');
      return;
    }
    [list[index], list[destination]] = [list[destination], list[index]];
    renderTeams();
    $(action === 'move-factory' ? `factory-name-${id}` : `squad-name-${id}`).focus();
    announce('Blueprint arrangement updated. Shared planning and team membership are unchanged.');
  }
}

function renderBlueprint() {
  const totals = teamTotals();
  $('blueprint-stats').replaceChildren(...[
    [totals.factories, totals.factories === 1 ? 'Factory' : 'Factories'],
    [totals.squads, totals.squads === 1 ? 'Squad' : 'Squads'],
    [totals.builders, 'AI builders, planned'],
    [1, 'Shared product plan'],
  ].map(([value, label]) => {
    const stat = element('div', undefined, 'stat');
    stat.append(element('strong', String(value)), element('span', label));
    return stat;
  }));
  $('blueprint-product').replaceChildren(
    element('span', 'YOUR PRODUCT / SHARED BY EVERY TEAM', 'eyebrow purple'),
    element('h2', plan.name.trim()), element('p', plan.goal.trim()), sharedChips(),
  );
  $('blueprint-factories').replaceChildren(...plan.factories.map((factory) => {
    const card = element('article', undefined, 'factory-summary');
    const header = element('header');
    const mark = element('span', undefined, 'path-icon purple');
    mark.append(icon('factory'));
    const title = element('div');
    title.append(element('h3', factory.name.trim()), element('p', 'Coordinates delivery / shares product direction'));
    header.append(mark, title);
    card.append(header);
    for (const squad of factory.squads) {
      const count = builderNumber(squad);
      const node = element('section', undefined, 'summary-squad');
      node.append(element('h4', squad.name.trim()), element('p', `${count} proposed ${count === 1 ? 'builder' : 'builders'}`), avatars(count), boardPreview());
      card.append(node);
    }
    return card;
  }));
  const path = paths.find((entry) => entry.id === plan.path);
  const requirements = element('button', 'Review my setup requirements', 'text-button');
  requirements.type = 'button';
  requirements.dataset.dialog = 'compare-dialog';
  $('blueprint-path').replaceChildren(
    element('span', 'YOUR WAY IN', 'eyebrow purple'), pathIcon(path),
    element('h2', path.title), availability(path), element('p', path.consideration), pathFacts(path), requirements,
  );
}

function renderRoute() {
  const hash = window.location.hash;
  if (hash === '#main') {
    $('main').focus();
    return;
  }
  const match = /^#setup\/([1-3])$/.exec(hash);
  const activationMatch = /^#activate\/([1-3])$/.exec(hash);
  let view = !hash || hash === '#welcome' ? 'welcome' : hash === '#factory' ? 'factory' : hash === '#blueprint' ? 'blueprint' : match ? 'setup' : activationMatch ? 'activation' : ['#cycle', '#demo-cycle'].includes(hash) ? 'cycle' : ['#outcome', '#demo-outcome'].includes(hash) ? 'outcome' : 'welcome';
  let step = match ? Number(match[1]) - 1 : 0;
  let demoStep = activationMatch ? Number(activationMatch[1]) - 1 : 0;
  let redirected = false;
  const missing = firstMissingStep();
  if ((['blueprint', 'activation', 'cycle', 'outcome', 'factory'].includes(view) && missing < 3) || (view === 'setup' && step > missing)) {
    view = 'setup';
    step = missing;
    window.history.replaceState(null, '', `#setup/${step + 1}`);
    redirected = true;
  } else if (view === 'welcome' && hash && hash !== '#welcome') {
    window.history.replaceState(null, '', '#welcome');
    announce("That link isn't part of Studio. Start here to build your blueprint.");
  }
  syncBlueprint();
  if (['activation', 'cycle', 'outcome'].includes(view)) {
    const terminal = ['complete', 'failed', 'cancelled'].includes(activation.status);
    if (view === 'cycle' && terminal) view = 'outcome';
    if (view === 'outcome' && ['running', 'paused', 'interrupted', 'review-required', 'verifying', 'verified'].includes(activation.status)) view = 'cycle';
    if ((['cycle', 'outcome'].includes(view) && activation.status === 'idle') || (view === 'activation' && demoStep > earliestActivationStep())) {
      view = 'activation';
      demoStep = earliestActivationStep();
      window.history.replaceState(null, '', `#activate/${demoStep + 1}`);
    }
  }
  activeView = view;
  for (const name of ['welcome', 'setup', 'blueprint', 'activation', 'cycle', 'outcome', 'factory']) $(`${name}-view`).hidden = name !== view;
  clearError();
  if (view === 'setup') {
    currentStep = step;
    renderProgress(step);
    for (const [index, id] of ['path-step', 'product-step', 'team-step'].entries()) $(id).hidden = index !== step;
    if (plan.path) choosePath(plan.path);
    else renderPathDetail();
    $('product-name').value = plan.name;
    $('product-goal').value = plan.goal;
    if (step === 2) renderTeams();
    $('previous-step').textContent = step === 0 ? 'Home' : 'Back';
    $('next-step').replaceChildren(element('span', step === 2 ? 'See my blueprint' : 'Continue'), icon('arrow'));
    $('setup-title').focus();
    document.title = `Step ${step + 1}: ${['Your setup', 'Your idea', 'Your team'][step]} | ADHD Studio`;
    if (redirected) showError(issueForStep(step));
  } else if (view === 'blueprint') {
    renderBlueprint();
    $('blueprint-title').focus();
    document.title = 'Your blueprint | ADHD Studio';
  } else if (view === 'activation') {
    clearActivationError();
    renderActivation(demoStep);
    $('activation-title').focus();
    document.title = `Activation ${demoStep + 1}/3 | ADHD Studio`;
  } else if (view === 'factory') {
    renderFactory();
    $('factory-title').focus();
    document.title = 'Factory control center | ADHD Studio';
  } else if (view === 'cycle') {
    renderCycle();
    $('cycle-title').focus();
    document.title = 'Live bounded cycle | ADHD Studio';
  } else if (view === 'outcome') {
    renderOutcome();
    $('outcome-title').focus();
    document.title = 'Cycle outcome | ADHD Studio';
  } else {
    $('welcome-title').focus();
    document.title = 'ADHD Studio | From idea to team';
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', (event) => {
  const dialogButton = event.target.closest('[data-dialog]');
  const close = event.target.closest('[data-close-dialog]');
  const select = event.target.closest('[data-select-path]');
  const action = event.target.closest('[data-action]');
  if (dialogButton) showDialog(dialogButton.dataset.dialog);
  else if (close) close.closest('dialog').close();
  else if (select) {
    choosePath(select.dataset.selectPath);
    select.closest('dialog')?.close();
    navigate('#setup/1');
    announce(`Selected ${paths.find((path) => path.id === plan.path).title}.`);
  } else if (action) actOnTeam(action);
});

$('setup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const issue = issueForStep(currentStep);
  if (issue) showError(issue);
  else navigate(currentStep === 2 ? '#blueprint' : `#setup/${currentStep + 2}`);
});
$('previous-step').addEventListener('click', () => navigate(currentStep === 0 ? '#welcome' : `#setup/${currentStep}`));
$('product-name').addEventListener('input', (event) => { plan.name = event.target.value; clearError(); });
$('product-goal').addEventListener('input', (event) => { plan.goal = event.target.value; clearError(); });
$('sample-idea').addEventListener('click', () => {
  plan.name = 'Neighborhood Helper';
  plan.goal = 'Help neighbors find trusted local services without endless searching.';
  $('product-name').value = plan.name;
  $('product-goal').value = plan.goal;
  clearError();
  $('product-name').focus();
  announce('A sample idea is filled in. Make it yours or continue exploring.');
});
$('teams-editor').addEventListener('input', (event) => {
  const input = event.target;
  const factory = plan.factories.find((entry) => entry.id === input.dataset.factoryId);
  if (!factory) { announce('That Factory is no longer in this preview. Use the current controls.'); return; }
  if (input.dataset.field === 'factory-name') {
    factory.name = input.value;
    updateNameControls(input, 'factory', factory.name);
  }
  else {
    const squad = factory.squads.find((entry) => entry.id === input.dataset.squadId);
    if (!squad) { announce('That Squad is no longer in this preview. Use the current controls.'); return; }
    if (input.dataset.field === 'squad-name') {
      squad.name = input.value;
      updateNameControls(input, 'squad', squad.name);
    }
    else if (input.dataset.field === 'members') {
      squad.members = input.value;
      input.closest('.builder-control').querySelector('.builder-avatars').replaceWith(avatars(builderNumber(squad)));
    }
  }
  clearError();
  renderTeamCount();
});
for (const [id, view] of [['guided-view', 'guided'], ['canvas-view', 'canvas']]) {
  $(id).addEventListener('click', () => {
    editorView = view;
    renderTeams();
    announce(`${view === 'canvas' ? 'Visual canvas' : 'Guided setup'} open. The same blueprint and team controls are preserved.`);
  });
}
$('add-factory').addEventListener('click', () => {
  if (plan.factories.length >= 4) { announce('The prototype limit is four Factories.'); return; }
  const number = plan.nextFactory++;
  const factory = { id: `f${number}`, name: `Factory ${number}`, squads: [newSquad()] };
  plan.factories.push(factory);
  renderTeams();
  $(`factory-name-${factory.id}`).focus();
  announce('Factory added. Both Factories share the same product backlog and roadmap.');
});
$('start-over').addEventListener('click', () => confirmChange(
  { kind: 'reset' }, 'Start a fresh blueprint?',
  'Clear this browser draft and disconnect? Product records are retained. Cancel or accept any unfinished cycle first.', 'Start over',
));
$('confirm-action').addEventListener('click', () => {
  const action = pendingAction;
  pendingAction = null;
  $('confirm-dialog').close();
  if (action?.kind === 'reset') {
    if (activation.run && !['complete', 'failed', 'cancelled'].includes(activation.status)) {
      announce('An unfinished cycle remains. Cancel or accept it before clearing this draft.');
      return;
    }
    plan = initialPlan();
    editorView = 'guided';
    disconnectFactoryFleet(activation.endpoint);
    activation.disconnect();
    $('demo-feedback-form').reset();
    $('demo-feedback-text').value = '';
    $('demo-feedback-receipt').hidden = true;
    for (const radio of $('path-options').querySelectorAll('input')) radio.checked = false;
    for (const card of $('path-options').children) card.classList.remove('selected');
    navigate('#welcome');
    announce('Browser draft cleared. Product Git records and history were preserved.');
    return;
  }
  const factory = plan.factories.find((entry) => entry.id === action?.factoryId);
  if (!factory) { announce('That part of the blueprint is already gone. Nothing else was changed.'); return; }
  if (action.kind === 'factory' && plan.factories.length > 1) {
    plan.factories = plan.factories.filter((entry) => entry.id !== factory.id);
  } else if (action.kind === 'squad' && factory.squads.length > 1) {
    factory.squads = factory.squads.filter((entry) => entry.id !== action.squadId);
  } else {
    announce('Keep at least one Factory and one Squad in this preview.');
    return;
  }
  renderTeams();
  $('add-factory').focus();
  announce('Removed from the blueprint only. The shared product plan is unchanged.');
});
$('confirm-dialog').addEventListener('close', () => { pendingAction = null; });
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('keydown', (event) => {
    // Some embedded browsers do not deliver native dialog cancellation.
    if (event.key === 'Escape' && dialog.open) {
      event.preventDefault();
      dialog.close();
    }
  });
}
$('begin-from-explanation').addEventListener('click', () => { $('how-dialog').close(); navigate('#setup/1'); });
$('print-blueprint').addEventListener('click', () => window.print());
window.addEventListener('hashchange', renderRoute);

document.addEventListener('DOMContentLoaded', () => {
  initializeLiveUI();
  renderPathChoices();
  renderAgents();
  renderRoute();
});
