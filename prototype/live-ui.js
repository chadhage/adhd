'use strict';

let lastBlueprintBinding = '';
let liveBusy = false;

function saveDraft() {
  try {
    window.localStorage.setItem('adhd-studio-blueprint', JSON.stringify(plan));
  } catch (error) {
    announce(`The browser draft could not be saved: ${error.message}. Save it to your connected product repository instead.`);
  }
}

function initializeLiveUI() {
  try {
    const saved = window.localStorage.getItem('adhd-studio-blueprint');
    if (saved) {
      const candidate = JSON.parse(saved);
      if (!candidate || (candidate.path !== null && !paths.some((path) => path.id === candidate.path))
        || typeof candidate.name !== 'string' || candidate.name.length > 80
        || typeof candidate.goal !== 'string' || candidate.goal.length > 400
        || !Array.isArray(candidate.factories) || candidate.factories.length < 1 || candidate.factories.length > 4
        || candidate.factories.some((factory) => !Array.isArray(factory.squads) || factory.squads.length < 1 || factory.squads.length > 4
          || typeof factory.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(factory.id)
          || factory.squads.some((squad) => typeof squad.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(squad.id)
            || !Number.isInteger(Number(squad.members)) || Number(squad.members) < 1 || Number(squad.members) > 12))) {
        throw new Error('The saved blueprint has an invalid shape.');
      }
      plan = {
        ...initialPlan(), path: candidate.path, name: candidate.name, goal: candidate.goal,
        factories: candidate.factories.map((factory) => ({ id: factory.id, name: factory.name, squads: factory.squads.map((squad) => ({ id: squad.id, name: squad.name, members: String(squad.members) })) })),
        nextFactory: Math.max(1, ...candidate.factories.map((factory) => Number(/^f(\d+)$/.exec(factory.id)?.[1]) || 0)) + 1,
        nextSquad: Math.max(1, ...candidate.factories.flatMap((factory) => factory.squads.map((squad) => Number(/^s(\d+)$/.exec(squad.id)?.[1]) || 0))) + 1,
        ...(candidate.deployment ? { deployment: candidate.deployment } : {}),
      };
    }
  } catch (error) {
    announce(`The stored draft was not loaded: ${error.message}. Stored data has not been deleted.`);
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) $('demo-repository').value = window.location.origin;
  document.addEventListener('input', saveDraft);
  document.addEventListener('change', saveDraft);
  document.addEventListener('click', saveDraft);
}

function syncBlueprint() {
  const binding = JSON.stringify([plan.path, plan.name, plan.goal, plan.factories, plan.deployment]);
  if (binding === lastBlueprintBinding) return false;
  lastBlueprintBinding = binding;
  activation.readiness = 'unchecked';
  activation.authorizationId = null;
  if (!activation.run) activation.setReview({ ...activation.review, scope: plan.goal });
  return true;
}

function clearActivationError() {
  for (const id of ['activation-error', 'demo-feedback-error']) {
    $(id).hidden = true;
    $(id).textContent = '';
  }
}

function showActivationError(result) {
  const target = activeView === 'outcome' ? 'demo-feedback-error' : 'activation-error';
  $(target).textContent = result.error;
  $(target).hidden = false;
  if (result.field && $(result.field)) $(result.field).focus();
  announce(result.error);
}

function demoStatus(id, text, tone = '') {
  $(id).textContent = text;
  $(id).className = `demo-status${tone ? ` is-${tone}` : ''}`;
}

function recap(id, entries) {
  $(id).replaceChildren(...entries.map(([label, value]) => {
    const row = element('div');
    row.append(element('small', label), element('strong', String(value)));
    return row;
  }));
}

function earliestActivationStep() {
  return activation.connection !== 'connected' ? 0 : activation.reviewIssue() ? 1 : 2;
}

function renderActivationProgress(step) {
  $('activation-steps').replaceChildren(...['Connect service', 'Review scope', 'Check readiness', 'Run card'].map((label, index) => {
    const item = element('li');
    const button = element('button', label);
    button.type = 'button';
    button.disabled = index > earliestActivationStep() && !(index === 3 && activation.run);
    if (index === step) button.setAttribute('aria-current', 'step');
    button.addEventListener('click', () => navigate(index === 3 ? '#cycle' : `#activate/${index + 1}`));
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
    element('span', 'SELECTED EXECUTION LOCATION', 'eyebrow purple'), pathIcon(path),
    element('h2', path.title), element('p', path.consideration), pathFacts(path),
  );
  if (activation.connection === 'connected') {
    $('workspace-details').textContent = `${activation.state.repository.workspace} / ${activation.state.repository.branch}`;
    demoStatus('demo-connection-status', 'Connected to the authenticated product service. Save your blueprint before checking readiness.', 'good');
  } else {
    demoStatus('demo-connection-status', activation.connection === 'checking' ? 'Contacting the service...' : 'Connect to a service you operate or trust. No run starts during connection.');
  }
  $('connect-service').disabled = liveBusy;
  $('save-blueprint').disabled = liveBusy || activation.connection !== 'connected';
  $('load-blueprint').disabled = liveBusy || !activation.state?.blueprint;
  $('demo-scope').value = activation.review.scope;
  $('demo-budget').value = activation.review.budget;
  $('run-seconds').value = activation.review.maxSeconds;
  $('run-model').replaceChildren(...(activation.runtime?.models ?? []).map((model) => {
    const option = element('option', model.name ?? model.id);
    option.value = model.id;
    option.selected = model.id === activation.review.model;
    return option;
  }));
  if (!$('run-model').options.length) $('run-model').append(element('option', 'No models reported. Check the service host sign-in and provider configuration.'));
  $('demo-write').checked = activation.review.write;
  $('demo-verify').checked = activation.review.verify;
  $('provider-share').checked = activation.review.share;
  const selected = `${activation.review.factoryId}/${activation.review.squadId}`;
  $('run-squad').replaceChildren(...plan.factories.flatMap((factory) => factory.squads.map((squad) => {
    const option = element('option', `${factory.name} / ${squad.name}`);
    option.value = `${factory.id}/${squad.id}`;
    option.selected = option.value === selected;
    return option;
  })));
  const verification = activation.state?.verification;
  $('verification-command').textContent = verification ? `${verification.command} ${verification.args.join(' ')}` : 'Connect to see the owner-configured acceptance command.';
  recap('demo-review-summary', [
    ['Scope', activation.review.scope], ['AI-credit cap', activation.review.budget],
    ['Generation window', `${activation.review.maxSeconds} seconds`], ['WIP', 'One bounded card; no automatic next cycle'],
  ]);
  demoStatus('demo-readiness-status', {
    unchecked: 'Not checked. Save the blueprint and review all permissions first.',
    checking: 'Checking the real repository and SDK authentication...',
    ready: 'Repository and authentication checks passed. Actual inference and code acceptance are established only by execution and verification.',
    blocked: 'A check failed. Fix the reported condition and retry.',
  }[activation.readiness], activation.readiness === 'ready' ? 'good' : activation.readiness === 'blocked' ? 'warning' : '');
  $('demo-checks').replaceChildren(...activation.checks.map((check) => {
    const row = element('li');
    row.append(element('strong', check.ok ? 'PASS' : 'BLOCKED'), element('div', `${check.title}: ${check.note}`));
    return row;
  }));
  $('run-demo-checks').disabled = liveBusy || activation.connection !== 'connected';
  $('activation-back').textContent = step === 0 ? 'Blueprint' : 'Back';
  $('activation-next').textContent = step < 2 ? 'Continue' : activation.run ? 'Open existing cycle' : 'Start real bounded cycle';
  $('activation-next').disabled = liveBusy || (step === 0 ? activation.connection !== 'connected' : step === 2 && !activation.run ? activation.readiness !== 'ready' : false);
}

function renderCycle() {
  const run = activation.run;
  if (!run) return;
  recap('demo-cycle-context', [
    ['Card', run.cardId], ['Assignment', `${run.review.factoryId} / ${run.review.squadId}`],
    ['State', run.status], ['Deadline', run.deadline],
  ]);
  demoStatus('demo-cycle-status', run.error ?? (run.status === 'review-required'
    ? 'Generation finished. Inspect the actual diff, then run the registered acceptance command.'
    : run.status === 'verified' ? 'A Git-committed candidate passed verification. Explicit acceptance is still required.'
      : `Recorded cycle state: ${run.status}. Progress comes from the service, not a browser timer.`), run.error ? 'warning' : '');
  $('demo-cycle-steps').replaceChildren(...['VOC intake', 'Factory allocation', 'Squad handoff', 'Fullstacker implementation'].map((role, index) => {
    const item = element('li');
    item.append(element('h2', role), element('p', index < run.phase ? 'Runtime acknowledgement/handoff recorded.' : index === run.phase && run.status === 'running' ? 'Executing on the service host.' : 'Not completed.'));
    return item;
  }));
  for (const id of ['demo-board-todo', 'demo-board-progress']) $(id).replaceChildren(element('p', 'No unfinished card in this column.'));
  const unfinished = activation.state.runs.filter((entry) => entry.status !== 'complete' && entry.review.squadId === run.review.squadId && entry.phase >= 2);
  for (const entry of unfinished) {
    const card = element('article', undefined, 'demo-card');
    card.append(element('strong', entry.cardId), element('p', entry.review.scope), element('small', entry.status));
    const target = ['failed', 'cancelled'].includes(entry.status) ? 'demo-board-todo' : 'demo-board-progress';
    if ($(target).firstElementChild?.tagName === 'P') $(target).replaceChildren();
    $(target).append(card);
  }
  $('run-diff').textContent = run.diff ?? 'No captured diff yet. Reconnect to reload the candidate after generation.';
  $('run-output').textContent = run.output ?? 'Live model output is page-only; durable history records metadata rather than full transcripts.';
  $('pause-demo-cycle').hidden = run.status !== 'running';
  $('resume-demo-cycle').hidden = !['paused', 'interrupted'].includes(run.status) || run.phase === 4;
  $('end-demo-cycle').hidden = ['complete', 'failed', 'cancelled'].includes(run.status);
  $('verify-run').hidden = run.status !== 'review-required';
  $('accept-run').hidden = run.status !== 'verified';
  for (const id of ['pause-demo-cycle', 'resume-demo-cycle', 'end-demo-cycle', 'verify-run', 'accept-run']) $(id).disabled = liveBusy;
}

function renderOutcome() {
  const run = activation.run;
  if (!run) return;
  $('outcome-title').textContent = run.status === 'complete' ? 'Your increment is accepted and integrated.' : 'Your cycle needs attention.';
  $('demo-outcome-description').textContent = run.status === 'complete'
    ? 'The configured acceptance command passed, the verified branch was integrated, and completion was recorded separately from the unfinished board.'
    : run.error ?? 'No completion is claimed. Preserve the unfinished card and inspect its recorded state.';
  recap('demo-outcome-summary', [
    ['Card', run.cardId], ['Result', run.status],
    ['Candidate', run.candidateHead ?? 'Not committed'], ['Integrated revision', run.integratedHead ?? 'Not integrated'],
  ]);
  $('demo-result-preview').replaceChildren(element('h2', 'Actual product diff'), element('pre', run.diff ?? 'Inspect the recorded candidate branch in your product repository.', 'live-output'));
  $('demo-completion-record').replaceChildren(
    element('h2', run.status === 'complete' ? 'Recorded completion evidence' : 'Unfinished work'),
    element('p', run.verification ? `${run.verification.command} ${run.verification.args.join(' ')} / exit ${run.verification.exitCode}` : 'No successful verification record.'),
    element('pre', run.verification?.output ?? 'No verification output.', 'live-output'),
    element('p', `AI credits: ${run.usage.reportedAiCredits === null ? 'not reported' : run.usage.reportedAiCredits.toFixed(4)}${run.usage.incomplete ? ' (billing coverage incomplete)' : ''}. No token-price estimate is substituted.`),
  );
}

async function performLive(action) {
  if (liveBusy) return;
  liveBusy = true;
  clearActivationError();
  try {
    await action();
    if (activeView === 'activation') renderActivation();
    else if (activeView === 'cycle') renderCycle();
    else if (activeView === 'outcome') renderOutcome();
    else if (activeView === 'factory') renderFactory();
  } catch (error) {
    showActivationError({ error: error.message });
    demoStatus('demo-cycle-status', error.message, 'warning');
  } finally {
    liveBusy = false;
    if (activeView === 'activation') renderActivation();
    if (activeView === 'cycle') renderCycle();
    if (activeView === 'factory') renderFactory();
  }
}

function readReview() {
  const [factoryId, squadId] = $('run-squad').value.split('/');
  return { scope: $('demo-scope').value, budget: $('demo-budget').value, maxSeconds: $('run-seconds').value,
    write: $('demo-write').checked, verify: $('demo-verify').checked, share: $('provider-share').checked, model: $('run-model').value, factoryId, squadId };
}

function watchService() {
  activation.stream(() => {
    if (activeView === 'cycle') renderCycle();
    if (activeView === 'outcome') renderOutcome();
    if (activeView === 'factory') renderFactory();
    if (['complete', 'failed', 'cancelled'].includes(activation.status) && activeView === 'cycle') navigate('#outcome');
  }, (event) => {
    if (activation.run?.id !== event.runId) return;
    const output = activation.run.output ?? '';
    activation.run.output = (output + `${event.role}: ${event.text}`).slice(-64 * 1024);
    if (activeView === 'cycle') $('run-output').textContent = activation.run.output;
  }, (error) => {
    demoStatus('demo-cycle-status', error.message, 'warning');
    demoStatus('demo-connection-status', error.message, 'warning');
    if (activeView === 'factory') $('factory-status').textContent = `Live connection lost. Last known state only: ${error.message}`;
    announce(error.message);
  });
}

$('connect-service').addEventListener('click', () => performLive(async () => {
  if (await activation.connect($('demo-repository').value, $('service-token').value, plan.path)) {
    $('service-token').value = '';
    watchService();
    announce('Connected. Save or deliberately load the connected product blueprint.');
  }
}));
$('disconnect-service').addEventListener('click', () => {
  disconnectFactoryFleet(activation.endpoint);
  activation.disconnect();
  renderActivation(0);
  announce('Disconnected and cleared the access token. This does not cancel a running backend cycle.');
});
$('save-blueprint').addEventListener('click', () => performLive(async () => {
  await activation.saveBlueprint(plan);
  announce('Blueprint saved and committed in the connected product repository.');
}));
$('load-blueprint').addEventListener('click', () => {
  if (!activation.state?.blueprint) { announce('No connected product blueprint is available.'); return; }
  plan = { ...initialPlan(), ...activation.state.blueprint };
  plan.nextFactory = Math.max(1, ...plan.factories.map((factory) => Number(/^f(\d+)$/.exec(factory.id)?.[1]) || 0)) + 1;
  plan.nextSquad = Math.max(1, ...plan.factories.flatMap((factory) => factory.squads.map((squad) => Number(/^s(\d+)$/.exec(squad.id)?.[1]) || 0))) + 1;
  saveDraft();
  navigate('#blueprint');
  announce('Loaded the connected product blueprint into this browser draft.');
});
for (const id of ['demo-scope', 'demo-budget', 'run-seconds', 'run-model', 'demo-write', 'demo-verify', 'provider-share', 'run-squad']) {
  $(id).addEventListener('input', () => { activation.setReview(readReview()); clearActivationError(); });
}
$('run-demo-checks').addEventListener('click', () => performLive(async () => {
  activation.setReview(readReview());
  await activation.check();
}));
$('activation-back').addEventListener('click', () => navigate(activationStep === 0 ? '#blueprint' : `#activate/${activationStep}`));
$('activation-form').addEventListener('submit', (event) => {
  event.preventDefault();
  performLive(async () => {
    if (activationStep === 0) {
      if (activation.connection !== 'connected') throw new Error('Connect to an authenticated product service first.');
      navigate('#activate/2');
    } else if (activationStep === 1) {
      activation.setReview(readReview());
      const issue = activation.reviewIssue();
      if (issue) throw new Error(issue.error);
      navigate('#activate/3');
    } else {
      if (!activation.run) await activation.start();
      navigate('#cycle');
    }
  });
});
for (const [id, action] of [['pause-demo-cycle', 'pause'], ['resume-demo-cycle', 'resume'], ['end-demo-cycle', 'cancel'], ['verify-run', 'verify'], ['accept-run', 'accept']]) {
  $(id).addEventListener('click', () => performLive(async () => {
    await activation.control(action);
    if (['complete', 'cancelled', 'failed'].includes(activation.status)) navigate('#outcome');
  }));
}
$('replay-demo').addEventListener('click', () => {
  if (!['complete', 'failed', 'cancelled'].includes(activation.status)) { announce('Finish or cancel the existing cycle before authorizing another.'); return; }
  activation.preparingNew = true;
  activation.idempotencyKey = null;
  activation.authorizationId = null;
  activation.readiness = 'unchecked';
  navigate('#activate/2');
});
$('focus-demo-feedback').addEventListener('click', () => { $('demo-feedback-response').focus(); });
$('demo-feedback-form').addEventListener('submit', (event) => {
  event.preventDefault();
  performLive(async () => {
    const receipt = await activation.feedback($('demo-feedback-response').value, $('demo-feedback-notes').value);
    $('demo-feedback-receipt').hidden = false;
    $('demo-feedback-text').value = `Saved demand receipt: ${receipt.id}\nCustody: ${receipt.custody}\nStored in the connected product repository; no customer research or investment approval is implied.`;
    demoStatus('demo-feedback-status', 'Feedback was saved and Git-committed. VOC review is pending.', 'good');
  });
});
$('select-demo-feedback').addEventListener('click', () => { $('demo-feedback-text').focus(); $('demo-feedback-text').select(); });
