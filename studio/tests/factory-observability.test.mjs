import assert from 'node:assert/strict';
import test from 'node:test';
import { FactoryObservability } from '../observability.mjs';
import { factoryFixture } from './helpers.mjs';

test('positive: the installed product Operations Center reads the same actual controller facts over HTTP and MCP', async (t) => {
  const { studio, controller } = await factoryFixture(t);
  controller.observer = new FactoryObservability(studio);
  const state = (await studio.records.read()).data;
  await controller.observer.ensure(state.factory, state.blueprint);
  await controller.mutate((factory, data) => {
    data.history.push({ id: 'observer-fixture-progress', time: new Date().toISOString(), type: 'factory.session.started', factoryId: factory.id, assignmentId: 'fixture-assignment', role: 'Fullstacker', sessionId: 'fixture-session-not-live-inference' });
  });
  const observed = await controller.observer.read();
  assert.ok(observed.events.some((event) => event.event_id === 'observer-fixture-progress'));
  assert.equal(controller.observer.status.http, 'observed responsive');
  assert.match(controller.observer.status.mcp, /In-process/);
  const files = await studio.repository.git(['ls-files', `.factory/observability/${state.factory.id}/center.json`]);
  assert.ok(files.trim());
});
