'use strict';

const factoryActionLabels = [
  ['technical-decisions', 'Delegate technical choices to the Fullstacker council'],
  ['replenish', 'Replenish evidenced work within the mission'],
  ['generate', 'Share scoped product source with the provider and generate code'],
  ['verify', 'Execute the approved acceptance program on its verification worker'],
  ['integrate', 'Integrate unchanged, verified candidates locally'],
  ['git-publish', 'Publish Git changes through the configured adapter'],
  ['merge-pull-request', 'Merge only after required reviews and checks'],
  ['infrastructure', 'Apply priced and approved infrastructure plans'],
  ['deploy-nonproduction', 'Deploy to development / staging'],
  ['release-production', 'Release under an explicit production policy'],
];
const factoryFleet = new Map();
let factoryBusy = false;
let deploymentFormBinding = null;
let mandateFormBinding = null;

function setFactoryFields(values) {
  for (const [id, value] of Object.entries(values)) $(id).value = value ?? '';
}

function renderFactory() {
  const connected = activation.connection === 'connected';
  const state = activation.state;
  const factory = state?.factory;
  $('factory-connection').textContent = connected
    ? `Connected product: ${state.blueprint?.name ?? 'No saved blueprint'} / ${state.repository.workspace}. No permission is inferred from connection.`
    : 'No product service connected. Planning does not launch a Factory; connect deliberately to a service you trust.';
  const binding = JSON.stringify(plan.deployment ?? null);
  if (binding !== deploymentFormBinding) {
    deploymentFormBinding = binding;
    const options = plan.deployment;
    if (options) {
      setFactoryFields({
        'factory-target': options.target, 'factory-topology': options.topology, 'factory-startup': options.startup,
        'factory-human-mode': options.humanMode, 'factory-cloud': options.factoryCloud,
        'factory-product-cloud': options.productCloud, 'factory-redundancy': options.redundancy,
        'factory-identity': options.identity, 'factory-persistence': options.persistence,
        'factory-cpu': options.resources?.cpu, 'factory-memory': options.resources?.memoryMiB,
      });
      for (const option of $('factory-stack').options) option.selected = options.toolchains?.includes(option.value) ?? false;
      $('factory-delegate-stack').checked = !options.toolchains?.length;
    }
  }
  $('factory-stack').disabled = $('factory-delegate-stack').checked;
  const modelValue = $('factory-model').value;
  const modelOptions = (activation.runtime?.models ?? []).map((model) => {
    const option = element('option', model.name ?? model.id);
    option.value = model.id;
    option.selected = model.id === (modelValue || factory?.mandate.model);
    return option;
  });
  const placeholder = element('option', 'Choose a model reported by this service');
  placeholder.value = '';
  placeholder.selected = !modelOptions.some((option) => option.selected);
  $('factory-model').replaceChildren(placeholder, ...modelOptions);
  if (!factoryActionLabels.every(([action]) => $(`factory-action-${action}`))) {
    $('factory-actions').append(...factoryActionLabels.map(([action, label]) => {
      const row = element('label', undefined, 'factory-check');
      const input = element('input');
      input.type = 'checkbox';
      input.id = `factory-action-${action}`;
      row.append(input, element('span', label));
      return row;
    }));
  }
  const mandateBinding = factory ? JSON.stringify([factory.id, factory.mandate]) : null;
  if (mandateBinding !== mandateFormBinding) {
    mandateFormBinding = mandateBinding;
    const mandate = factory?.mandate;
    if (mandate) {
      const expiry = new Date(mandate.expiresAt);
      const localExpiry = new Date(expiry.getTime() - expiry.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setFactoryFields({
        'factory-max-credits': mandate.maxCredits, 'factory-task-credits': mandate.creditsPerTask,
        'factory-max-cycles': mandate.maxCycles, 'factory-max-parallel': mandate.maxParallel,
        'factory-task-seconds': mandate.taskSeconds, 'factory-retries': mandate.maxRetries,
        'factory-expires': localExpiry, 'factory-write-paths': mandate.writePaths.join('\n'),
        'factory-currency': mandate.cost?.currency, 'factory-max-cost': mandate.cost?.maxAmount,
        'factory-credit-rate': mandate.cost?.creditRate, 'factory-infra-reserve': mandate.cost?.infrastructureReserve,
        'factory-rate-version': mandate.cost?.rateVersion,
      });
      $('factory-restart').checked = mandate.resumeOnRestart;
      for (const [action] of factoryActionLabels) $(`factory-action-${action}`).checked = mandate.actions.includes(action);
      $('factory-owner-confirm').checked = false;
    }
  }
  recap('factory-recap', factory ? [
    ['Factory ID', factory.id], ['Recorded state', factory.status], ['Verified cycles', `${factory.cycles.length} / ${factory.mandate.maxCycles}`],
    ['Accounted credit escrow', `${factory.accounting.chargedCredits.toFixed(4)} / ${factory.mandate.maxCredits}`],
    ['Active credit reservations', factory.accounting.reservedCredits.toFixed(4)], ['Authority expiry', factory.mandate.expiresAt],
  ] : [['Factory', 'Not authorized'], ['Production', 'Not inferred from a blueprint']]);
  $('factory-status').textContent = factory?.reason ?? (factory ? `Recorded ${factory.status}. Native permissions and resource limits remain binding.` : 'Accept an operating mandate before starting.');
  $('factory-agent-list').replaceChildren(...(factory?.tasks ?? []).slice(-40).reverse().map((task) => {
    const item = element('li', undefined, 'factory-assignment');
    item.append(element('strong', `${task.role} / ${task.kind}`), element('span', task.status),
      element('small', `Assignment ${task.id}; session ${task.sessionId ?? 'not observed'}; last progress ${task.lastProgressAt ?? 'not observed'}`));
    if (task.error) item.append(element('p', task.error));
    return item;
  }));
  $('factory-increments').replaceChildren(...(factory?.cycles ?? []).map((cycle) => {
    const item = element('li');
    item.append(element('strong', cycle.scope), element('p', `Integrated ${cycle.integratedHead}; acceptance exit ${cycle.integratedVerification?.exitCode ?? 'not observed'}.`));
    return item;
  }));
  $('factory-diff').textContent = factory?.candidateDiff ?? 'No captured candidate awaiting review.';
  const unavailable = factoryBusy || !connected;
  for (const id of ['factory-save-deployment', 'factory-authorize', 'factory-add-fleet']) $(id).disabled = unavailable;
  for (const id of ['factory-start', 'factory-resume', 'factory-pause', 'factory-revoke', 'factory-download-mandate', 'factory-refresh-observations']) $(id).disabled = unavailable || !factory;
  $('factory-export').disabled = unavailable || !state?.blueprint?.deployment;
  renderFactoryFleet();
}

function readFactoryDeployment() {
  if (!$('factory-delegate-stack').checked && !$('factory-stack').selectedOptions.length) throw new Error('Select an allowed work-product stack or explicitly delegate that choice.');
  return {
    version: 1, target: $('factory-target').value, topology: $('factory-topology').value,
    startup: $('factory-startup').value, humanMode: $('factory-human-mode').value,
    toolchains: $('factory-delegate-stack').checked ? [] : Array.from($('factory-stack').selectedOptions).map((option) => option.value),
    factoryCloud: $('factory-cloud').value, productCloud: $('factory-product-cloud').value,
    redundancy: $('factory-redundancy').value === '' ? null : Number($('factory-redundancy').value),
    identity: $('factory-identity').value, persistence: $('factory-persistence').value,
    resources: { cpu: Number($('factory-cpu').value), memoryMiB: Number($('factory-memory').value) },
  };
}

function readFactoryMandate() {
  const cost = $('factory-max-cost').value === '' ? null : {
    currency: $('factory-currency').value, maxAmount: Number($('factory-max-cost').value),
    creditRate: Number($('factory-credit-rate').value), infrastructureReserve: Number($('factory-infra-reserve').value),
    rateVersion: $('factory-rate-version').value,
  };
  return {
    maxCredits: Number($('factory-max-credits').value), creditsPerTask: Number($('factory-task-credits').value),
    maxCycles: Number($('factory-max-cycles').value), maxParallel: Number($('factory-max-parallel').value),
    taskSeconds: Number($('factory-task-seconds').value), maxRetries: Number($('factory-retries').value),
    expiresAt: new Date($('factory-expires').value).toISOString(), resumeOnRestart: $('factory-restart').checked,
    actions: factoryActionLabels.filter(([action]) => $(`factory-action-${action}`).checked).map(([action]) => action),
    writePaths: $('factory-write-paths').value.split(/\r?\n/).map((path) => path.trim()).filter(Boolean),
    model: $('factory-model').value, cost,
  };
}

async function performFactory(action) {
  if (factoryBusy) return;
  factoryBusy = true;
  $('factory-error').hidden = true;
  renderFactory();
  try { await action(); }
  catch (error) {
    $('factory-error').textContent = error.message;
    $('factory-error').hidden = false;
    announce(error.message);
  } finally { factoryBusy = false; renderFactory(); }
}

function downloadFactoryJson(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = element('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function disconnectFactoryFleet(origin) {
  factoryFleet.get(origin)?.disconnect();
  factoryFleet.delete(origin);
}

function renderFactoryFleet() {
  $('factory-fleet').replaceChildren(...Array.from(factoryFleet.entries()).map(([origin, client]) => {
    const item = element('article', undefined, 'factory-fleet-card');
    item.append(element('h3', client.state?.blueprint?.name ?? origin), element('p', origin),
      element('p', `${client.connection}; Factory ${client.state?.factory?.status ?? 'not authorized'}. Last verified increments: ${client.state?.factory?.cycles.length ?? 0}`));
    for (const action of ['resume', 'pause', 'revoke']) {
      const button = element('button', action, 'button secondary');
      button.type = 'button';
      button.disabled = client.connection !== 'connected' || !client.state?.factory;
      button.addEventListener('click', () => performFactory(async () => { await client.factoryControl(action); }));
      item.append(button);
    }
    const remove = element('button', 'Remove and clear fleet credential', 'text-button');
    remove.type = 'button';
    remove.addEventListener('click', () => { disconnectFactoryFleet(origin); renderFactoryFleet(); });
    item.append(remove);
    return item;
  }));
}

$('factory-delegate-stack').addEventListener('change', () => { $('factory-stack').disabled = $('factory-delegate-stack').checked; });
$('factory-target').addEventListener('change', () => {
  if (['aks', 'aca', 'aci'].includes($('factory-target').value)) $('factory-cloud').value = 'azure';
});
$('factory-deployment-form').addEventListener('submit', (event) => {
  event.preventDefault();
  performFactory(async () => {
    if (activation.connection !== 'connected') throw new Error('Connect to the intended product service first.');
    plan.deployment = readFactoryDeployment();
    await activation.saveBlueprint(plan);
    saveDraft();
    announce('Deployment blueprint saved in the product Git repository. No Factory was started.');
  });
});
$('factory-mandate-form').addEventListener('submit', (event) => {
  event.preventDefault();
  performFactory(async () => {
    if (!$('factory-owner-confirm').checked) throw new Error('Explicitly authorize the displayed operating mandate.');
    if (!activation.state?.blueprint?.deployment) throw new Error('Save the deployment blueprint before accepting its mandate.');
    await activation.authorizeFactory(readFactoryMandate());
    announce('Owner mandate accepted. Starting, automatic startup and reserved releases remain separate controls.');
  });
});
for (const action of ['start', 'resume', 'pause', 'revoke']) {
  $(`factory-${action}`).addEventListener('click', () => performFactory(async () => { await activation.factoryControl(action); }));
}
$('factory-download-mandate').addEventListener('click', () => performFactory(async () => {
  downloadFactoryJson('approved-mandate.json', await activation.factoryMandate());
}));
$('factory-refresh-observations').addEventListener('click', () => performFactory(async () => {
  const observations = await activation.request('/api/factory/observations');
  $('factory-observations').textContent = JSON.stringify(observations, null, 2);
}));
$('factory-package-form').addEventListener('submit', (event) => {
  event.preventDefault();
  performFactory(async () => {
    const bundle = await activation.factoryPackage($('factory-image').value, { command: $('factory-container-command').value, args: JSON.parse($('factory-container-args').value) });
    $('factory-package-json').value = JSON.stringify(bundle, null, 2);
    $('factory-package-copy').hidden = false;
    downloadFactoryJson('adhd-factory-package.json', bundle);
    $('factory-package-status').textContent = `Committed package ${bundle.digest}; browser download requested, not confirmed. Its JSON is also available below. Building, provisioning and live proof are not implied by export.`;
  });
});
$('factory-select-package').addEventListener('click', () => { $('factory-package-json').focus(); $('factory-package-json').select(); });
$('factory-add-fleet').addEventListener('click', () => performFactory(async () => {
  if (activation.connection !== 'connected') throw new Error('Connect to a trusted product service first.');
  if (factoryFleet.has(activation.endpoint)) return;
  const client = new StudioClient({ fetchFn: activation.fetch });
  client.endpoint = activation.endpoint;
  client.token = activation.token;
  client.connection = 'connected';
  client.acceptState(activation.state);
  client.runtime = activation.runtime;
  factoryFleet.set(client.endpoint, client);
  client.stream(() => renderFactoryFleet(), () => {}, (error) => {
    client.connection = 'failed';
    announce(`Fleet connection lost: ${error.message}. Last known state is not live progress.`);
    renderFactoryFleet();
  });
}));
