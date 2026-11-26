import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compileFactoryPackage, materializeFactoryPackage } from '../package.mjs';
import { command } from '../repository.mjs';
import { blueprint, factoryDeployment } from './helpers.mjs';

const image = `ghcr.io/fixture/adhd-runtime@sha256:${'a'.repeat(64)}`;
const input = {
  blueprint: { ...blueprint, deployment: factoryDeployment }, image, bindingKey: 'isolated-product-fixture',
  verification: { command: 'node', args: ['--test', 'acceptance.test.mjs'] },
};

test('positive: one blueprint produces deterministic, portable, secret-free deployment packages', () => {
  const first = compileFactoryPackage(input);
  const second = compileFactoryPackage(input);
  assert.equal(first.digest, second.digest);
  for (const target of ['docker', 'kubernetes', 'aks', 'aca', 'aci']) {
    const name = target === 'docker' ? 'compose.json' : target === 'kubernetes' ? 'kubernetes.json' : `${target}.arm.json`;
    assert.ok(JSON.parse(first.files[name]));
  }
  const manifests = JSON.parse(first.files['kubernetes.json']);
  const container = manifests.items.find((item) => item.kind === 'Deployment').spec.template.spec.containers[0];
  assert.equal(container.image, image);
  assert.equal(container.securityContext.readOnlyRootFilesystem, true);
  assert.equal(JSON.parse(first.files['compose.json']).services.factory.ports[0], '127.0.0.1:4319:4319');
});

test('negative: mutable images, embedded credentials and Windows verification paths are rejected', () => {
  assert.throws(() => compileFactoryPackage({ ...input, image: 'fixture/runtime:latest' }), /pinned/);
  assert.throws(() => compileFactoryPackage({ ...input, image: `https://${image}` }), /pinned/);
  assert.throws(() => compileFactoryPackage({ ...input, blueprint: { ...input.blueprint, goal: `Use ghp_${'A'.repeat(40)}` } }), /Credentials/);
  assert.throws(() => compileFactoryPackage({ ...input, verification: { command: 'C:\\Node\\node.exe', args: [] } }), /Windows/);
});

test('positive: all ARM parameter references are declared, and ACI requires explicit provider bootstrap approval', () => {
  const bundle = compileFactoryPackage(input);
  for (const name of ['aks.arm.json', 'aca.arm.json', 'aci.arm.json']) {
    const template = JSON.parse(bundle.files[name]);
    for (const match of bundle.files[name].matchAll(/parameters\('([^']+)'\)/g)) assert.ok(template.parameters[match[1]], `${name}: missing ${match[1]}`);
  }
  const aci = JSON.parse(bundle.files['aci.arm.json']);
  assert.deepEqual(aci.parameters.allowAciRootBootstrap.allowedValues, [true]);
  assert.equal(aci.parameters.serviceToken.type, 'securestring');
  assert.equal(aci.parameters.storageAccountKey.type, 'securestring');
});

test('positive: distributed deployments provision role-scoped workers without controller keys in worker mounts', () => {
  const bundle = compileFactoryPackage({ ...input, blueprint: { ...input.blueprint, deployment: { ...factoryDeployment, topology: 'distributed' } } });
  const compose = JSON.parse(bundle.files['compose.json']);
  assert.equal(Object.keys(compose.services).length, 10);
  for (const [name, service] of Object.entries(compose.services)) {
    if (name !== 'factory') assert.ok(!JSON.stringify(service.volumes).includes('service.token'));
  }
  const kube = JSON.parse(bundle.files['kubernetes.json']);
  const workers = kube.items.filter((item) => item.kind === 'Deployment' && item.metadata.name.includes('worker-'));
  assert.equal(workers.length, 9);
  for (const worker of workers) {
    const keys = worker.spec.template.spec.volumes.find((volume) => volume.name === 'secrets').secret.items.map((item) => item.key);
    assert.ok(!keys.includes('service.token'));
    assert.equal(worker.spec.template.spec.automountServiceAccountToken, false);
  }
});

test('negative: package extraction never overwrites and detects content or target drift', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'adhd-package-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bundle = compileFactoryPackage(input);
  const directory = join(root, 'factory');
  await materializeFactoryPackage(bundle, directory);
  const validated = await command(process.execPath, ['validate.mjs', bundle.digest], directory);
  assert.equal(validated.code, 0, validated.output);
  await assert.rejects(materializeFactoryPackage(bundle, directory), /never overwritten/);
  await assert.rejects(materializeFactoryPackage({ ...bundle, digest: 'incorrect' }, join(root, 'other')), /digest/);
  await writeFile(join(directory, 'runtime.json'), '{}');
  const changed = await command(process.execPath, ['validate.mjs', bundle.digest], directory);
  assert.notEqual(changed.code, 0);
  assert.match(changed.output, /artifact drift/);
  assert.ok((await readFile(join(directory, 'deploy.ps1'), 'utf8')).includes('separately approved plan digest'));
});
