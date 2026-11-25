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
    id: 'hosted', title: 'Just a browser', caption: 'Open a page. Leave the machinery to a hosted service.',
    symbol: 'cloud', color: 'purple', status: 'Concept path', documented: false,
    install: 'No local installation', runner: 'A separately hosted agent service',
    consideration: 'A hosting owner must define data access, storage, costs, and service permissions.',
    requirements: ['A browser and internet access', 'An implemented, approved hosted agent service', 'Provider sign-in and a product-owned Git workspace'],
  },
  {
    id: 'local', title: 'Browser + my computer', caption: 'A browser workspace, with an agent service on your device.',
    symbol: 'laptop', color: 'green', status: 'Concept path', documented: false,
    install: 'A lightweight local agent service', runner: 'Your device, through that service',
    consideration: 'Local tooling and provider access still need setup. An editor would not be required.',
    requirements: ['A browser', 'An implemented local service and compatible agent runtime', 'Provider sign-in, Git, and an approved local product workspace'],
  },
  {
    id: 'self-hosted', title: "My team's infrastructure", caption: 'A shared workspace on infrastructure your team manages.',
    symbol: 'network', color: 'orange', status: 'Concept path', documented: false,
    install: 'Team-managed hosting or containers', runner: 'Your approved team infrastructure',
    consideration: 'A team owner must manage deployment, isolation, secrets, access, and operating costs.',
    requirements: ['An approved hosting or container environment', 'An implemented team service and runtime adapters', 'Team authentication, protected Git storage, and an operations owner'],
  },
  {
    id: 'cli', title: 'My terminal', caption: 'Stay close to your tools with a command-line workflow.',
    symbol: 'terminal', color: 'pink', status: 'Concept path', documented: false,
    install: 'A compatible CLI and orchestration adapter', runner: 'The environment where your CLI runs',
    consideration: 'Command-line access alone does not load these roles or prove nested-agent support.',
    requirements: ['An installed, compatible agent CLI', 'Implemented role loading and Factory/Squad orchestration', 'Provider authentication, Git, and verified tool permissions'],
  },
  {
    id: 'vscode', title: 'VS Code + Copilot', caption: 'Use the editor-based starting point documented in this repo.',
    symbol: 'code', color: 'blue', status: 'Documented path', documented: true,
    install: 'VS Code and the GitHub Copilot extension', runner: 'Your configured Copilot session harness',
    consideration: 'The current route still needs actual host, nested-tool, permission, and capacity checks.',
    requirements: ['VS Code with GitHub Copilot installed', 'A GitHub account and eligible Copilot access', 'The framework checkout, product workspace, and active harness verification'],
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
const activation = new ActivationDemo();
let activationStep = 0;
let activeView = 'welcome';
let simulationTimer = null;
const cycleStages = [
  ['Understand the need', 'A research helper frames the sample need.', 'VOC / ProductOwner'],
  ['Choose one ready card', 'A product guide and work organizer allocate one demo card.', 'ProductOwner / AssociateProductOwner / Kanban'],
  ['Build a small increment', 'The assigned Squad illustrates a small product introduction.', 'Squad / Fullstacker'],
  ['Verify and record the result', 'A scripted check passes or fails; completion stays separate from the board.', 'Squad / Kanban'],
];

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
    ['Current framework support', path.documented ? 'Documented; live capability still needs verification' : 'Proposed; integration is not implemented here'],
  ]) {
    const group = element('div');
    group.append(element('dt', label), element('dd', value));
    list.append(group);
  }
  return list;
}

function choosePath(id) {
  if (!paths.some((path) => path.id === id)) {
    announce('That setup path is not available in this prototype. Choose one of the five shown.');
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
      element('h3', "You don't need to install anything to try this."),
      element('p', 'Choose a path to see what it would need for real use. Browser-only, local, team-hosted, terminal, and editor options are all yours to explore.'),
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

function clearSimulationTimer() {
  if (simulationTimer !== null) window.clearTimeout(simulationTimer);
  simulationTimer = null;
}

function syncDemoBlueprint() {
  const binding = firstMissingStep() === 3 ? JSON.stringify([plan.path, plan.name, plan.goal, plan.factories]) : '';
  const changed = activation.bind(binding);
  if (changed) {
    clearSimulationTimer();
    activation.setReview({ ...activation.review, scope: plan.goal });
  }
  return changed;
}

function clearActivationError() {
  $('activation-error').hidden = true;
  $('activation-error').textContent = '';
  for (const field of $('activation-form').querySelectorAll('[aria-invalid="true"]')) {
    field.removeAttribute('aria-invalid');
    const ids = (field.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== 'activation-error');
    if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
    else field.removeAttribute('aria-describedby');
  }
}

function showActivationError(result) {
  clearActivationError();
  $('activation-error').textContent = result.error;
  $('activation-error').hidden = false;
  if (result.field && $(result.field)) {
    const field = $(result.field);
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', `${field.getAttribute('aria-describedby') ?? ''} activation-error`.trim());
    field.focus();
  }
}

function demoStatus(id, text, tone = '') {
  $(id).textContent = text;
  $(id).className = `demo-status${tone ? ` is-${tone}` : ''}`;
}

function recap(id, entries) {
  $(id).replaceChildren(...entries.map(([label, text]) => {
    const group = element('div');
    group.append(element('small', label), element('strong', text));
    return group;
  }));
}

function earliestActivationStep() {
  return activation.connection !== 'connected' ? 0 : activation.reviewIssue() ? 1 : 2;
}

function renderActivationProgress(step) {
  $('activation-steps').replaceChildren(...['Workspace and runtime', 'Review boundaries', 'Demo readiness', 'First demo cycle'].map((label, index) => {
    const item = element('li');
    const button = element('button');
    button.type = 'button';
    button.disabled = index > earliestActivationStep() && !(index === 3 && activation.status !== 'idle');
    if (index === step) button.setAttribute('aria-current', 'step');
    if (index < step) item.className = 'complete';
    const number = element('span', index < step ? undefined : String(index + 1), 'step-number');
    number.setAttribute('aria-hidden', 'true');
    if (index < step) number.append(icon('check'));
    button.append(number, element('span', label));
    button.addEventListener('click', () => navigate(index === 3 ? ['complete', 'failed', 'cancelled'].includes(activation.status) ? '#demo-outcome' : '#demo-cycle' : `#activate/${index + 1}`));
    item.append(button);
    return item;
  }));
}

function renderActivation(step = activationStep) {
  activationStep = step;
  renderActivationProgress(step);
  for (const [index, id] of ['connect-panel', 'review-panel', 'readiness-panel'].entries()) $(id).hidden = index !== step;
  const path = paths.find((entry) => entry.id === plan.path);
  $('demo-runtime').replaceChildren(
    element('span', 'YOUR CHOSEN PATH / DEMO ONLY', 'eyebrow purple'), pathIcon(path),
    element('h2', path.title), availability(path), element('p', 'The same activation demo works for every modality. None connects to an actual runtime.'), pathFacts(path),
  );
  $('demo-repository').value = activation.repository;
  $('demo-scope').value = activation.review.scope;
  $('demo-budget').value = activation.review.budget;
  $('demo-write').checked = activation.review.write;
  $('demo-verify').checked = activation.review.verify;
  $('demo-scenario').value = activation.scenario;
  const connectionText = {
    idle: 'No simulated link yet. Use a sample reference and run the connection demo.',
    checking: 'Simulating a connection. No network request or authentication is happening.',
    connected: 'Simulated connection established. Real repository and runtime access remain unverified.',
    failed: 'The injected connection attempt failed. Retry explicitly to continue this scenario.',
  };
  demoStatus('demo-connection-status', connectionText[activation.connection], activation.connection === 'connected' ? 'good' : activation.connection === 'failed' ? 'warning' : '');
  $('simulate-connection').disabled = ['checking', 'connected'].includes(activation.connection);
  $('simulate-connection').textContent = activation.connection === 'failed' ? 'Retry simulated connection' : 'Simulate connection';
  $('demo-scenario').disabled = activation.connection === 'checking';
  $('cancel-demo-check').hidden = activation.connection !== 'checking';
  recap('demo-review-summary', [
    ['Demo scope', activation.review.scope],
    ['Sample limit / never charged', `$${Number(activation.review.budget).toFixed(2)}`],
    ['Operating window', 'One scripted first cycle'],
  ]);
  const readinessText = {
    unchecked: 'Not checked yet. Run the simulated checks before starting.',
    checking: 'Running staged checks against the current page-only inputs.',
    ready: 'All demo checks pass. This is not real-host readiness or launch approval.',
    blocked: 'The demo has a readiness gap. Review the failed item before starting.',
  };
  demoStatus('demo-readiness-status', readinessText[activation.readiness], activation.readiness === 'ready' ? 'good' : activation.readiness === 'blocked' ? 'warning' : '');
  $('demo-checks').replaceChildren(...activation.checks.map((check, index) => {
    const row = element('li');
    const badge = element('span', check.ok ? undefined : String(index + 1), `step-bubble ${check.ok ? 'mint' : 'peach'}`);
    if (check.ok) badge.append(icon('check'));
    badge.setAttribute('aria-hidden', 'true');
    const detail = element('div');
    detail.append(element('h3', check.title), element('p', check.note), element('span', check.ok ? 'DEMO PASS / not live verification' : 'DEMO GAP / not ready', 'check-label'));
    row.append(badge, detail);
    return row;
  }));
  $('run-demo-checks').disabled = activation.readiness === 'checking' || activation.status !== 'idle';
  $('restore-demo-capability').hidden = activation.scenario !== 'readiness-gap' || activation.capabilityRestored || activation.readiness !== 'blocked';
  $('cancel-readiness-check').hidden = activation.readiness !== 'checking';
  $('activation-back').textContent = step === 0 ? 'Blueprint' : 'Back';
  $('activation-next').textContent = step < 2 ? 'Continue' : activation.status === 'idle' ? 'Start simulated first cycle' : 'Return to demo cycle';
  $('activation-next').disabled = step === 0 ? activation.connection !== 'connected' : step === 2 ? activation.readiness !== 'ready' : false;
}

function demoAssignment() {
  const factory = plan.factories[0];
  return `${factory.name} / ${factory.squads[0].name}`;
}

function renderCycle() {
  const focusedControl = document.activeElement;
  recap('demo-cycle-context', [
    ['Product in the illustration', plan.name],
    ['Assigned demo team', demoAssignment()],
    ['Scripted cycle', `DEMO-${activation.runNumber}`],
    ['Real charge', 'None / example estimate $1.00'],
  ]);
  const message = activation.status === 'paused'
    ? `Demo paused at ${activation.phase}/4 stages. Resume continues this cursor; it does not restart completed stages.`
    : `Simulated cycle running: ${activation.phase}/4 scripted stages complete. No real agents are executing.`;
  demoStatus('demo-cycle-status', message, activation.status === 'paused' ? 'warning' : '');
  $('demo-cycle-steps').replaceChildren(...cycleStages.map(([title, description, roles], index) => {
    const passed = index < activation.phase;
    const row = element('li', undefined, index === activation.phase ? 'is-current' : '');
    const badge = element('span', passed ? undefined : String(index + 1), `step-bubble ${passed ? 'mint' : 'lavender'}`);
    if (passed) badge.append(icon('check'));
    badge.setAttribute('aria-hidden', 'true');
    const detail = element('div');
    detail.append(element('h2', title), element('p', description), element('small', `${roles} / ${passed ? 'scripted pass' : 'simulated, not live'}`));
    row.append(badge, detail);
    return row;
  }));
  for (const id of ['demo-board-todo', 'demo-board-progress']) $(id).replaceChildren(element('p', 'No demo card in this column.'));
  if (activation.status !== 'complete') {
    const card = element('article', undefined, 'demo-card');
    card.append(element('strong', `DEMO-${activation.runNumber} / simulated card`), element('p', activation.review.scope));
    $(activation.phase < 2 ? 'demo-board-todo' : 'demo-board-progress').replaceChildren(card);
  }
  $('pause-demo-cycle').hidden = activation.status !== 'running';
  $('resume-demo-cycle').hidden = activation.status !== 'paused';
  $('end-demo-cycle').hidden = !['running', 'paused'].includes(activation.status);
  if (focusedControl === $('pause-demo-cycle') && activation.status === 'paused') $('resume-demo-cycle').focus();
  if (focusedControl === $('resume-demo-cycle') && activation.status === 'running') $('pause-demo-cycle').focus();
}

function renderOutcome() {
  const complete = activation.status === 'complete';
  $('outcome-title').textContent = complete ? "You've completed the activation demo." : activation.status === 'failed' ? 'The demo verification did not pass.' : 'The demo ended before completion.';
  $('demo-outcome-description').textContent = complete
    ? 'A staged first-cycle outcome. No real product was built or validated.'
    : 'Unfinished work stays unfinished. No completion or delivered value is claimed.';
  recap('demo-outcome-summary', [
    ['Scripted cycle', `DEMO-${activation.runNumber}`],
    ['Simulated result', activation.status],
    ['Stages completed', `${activation.phase}/4`],
    ['Real execution / charges', 'None'],
  ]);
  $('demo-result-preview').replaceChildren(
    element('span', 'SAMPLE FIRST INCREMENT / NOT GENERATED CODE', 'eyebrow purple'),
    element('h2', 'A small product introduction'),
    element('p', 'This static preview illustrates a potential first increment. It does not establish that your idea was implemented.'),
  );
  const sample = element('div', undefined, 'sample-increment');
  sample.append(element('h3', plan.name), element('p', activation.review.scope));
  $('demo-result-preview').append(sample);
  $('demo-completion-record').replaceChildren(
    element('span', 'STAGED EVIDENCE / NOT EMPIRICAL DONE', 'eyebrow purple'),
    element('h2', complete ? `Sample completion: SIM-COMP-${activation.runNumber}` : 'No completion record'),
    element('p', complete ? 'All four scripted stages passed. The illustrated card is removed from the unfinished board; this is not Git-tracked or independently verified evidence.' : 'The sample card remains unfinished. A failed or cancelled demo does not produce completion evidence.'),
    element('p', 'Real delivery would need attributable sources, integrated acceptance checks, actual tool/permission evidence, and separate release authority.'),
  );
}

function queueCycle(token) {
  simulationTimer = window.setTimeout(() => {
    if (token !== activation.generation) return;
    simulationTimer = null;
    if (syncDemoBlueprint()) { navigate('#activate/1'); announce('Blueprint changed. Reconnect and recheck the activation demo.'); return; }
    const result = activation.advance(token);
    if (result.stale) return;
    renderCycle();
    if (['complete', 'failed'].includes(activation.status)) navigate('#demo-outcome');
    else if (activation.status === 'paused') announce('The scripted interruption paused the demo. Resume from the saved stage.');
    else queueCycle(token);
  }, 800);
}

function simulateConnection() {
  clearActivationError();
  const result = activation.beginConnection();
  if (!result.ok) { showActivationError(result); return; }
  clearSimulationTimer();
  renderActivation();
  simulationTimer = window.setTimeout(() => {
    if (result.token !== activation.generation) return;
    simulationTimer = null;
    syncDemoBlueprint();
    const finished = activation.finishConnection(result.token);
    renderActivation();
    if (!finished.ok && !finished.stale) showActivationError(finished);
  }, 600);
}

function simulateChecks() {
  clearActivationError();
  const result = activation.beginChecks();
  if (!result.ok) { showActivationError(result); return; }
  clearSimulationTimer();
  renderActivation();
  simulationTimer = window.setTimeout(() => {
    if (result.token !== activation.generation) return;
    simulationTimer = null;
    syncDemoBlueprint();
    const finished = activation.finishChecks(result.token);
    renderActivation();
    if (!finished.ok && !finished.stale) announce('The staged checks found a gap. Review the demo results.');
  }, 600);
}

function readDemoReview() {
  return { scope: $('demo-scope').value, budget: $('demo-budget').value, write: $('demo-write').checked, verify: $('demo-verify').checked };
}

function renderRoute() {
  const hash = window.location.hash;
  if (hash === '#main') {
    $('main').focus();
    return;
  }
  const match = /^#setup\/([1-3])$/.exec(hash);
  const activationMatch = /^#activate\/([1-3])$/.exec(hash);
  let view = !hash || hash === '#welcome' ? 'welcome' : hash === '#blueprint' ? 'blueprint' : match ? 'setup' : activationMatch ? 'activation' : hash === '#demo-cycle' ? 'cycle' : hash === '#demo-outcome' ? 'outcome' : 'welcome';
  let step = match ? Number(match[1]) - 1 : 0;
  let demoStep = activationMatch ? Number(activationMatch[1]) - 1 : 0;
  let redirected = false;
  const missing = firstMissingStep();
  if ((['blueprint', 'activation', 'cycle', 'outcome'].includes(view) && missing < 3) || (view === 'setup' && step > missing)) {
    view = 'setup';
    step = missing;
    window.history.replaceState(null, '', `#setup/${step + 1}`);
    redirected = true;
  } else if (view === 'welcome' && hash && hash !== '#welcome') {
    window.history.replaceState(null, '', '#welcome');
    announce("That link isn't part of this prototype. Start here to build your blueprint.");
  }
  syncDemoBlueprint();
  if (['activation', 'cycle', 'outcome'].includes(view)) {
    const terminal = ['complete', 'failed', 'cancelled'].includes(activation.status);
    if (view === 'cycle' && terminal) view = 'outcome';
    if (view === 'outcome' && ['running', 'paused'].includes(activation.status)) view = 'cycle';
    if ((['cycle', 'outcome'].includes(view) && activation.status === 'idle') || (view === 'activation' && demoStep > earliestActivationStep())) {
      view = 'activation';
      demoStep = earliestActivationStep();
      window.history.replaceState(null, '', `#activate/${demoStep + 1}`);
    }
  }
  if (activation.status === 'running' && view !== 'cycle') {
    clearSimulationTimer();
    activation.pause();
    announce('Demo paused while you review another view. Its page-only cursor is preserved.');
  }
  if (view !== 'activation' && (activation.connection === 'checking' || activation.readiness === 'checking')) {
    clearSimulationTimer();
    activation.interruptPending();
  }
  activeView = view;
  for (const name of ['welcome', 'setup', 'blueprint', 'activation', 'cycle', 'outcome']) $(`${name}-view`).hidden = name !== view;
  clearError();
  if (view === 'setup') {
    currentStep = step;
    renderProgress(step);
    for (const [index, id] of ['path-step', 'product-step', 'team-step'].entries()) $(id).hidden = index !== step;
    renderPathDetail();
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
    document.title = `Activation demo ${demoStep + 1}/3 | ADHD Studio`;
  } else if (view === 'cycle') {
    renderCycle();
    $('cycle-title').focus();
    document.title = 'Simulated first cycle | ADHD Studio';
  } else if (view === 'outcome') {
    renderOutcome();
    $('outcome-title').focus();
    document.title = 'Activation demo outcome | ADHD Studio';
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
  'Your product name, idea, and team drawing will be cleared from this page. No real files or agents are affected. Print your current blueprint first if you want a copy.', 'Start over',
));
$('confirm-action').addEventListener('click', () => {
  const action = pendingAction;
  pendingAction = null;
  $('confirm-dialog').close();
  if (action?.kind === 'reset') {
    plan = initialPlan();
    editorView = 'guided';
    clearSimulationTimer();
    activation.reset('');
    $('demo-feedback-form').reset();
    $('demo-feedback-text').value = '';
    $('demo-feedback-receipt').hidden = true;
    for (const radio of $('path-options').querySelectorAll('input')) radio.checked = false;
    for (const card of $('path-options').children) card.classList.remove('selected');
    navigate('#welcome');
    announce('Fresh start. Your previous page-only draft is cleared.');
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
$('sample-workspace').addEventListener('click', () => {
  const sample = 'https://example.invalid/demo/product';
  if (activation.repository !== sample) clearSimulationTimer();
  activation.setRepository(sample);
  clearActivationError();
  renderActivation();
  $('demo-repository').focus();
});
$('demo-repository').addEventListener('input', (event) => {
  if (event.target.value === activation.repository) return;
  clearSimulationTimer();
  activation.setRepository(event.target.value);
  clearActivationError();
  demoStatus('demo-connection-status', 'Reference changed. Run the simulated connection again; nothing is fetched.');
  $('simulate-connection').disabled = false;
  $('activation-next').disabled = true;
});
$('demo-scenario').addEventListener('change', (event) => {
  if (event.target.value !== activation.scenario) clearSimulationTimer();
  const result = activation.setScenario(event.target.value);
  renderActivation();
  if (!result.ok) showActivationError(result);
});
for (const id of ['demo-scope', 'demo-budget', 'demo-write', 'demo-verify']) {
  $(id).addEventListener('input', () => {
    const review = readDemoReview();
    if (JSON.stringify(review) === JSON.stringify(activation.review)) return;
    clearSimulationTimer();
    activation.setReview(review);
    clearActivationError();
  });
}
$('simulate-connection').addEventListener('click', simulateConnection);
$('run-demo-checks').addEventListener('click', simulateChecks);
for (const id of ['cancel-demo-check', 'cancel-readiness-check']) {
  $(id).addEventListener('click', () => {
    clearSimulationTimer();
    activation.interruptPending();
    renderActivation();
    $(id === 'cancel-demo-check' ? 'simulate-connection' : 'run-demo-checks').focus();
    announce('Pending simulation cancelled. No link or readiness is claimed.');
  });
}
$('restore-demo-capability').addEventListener('click', () => {
  activation.restoreCapability();
  renderActivation();
  $('run-demo-checks').focus();
  announce('The injected sample capability is restored. Run the checks again; real permissions are unchanged.');
});
$('activation-back').addEventListener('click', () => navigate(activationStep === 0 ? '#blueprint' : `#activate/${activationStep}`));
$('activation-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearActivationError();
  if (activationStep === 0) {
    if (activation.connection !== 'connected') { showActivationError({ error: 'Complete the simulated connection first.' }); return; }
    navigate('#activate/2');
  } else if (activationStep === 1) {
    activation.setReview(readDemoReview());
    const issue = activation.reviewIssue();
    if (issue) { showActivationError(issue); return; }
    navigate('#activate/3');
  } else {
    if (activation.readiness !== 'ready') { showActivationError({ error: 'Pass the current demo checks before starting.' }); return; }
    if (activation.status !== 'idle') {
      navigate(['complete', 'failed', 'cancelled'].includes(activation.status) ? '#demo-outcome' : '#demo-cycle');
      return;
    }
    const started = activation.start();
    if (!started.ok) { showActivationError(started); return; }
    $('activation-next').disabled = true;
    navigate('#demo-cycle');
    queueCycle(started.token);
  }
});
$('pause-demo-cycle').addEventListener('click', () => {
  const result = activation.pause();
  if (!result.ok) { demoStatus('demo-cycle-status', result.error, 'warning'); return; }
  clearSimulationTimer();
  renderCycle();
  $('resume-demo-cycle').focus();
});
$('resume-demo-cycle').addEventListener('click', () => {
  const result = activation.resume();
  if (!result.ok) { demoStatus('demo-cycle-status', result.error, 'warning'); return; }
  renderCycle();
  $('pause-demo-cycle').focus();
  queueCycle(result.token);
});
$('end-demo-cycle').addEventListener('click', () => {
  const result = activation.cancel();
  if (!result.ok) { demoStatus('demo-cycle-status', result.error, 'warning'); return; }
  clearSimulationTimer();
  navigate('#demo-outcome');
});
$('replay-demo').addEventListener('click', () => {
  const result = activation.replay();
  if (!result.ok) { announce(result.error); return; }
  navigate('#activate/3');
});
$('focus-demo-feedback').addEventListener('click', () => {
  $('demo-feedback-response').focus();
  $('feedback-title').scrollIntoView({ block: 'start' });
});
$('demo-feedback-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const response = $('demo-feedback-response');
  const labels = { unaided: 'Reported completion without outside guidance', 'help-needed': 'Reported needing help', confusing: 'Reported a confusing journey' };
  if (!labels[response.value] || !['complete', 'failed', 'cancelled'].includes(activation.status)) {
    $('demo-feedback-error').textContent = 'Choose your experience after finishing or ending the activation demo.';
    $('demo-feedback-error').hidden = false;
    response.setAttribute('aria-invalid', 'true');
    response.setAttribute('aria-describedby', 'demo-feedback-error');
    response.focus();
    return;
  }
  $('demo-feedback-error').hidden = true;
  response.removeAttribute('aria-invalid');
  response.removeAttribute('aria-describedby');
  const path = paths.find((entry) => entry.id === plan.path);
  $('demo-feedback-text').value = [
    'ADHD Studio activation demo feedback', 'Mode: simulation only',
    `Setup path: ${path.title}`, `Scenario: ${activation.scenario}`,
    `Scripted cycle: DEMO-${activation.runNumber}`, `Scripted result: ${activation.status}`,
    `Participant response: ${labels[response.value]}`,
    '', 'What worked / where I got stuck:', $('demo-feedback-notes').value.trim() || '(No additional notes supplied)',
    '', 'No real agents, runtime access, Git changes, costs, or customer-value delivery were verified.',
  ].join('\n');
  $('demo-feedback-receipt').hidden = false;
  demoStatus('demo-feedback-status', 'Feedback prepared on this page only. Copy it to keep or share it; nothing was submitted.', 'good');
  $('demo-feedback-text').focus();
});
$('select-demo-feedback').addEventListener('click', () => {
  $('demo-feedback-text').focus();
  $('demo-feedback-text').select();
  announce('Feedback text selected. Copy with Ctrl+C or Command+C. It is not sent automatically.');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && activation.status === 'running') {
    clearSimulationTimer();
    activation.pause();
    if (activeView === 'cycle') renderCycle();
  }
});
window.addEventListener('hashchange', renderRoute);

renderPathChoices();
renderAgents();
renderRoute();
