import { factoryRoles } from './factory-contracts.mjs';

const arm = (parameters, resources, outputs = {}) => ({
  $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
  contentVersion: '1.0.0.0', parameters, resources, outputs,
});
const parameter = (type, extra = {}) => ({ type, ...extra });
const secretFiles = ['service.token', 'copilot.token', 'executor.token', 'database.url', 'tls.crt', 'tls.key', 'approved-mandate.json', 'connector.token'];
const roleSlug = (role) => role.toLowerCase();
const environment = (configuration) => ({
  STUDIO_CONFIG_FILE: '/opt/adhd/runtime.json', STUDIO_WORKSPACE: '/workspace/product',
  STUDIO_TOKEN_FILE: '/run/studio/service.token', STUDIO_COPILOT_TOKEN_FILE: '/run/studio/copilot.token',
  STUDIO_CONNECTOR_TOKEN_FILE: '/run/studio/connector.token',
  STUDIO_EXECUTOR_TOKEN_FILE: '/run/studio/executor.token',
  STUDIO_DATABASE_URL_FILE: '/run/studio/database.url',
  STUDIO_CERT_FILE: '/run/studio/tls.crt', STUDIO_KEY_FILE: '/run/studio/tls.key',
  STUDIO_MANDATE_FILE: '/run/studio/approved-mandate.json',
  STUDIO_STORE_KEY: configuration.bindingKey,
});

export function composeDeployment(configuration, image) {
  const options = configuration.blueprint.deployment;
  const common = {
    image, platform: 'linux/amd64', init: true, read_only: true, user: '1000:1000',
    cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'],
    tmpfs: ['/tmp:rw,nosuid,nodev'], cpus: options.resources.cpu,
    mem_limit: `${options.resources.memoryMiB}m`, pids_limit: 512,
    restart: 'unless-stopped',
  };
  const volumes = [
    { type: 'bind', source: '${STUDIO_PRODUCT_DIRECTORY:?Set the approved product Git directory}', target: '/workspace/product' },
    { type: 'bind', source: '${STUDIO_SECRET_DIRECTORY:?Set the protected secret directory}', target: '/run/studio', read_only: true },
    { type: 'bind', source: './runtime.json', target: '/opt/adhd/runtime.json', read_only: true },
  ];
  const services = {
    factory: {
      ...common, volumes,
      environment: { ...environment(configuration), STUDIO_EXECUTOR_ORIGIN: '${STUDIO_EXECUTOR_ORIGIN:?Set the trusted isolated executor HTTPS origin}', STUDIO_COPILOT_RUNTIME_URL: '${STUDIO_COPILOT_RUNTIME_URL:-}' },
      ports: ['127.0.0.1:4319:4319'],
      healthcheck: { test: ['CMD', 'node', '/opt/adhd/studio/healthcheck.mjs'], interval: '15s', timeout: '5s', retries: 3 },
    },
  };
  if (options.topology === 'distributed') {
    for (const role of factoryRoles) {
      const authFile = options.identity === 'hosted-connector' ? 'connector.token' : 'copilot.token';
      services[`worker-${roleSlug(role)}`] = {
        ...common,
        volumes: [
          volumes[0], volumes[2],
          { type: 'bind', source: `\${STUDIO_SECRET_DIRECTORY}/${authFile}`, target: `/run/studio/${authFile}`, read_only: true },
          { type: 'bind', source: `\${STUDIO_SECRET_DIRECTORY}/worker-${roleSlug(role)}.token`, target: '/run/studio/worker.token', read_only: true },
          { type: 'bind', source: '${STUDIO_SECRET_DIRECTORY}/tls.crt', target: '/run/studio/ca.crt', read_only: true },
        ],
        environment: {
          STUDIO_WORKER_ROLE: role, STUDIO_WORKSPACE: '/workspace/product',
          STUDIO_CONFIG_FILE: '/opt/adhd/runtime.json', STUDIO_CONTROLLER_ORIGIN: 'https://factory:4319',
          STUDIO_WORKER_TOKEN_FILE: '/run/studio/worker.token', STUDIO_COPILOT_TOKEN_FILE: '/run/studio/copilot.token',
          STUDIO_CONNECTOR_TOKEN_FILE: '/run/studio/connector.token', STUDIO_COPILOT_RUNTIME_URL: '${STUDIO_COPILOT_RUNTIME_URL:-}',
          NODE_EXTRA_CA_CERTS: '/run/studio/ca.crt',
        },
        depends_on: { factory: { condition: 'service_healthy' } },
      };
    }
  }
  return { name: `adhd-${configuration.bindingKey.slice(0, 12)}`, services };
}

export function kubernetesDeployment(configuration, image) {
  const name = `adhd-${configuration.bindingKey.slice(0, 12).toLowerCase()}`;
  const options = configuration.blueprint.deployment;
  const metadata = (suffix) => ({ name: `${name}-${suffix}`, namespace: name, labels: { 'adhd.factory': name } });
  const limits = { cpu: String(options.resources.cpu), memory: `${options.resources.memoryMiB}Mi` };
  const mounts = [
    { name: 'product', mountPath: '/workspace/product' },
    { name: 'configuration', mountPath: '/opt/adhd/runtime.json', subPath: 'runtime.json', readOnly: true },
    { name: 'secrets', mountPath: '/run/studio', readOnly: true },
    { name: 'temporary', mountPath: '/tmp' },
  ];
  const volumes = [
    { name: 'product', persistentVolumeClaim: { claimName: `${name}-product` } },
    { name: 'configuration', configMap: { name: `${name}-configuration` } },
    { name: 'secrets', secret: { secretName: `${name}-secrets`, defaultMode: 0o400 } },
    { name: 'temporary', emptyDir: { sizeLimit: `${options.resources.memoryMiB}Mi` } },
  ];
  const security = { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000 };
  const containerSecurity = { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } };
  const controllerEnvironment = Object.entries(environment(configuration)).map(([key, value]) => ({ name: key, value }));
  controllerEnvironment.push({ name: 'STUDIO_EXECUTOR_ORIGIN', valueFrom: { secretKeyRef: { name: `${name}-secrets`, key: 'executor.origin' } } });
  controllerEnvironment.push({ name: 'STUDIO_COPILOT_RUNTIME_URL', valueFrom: { secretKeyRef: { name: `${name}-secrets`, key: 'connector.url', optional: true } } });
  const items = [
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name, labels: { 'adhd.factory': name } } },
    { apiVersion: 'v1', kind: 'ConfigMap', metadata: metadata('configuration'), data: { 'runtime.json': JSON.stringify(configuration) } },
    { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: metadata('product'), spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '20Gi' } } } },
    {
      apiVersion: 'apps/v1', kind: 'Deployment', metadata: metadata('controller'),
      spec: {
        replicas: 1, strategy: { type: 'Recreate' }, selector: { matchLabels: { 'adhd.controller': name } },
        template: {
          metadata: { labels: { 'adhd.factory': name, 'adhd.controller': name } },
          spec: {
            automountServiceAccountToken: false, securityContext: security, nodeSelector: { 'kubernetes.io/arch': 'amd64' }, volumes,
            containers: [{
              name: 'factory', image, securityContext: containerSecurity, resources: { requests: limits, limits },
              env: controllerEnvironment, ports: [{ name: 'https', containerPort: 4319 }], volumeMounts: mounts,
              readinessProbe: { httpGet: { path: '/healthz', port: 'https', scheme: 'HTTPS' } },
              livenessProbe: { httpGet: { path: '/healthz', port: 'https', scheme: 'HTTPS' } },
            }],
          },
        },
      },
    },
    { apiVersion: 'v1', kind: 'Service', metadata: metadata('controller'), spec: { type: 'ClusterIP', selector: { 'adhd.controller': name }, ports: [{ port: 4319, targetPort: 'https', name: 'https' }] } },
  ];
  if (options.topology === 'distributed') {
    for (const role of factoryRoles) {
      const authFile = options.identity === 'hosted-connector' ? 'connector.token' : 'copilot.token';
      const members = Math.max(...configuration.blueprint.factories.flatMap((factory) => factory.squads.map((squad) => Number(squad.members))));
      const workerVolumes = volumes.filter((volume) => volume.name !== 'secrets');
      workerVolumes.push({
        name: 'secrets', secret: {
          secretName: `${name}-secrets`, defaultMode: 0o400,
          items: [{ key: `worker-${roleSlug(role)}.token`, path: 'worker.token' }, { key: authFile, path: authFile }, { key: 'tls.crt', path: 'ca.crt' }],
        },
      });
      items.push({
        apiVersion: 'apps/v1', kind: 'Deployment', metadata: metadata(`worker-${roleSlug(role)}`),
        spec: {
          replicas: role === 'Fullstacker' ? members : 1,
          selector: { matchLabels: { 'adhd.worker': `${name}-${roleSlug(role)}` } },
          template: {
            metadata: { labels: { 'adhd.factory': name, 'adhd.worker': `${name}-${roleSlug(role)}` } },
            spec: {
              automountServiceAccountToken: false, securityContext: security, nodeSelector: { 'kubernetes.io/arch': 'amd64' }, volumes: workerVolumes,
              affinity: { podAffinity: { requiredDuringSchedulingIgnoredDuringExecution: [{ labelSelector: { matchLabels: { 'adhd.controller': name } }, topologyKey: 'kubernetes.io/hostname' }] } },
              containers: [{
                name: 'worker', image, securityContext: containerSecurity, resources: { requests: limits, limits },
                volumeMounts: mounts, env: [
                  { name: 'STUDIO_WORKER_ROLE', value: role }, { name: 'STUDIO_WORKSPACE', value: '/workspace/product' },
                  { name: 'STUDIO_CONFIG_FILE', value: '/opt/adhd/runtime.json' },
                  { name: 'STUDIO_CONTROLLER_ORIGIN', value: `https://${name}-controller.${name}.svc:4319` },
                  { name: 'STUDIO_WORKER_TOKEN_FILE', value: '/run/studio/worker.token' },
                  { name: 'STUDIO_COPILOT_TOKEN_FILE', value: '/run/studio/copilot.token' },
                  { name: 'STUDIO_CONNECTOR_TOKEN_FILE', value: '/run/studio/connector.token' },
                  { name: 'STUDIO_COPILOT_RUNTIME_URL', valueFrom: { secretKeyRef: { name: `${name}-secrets`, key: 'connector.url', optional: true } } },
                  { name: 'NODE_EXTRA_CA_CERTS', value: '/run/studio/ca.crt' },
                ],
              }],
            },
          },
        },
      });
    }
  }
  return { apiVersion: 'v1', kind: 'List', items };
}

export function aksDeployment(configuration) {
  return arm({
    name: parameter('string'), location: parameter('string'), vmSize: parameter('string'),
    nodeCount: parameter('int', { minValue: 1 }), apiAuthorizedRanges: parameter('array', { minLength: 1 }),
  }, [{
    type: 'Microsoft.ContainerService/managedClusters', apiVersion: '2024-10-01',
    name: "[parameters('name')]", location: "[parameters('location')]", identity: { type: 'SystemAssigned' },
    properties: {
      dnsPrefix: `adhd-${configuration.bindingKey.slice(0, 12)}`,
      enableRBAC: true, disableLocalAccounts: true, aadProfile: { managed: true, enableAzureRBAC: true },
      apiServerAccessProfile: { authorizedIPRanges: "[parameters('apiAuthorizedRanges')]" },
      oidcIssuerProfile: { enabled: true }, securityProfile: { workloadIdentity: { enabled: true } },
      agentPoolProfiles: [{ name: 'system', count: "[parameters('nodeCount')]", vmSize: "[parameters('vmSize')]", osType: 'Linux', mode: 'System', type: 'VirtualMachineScaleSets' }],
      networkProfile: { networkPlugin: 'azure', loadBalancerSku: 'standard' },
    },
  }], { workload: { type: 'string', value: 'After approved cluster provisioning and operator RBAC, apply kubernetes.json. No admin credentials or automatic role elevation are requested.' } });
}

function azureParameters() {
  return {
    name: parameter('string'), location: parameter('string'), environmentName: parameter('string'),
    storageAccount: parameter('string'), shareName: parameter('string'), storageAccountKey: parameter('securestring'),
    serviceToken: parameter('securestring'), copilotToken: parameter('securestring', { defaultValue: '' }),
    connectorToken: parameter('securestring', { defaultValue: '' }), connectorUrl: parameter('string', { defaultValue: '' }),
    executorOrigin: parameter('string'), executorToken: parameter('securestring'),
    databaseUrl: parameter('securestring', { defaultValue: '' }),
    certificate: parameter('securestring'), privateKey: parameter('securestring'),
    approvedMandate: parameter('securestring', { defaultValue: '' }),
    workerTokens: parameter('secureobject', { defaultValue: {} }),
  };
}

export function acaDeployment(configuration, image) {
  const options = configuration.blueprint.deployment;
  const envName = "[parameters('environmentName')]";
  const secrets = [
    ['service-token', 'service.token', 'serviceToken'], ['copilot-token', 'copilot.token', 'copilotToken'],
    ['executor-token', 'executor.token', 'executorToken'], ['database-url', 'database.url', 'databaseUrl'],
    ['certificate', 'tls.crt', 'certificate'], ['private-key', 'tls.key', 'privateKey'],
    ['approved-mandate', 'approved-mandate.json', 'approvedMandate'],
    ['connector-token', 'connector.token', 'connectorToken'],
  ];
  const resources = [{
    type: 'Microsoft.App/managedEnvironments', apiVersion: '2024-03-01', name: envName,
    location: "[parameters('location')]", properties: {},
  }, {
    type: 'Microsoft.App/managedEnvironments/storages', apiVersion: '2024-03-01',
    name: "[concat(parameters('environmentName'), '/product')]",
    dependsOn: ["[resourceId('Microsoft.App/managedEnvironments', parameters('environmentName'))]"],
    properties: { azureFile: { accountName: "[parameters('storageAccount')]", accountKey: "[parameters('storageAccountKey')]", shareName: "[parameters('shareName')]", accessMode: 'ReadWrite' } },
  }];
  const createApp = (role) => {
    const controller = role === null;
    const appName = controller ? "[parameters('name')]" : `[concat(parameters('name'), '-${roleSlug(role)}')]`;
    const values = controller
      ? secrets.map(([name, path, parameterName]) => ({ name, path, value: `[parameters('${parameterName}')]` }))
      : [
        { name: 'worker-token', path: 'worker.token', value: `[parameters('workerTokens')['${role}']]` },
        { name: 'provider-token', path: options.identity === 'hosted-connector' ? 'connector.token' : 'copilot.token', value: options.identity === 'hosted-connector' ? "[parameters('connectorToken')]" : "[parameters('copilotToken')]" },
      ];
    const env = controller ? Object.entries(environment(configuration)).map(([name, value]) => ({ name, value })) : [
      { name: 'STUDIO_WORKER_ROLE', value: role }, { name: 'STUDIO_WORKSPACE', value: '/workspace/product' },
      { name: 'STUDIO_CONFIG_FILE', value: '/opt/adhd/runtime.json' }, { name: 'STUDIO_WORKER_TOKEN_FILE', value: '/run/studio/worker.token' },
      { name: 'STUDIO_COPILOT_TOKEN_FILE', value: '/run/studio/copilot.token' },
      { name: 'STUDIO_CONNECTOR_TOKEN_FILE', value: '/run/studio/connector.token' },
    ];
    const controllerOrigin = "[concat('https://', parameters('name'), '.', reference(resourceId('Microsoft.App/managedEnvironments', parameters('environmentName')), '2024-03-01').defaultDomain)]";
    env.push({ name: 'STUDIO_COPILOT_RUNTIME_URL', value: "[parameters('connectorUrl')]" });
    if (controller) {
      env.push({ name: 'STUDIO_PROXY_ORIGIN', value: controllerOrigin }, { name: 'STUDIO_EXECUTOR_ORIGIN', value: "[parameters('executorOrigin')]" });
    } else env.push({ name: 'STUDIO_CONTROLLER_ORIGIN', value: controllerOrigin });
    values.push({ name: 'runtime', path: 'runtime.json', value: JSON.stringify(configuration) });
    env.find((entry) => entry.name === 'STUDIO_CONFIG_FILE').value = '/run/studio/runtime.json';
    return {
      type: 'Microsoft.App/containerApps', apiVersion: '2024-03-01', name: appName,
      location: "[parameters('location')]", identity: { type: 'SystemAssigned' },
      dependsOn: ["[resourceId('Microsoft.App/managedEnvironments/storages', parameters('environmentName'), 'product')]"],
      properties: {
        managedEnvironmentId: "[resourceId('Microsoft.App/managedEnvironments', parameters('environmentName'))]",
        configuration: {
          activeRevisionsMode: 'Single', secrets: values.map(({ name, value }) => ({ name, value })),
          ...(controller ? { ingress: { external: false, targetPort: 4319, transport: 'auto', allowInsecure: false } } : {}),
        },
        template: {
          scale: {
            minReplicas: role === 'Fullstacker' ? Math.max(...configuration.blueprint.factories.flatMap((factory) => factory.squads.map((squad) => Number(squad.members)))) : 1,
            maxReplicas: role === 'Fullstacker' ? Math.max(...configuration.blueprint.factories.flatMap((factory) => factory.squads.map((squad) => Number(squad.members)))) : 1,
          },
          volumes: [
            { name: 'product', storageType: 'AzureFile', storageName: 'product', mountOptions: 'uid=1000,gid=1000,dir_mode=0770,file_mode=0660' },
            { name: 'runtime-secrets', storageType: 'Secret', secrets: values.map(({ name, path }) => ({ secretRef: name, path })) },
          ],
          containers: [{
            name: controller ? 'factory' : 'worker', image, env,
            resources: { cpu: options.resources.cpu, memory: `${options.resources.memoryMiB / 1024}Gi` },
            volumeMounts: [{ volumeName: 'product', mountPath: '/workspace/product' }, { volumeName: 'runtime-secrets', mountPath: '/run/studio' }],
          }],
        },
      },
    };
  };
  resources.push(createApp(null));
  if (options.topology === 'distributed') resources.push(...factoryRoles.map(createApp));
  return arm(azureParameters(), resources);
}

export function aciDeployment(configuration, image) {
  const options = configuration.blueprint.deployment;
  const secrets = {
    'runtime.json': Buffer.from(JSON.stringify(configuration)).toString('base64'),
    'service.token': "[base64(parameters('serviceToken'))]", 'copilot.token': "[base64(parameters('copilotToken'))]",
    'executor.token': "[base64(parameters('executorToken'))]", 'database.url': "[base64(parameters('databaseUrl'))]",
    'tls.crt': "[base64(parameters('certificate'))]", 'tls.key': "[base64(parameters('privateKey'))]",
    'approved-mandate.json': "[base64(parameters('approvedMandate'))]",
    'connector.token': "[base64(parameters('connectorToken'))]",
  };
  const baseEnvironment = {
    ...environment(configuration), STUDIO_CONFIG_FILE: '/run/studio/runtime.json',
    STUDIO_ALLOW_ACI_ROOT_BOOTSTRAP: "[string(parameters('allowAciRootBootstrap'))]",
    STUDIO_COPILOT_RUNTIME_URL: "[parameters('connectorUrl')]",
  };
  const containers = [{
    name: 'factory',
    properties: {
      image, ports: [{ port: 4319 }],
      environmentVariables: [...Object.entries(baseEnvironment).map(([name, value]) => ({ name, value })), { name: 'STUDIO_EXECUTOR_ORIGIN', value: "[parameters('executorOrigin')]" }],
      resources: { requests: { cpu: options.resources.cpu, memoryInGB: options.resources.memoryMiB / 1024 } },
      securityContext: { runAsUser: 0, runAsGroup: 0, privileged: false },
      volumeMounts: [{ name: 'product', mountPath: '/workspace/product' }, { name: 'runtime-secrets', mountPath: '/run/studio', readOnly: true }],
    },
  }];
  if (options.topology === 'distributed') {
    for (const role of factoryRoles) {
      const volume = `worker-${roleSlug(role)}`;
      containers.push({
        name: volume, properties: {
          image,
          environmentVariables: [
            { name: 'STUDIO_WORKER_ROLE', value: role }, { name: 'STUDIO_WORKSPACE', value: '/workspace/product' },
            { name: 'STUDIO_CONFIG_FILE', value: '/run/studio/runtime.json' },
            { name: 'STUDIO_CONTROLLER_ORIGIN', value: 'https://localhost:4319' },
            { name: 'STUDIO_WORKER_TOKEN_FILE', value: '/run/studio/worker.token' },
            { name: 'STUDIO_COPILOT_TOKEN_FILE', value: '/run/studio/copilot.token' },
            { name: 'STUDIO_CONNECTOR_TOKEN_FILE', value: '/run/studio/connector.token' },
            { name: 'STUDIO_COPILOT_RUNTIME_URL', value: "[parameters('connectorUrl')]" },
            { name: 'NODE_EXTRA_CA_CERTS', value: '/run/studio/ca.crt' },
            { name: 'STUDIO_ALLOW_ACI_ROOT_BOOTSTRAP', value: "[string(parameters('allowAciRootBootstrap'))]" },
          ],
          resources: { requests: { cpu: options.resources.cpu, memoryInGB: options.resources.memoryMiB / 1024 } },
          securityContext: { runAsUser: 0, runAsGroup: 0, privileged: false },
          volumeMounts: [{ name: 'product', mountPath: '/workspace/product' }, { name: volume, mountPath: '/run/studio', readOnly: true }],
        },
      });
    }
  }
  const volumes = [
    { name: 'product', azureFile: { shareName: "[parameters('shareName')]", storageAccountName: "[parameters('storageAccount')]", storageAccountKey: "[parameters('storageAccountKey')]" } },
    { name: 'runtime-secrets', secret: secrets },
  ];
  if (options.topology === 'distributed') {
    for (const role of factoryRoles) volumes.push({
      name: `worker-${roleSlug(role)}`, secret: {
        'runtime.json': secrets['runtime.json'], 'worker.token': `[base64(parameters('workerTokens')['${role}'])]`,
        'copilot.token': secrets['copilot.token'], 'ca.crt': secrets['tls.crt'],
        'connector.token': secrets['connector.token'],
      },
    });
  }
  const parameters = azureParameters();
  delete parameters.environmentName;
  parameters.subnetId = parameter('string');
  parameters.allowAciRootBootstrap = parameter('bool', { allowedValues: [true], metadata: { description: 'Explicitly approve the ACI-required Azure Files root bootstrap; launcher drops to UID/GID 1000 before SDK, Git or HTTP work.' } });
  return arm(parameters, [{
    type: 'Microsoft.ContainerInstance/containerGroups', apiVersion: '2026-07-01',
    name: "[parameters('name')]", location: "[parameters('location')]", identity: { type: 'SystemAssigned' },
    properties: { osType: 'Linux', restartPolicy: 'Always', containers, volumes, ipAddress: { type: 'Private', ports: [{ port: 4319, protocol: 'TCP' }] },
      subnetIds: [{ id: "[parameters('subnetId')]" }] },
  }]);
}

export const requiredSecretFiles = secretFiles;
