import { mkdir, lstat, writeFile, readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { containsCredential, digest, object, StudioError, text, validateBlueprint } from './contracts.mjs';
import { immutableImage } from './executor.mjs';
import { aciDeployment, acaDeployment, aksDeployment, composeDeployment, kubernetesDeployment, requiredSecretFiles } from './deployments.mjs';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const filenames = ['Dockerfile', 'blueprint.json', 'runtime.json', 'compose.json', 'kubernetes.json', 'aks.arm.json', 'aca.arm.json', 'aci.arm.json', 'deploy.ps1', 'validate.mjs'];

export function compileFactoryPackage(input) {
  object(input, ['blueprint', 'image', 'verification', 'bindingKey']);
  const blueprint = validateBlueprint(input.blueprint);
  if (!blueprint.deployment) throw new StudioError('DEPLOYMENT_REQUIRED', 'Add Factory deployment options to the blueprint.');
  const image = immutableImage(input.image);
  const bindingKey = text(input.bindingKey, 'Product store binding', 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(bindingKey)) throw new StudioError('STORE_CONFIGURATION', 'Use a filesystem-safe stable product binding key.');
  object(input.verification, ['command', 'args']);
  if (typeof input.verification.command !== 'string' || !input.verification.command.trim()
    || /^[a-z]:|[\\]/i.test(input.verification.command)
    || !Array.isArray(input.verification.args) || !input.verification.args.every((arg) => typeof arg === 'string')) {
    throw new StudioError('VERIFICATION_REQUIRED', 'Provide a Linux-container acceptance executable and string arguments, not a Windows host path.');
  }
  if (containsCredential(JSON.stringify(input))) throw new StudioError('CREDENTIAL_CONTENT_DENIED', 'Credentials do not belong in a blueprint or container build context.');
  const configuration = { version: 1, blueprint, verification: input.verification, bindingKey };
  const blueprintDigest = digest(blueprint);
  const dockerfile = `FROM ${image}\nCOPY --chown=1000:1000 runtime.json /opt/adhd/runtime.json\nENV STUDIO_CONFIG_FILE=/opt/adhd/runtime.json\nLABEL io.adhd.blueprint="${blueprintDigest}"\n`;
  const files = {
    Dockerfile: dockerfile, 'blueprint.json': json(blueprint), 'runtime.json': json(configuration),
    'compose.json': json(composeDeployment(configuration, image)),
    'kubernetes.json': json(kubernetesDeployment(configuration, image)),
    'aks.arm.json': json(aksDeployment(configuration)),
    'aca.arm.json': json(acaDeployment(configuration, image)),
    'aci.arm.json': json(aciDeployment(configuration, image)),
    'deploy.ps1': deploymentScript(blueprint.deployment.target),
    'validate.mjs': `import { readFile } from 'node:fs/promises';\nimport { createHash } from 'node:crypto';\nconst files = {};\nfor (const name of ${JSON.stringify(filenames)}) files[name] = await readFile(new URL(name, import.meta.url), 'utf8');\nconst digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');\nif (process.argv[2] && process.argv[2] !== digest) throw new Error('Deployment artifact drift: supplied digest does not match actual files.');\nconsole.log(digest);\n`,
  };
  return {
    version: 1, digest: digest(files), blueprintDigest, files,
    manifest: {
      runtimeImage: image, bindingKey, targets: ['docker', 'kubernetes', 'aks', 'aca', 'aci'],
      deployment: blueprint.deployment, requiredSecretFiles,
      authority: 'Deployment package only. Image building, provisioning, production and release require their own owner authority.',
      proof: 'Generated artifacts are not a live deployment or concurrency certificate.',
      prerequisites: [
        'A product-owned Git repository and protected runtime secrets.',
        'A reviewed, digest-pinned ADHD runtime image built from this source.',
        'A trusted HTTPS isolated verification executor, or explicit manual verification in human-in-the-loop mode.',
        'A compatible persistent repository volume; PostgreSQL optionally owns canonical state.',
        'ACI Azure Files requires explicitly approved root bootstrap; the application drops to UID 1000.',
        'Certificates must cover the actual service and distributed-worker DNS names.',
      ],
    },
  };
}

function deploymentScript(target) {
  return `param(
  [Parameter(Mandatory)][ValidateSet('plan','apply')][string]$Action,
  [string]$ResourceGroup,
  [string]$ParameterFile,
  [string]$ApprovedPlanDigest
)
$ErrorActionPreference = 'Stop'
$Target = '${target}'
$ArtifactDigest = & node (Join-Path $PSScriptRoot 'validate.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Package integrity validation failed.' }
$ParametersDigest = if ($ParameterFile) { (Get-FileHash -LiteralPath $ParameterFile -Algorithm SHA256).Hash } else { '' }
$ProviderTarget = ''
$Preview = ''
if ($Target -eq 'docker') {
  $ProviderTarget = (& docker context inspect --format '{{json .Endpoints.docker.Host}}') -join ''
  if ($LASTEXITCODE -ne 0) { throw 'Docker context inspection failed.' }
  $Preview = (& docker compose -f (Join-Path $PSScriptRoot 'compose.json') config --format json) -join ''
  if ($LASTEXITCODE -ne 0) { throw 'Compose validation failed.' }
} elseif ($Target -eq 'kubernetes') {
  $ProviderTarget = (& kubectl config view --minify -o 'jsonpath={.clusters[0].cluster.server}') -join ''
  if ($LASTEXITCODE -ne 0) { throw 'Kubernetes context inspection failed.' }
  $Preview = (& kubectl apply --dry-run=client -f (Join-Path $PSScriptRoot 'kubernetes.json') -o json) -join ''
  if ($LASTEXITCODE -ne 0) { throw 'Kubernetes client validation failed; server-side readiness is a separate gate.' }
} else {
  if (!$ResourceGroup -or !$ParameterFile) { throw 'An approved resource group and protected ARM parameter file are required.' }
  $Template = Join-Path $PSScriptRoot ($Target + '.arm.json')
  $ProviderTarget = (& az account show --query '[id,tenantId,environmentName]' --output json) -join ''
  if ($LASTEXITCODE -ne 0) { throw 'Azure identity context inspection failed; sign-in remains human-only.' }
  $Preview = (& az deployment group what-if --resource-group $ResourceGroup --template-file $Template --parameters ('@' + $ParameterFile) --output json) -join ''
  if ($LASTEXITCODE -ne 0) { throw 'Azure what-if failed.' }
}
$Scope = [ordered]@{ artifact = $ArtifactDigest; target = $Target; provider = $ProviderTarget; preview = $Preview; resourceGroup = $ResourceGroup; parameters = $ParametersDigest }
$ScopeDigest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($Scope | ConvertTo-Json -Compress)))).ToLowerInvariant()
if ($Action -eq 'apply') {
  if ($ApprovedPlanDigest -ne $ScopeDigest) { throw 'The current artifact, preview, parameters and provider target do not match the separately approved plan digest.' }
  if ($Target -eq 'docker') {
    & docker compose -f (Join-Path $PSScriptRoot 'compose.json') up -d
    if ($LASTEXITCODE -ne 0) { throw 'Docker deployment failed.' }
  } elseif ($Target -eq 'kubernetes') {
    & kubectl apply -f (Join-Path $PSScriptRoot 'kubernetes.json')
    if ($LASTEXITCODE -ne 0) { throw 'Kubernetes deployment failed.' }
  } else {
    & az deployment group create --resource-group $ResourceGroup --template-file $Template --parameters ('@' + $ParameterFile) --output none
    if ($LASTEXITCODE -ne 0) { throw 'Azure deployment failed.' }
    if ($Target -eq 'aks') {
      Write-Output 'Cluster provisioned. An authorized operator must obtain non-admin access and apply kubernetes.json.'
    }
  }
}
Write-Output ('Plan scope digest: ' + $ScopeDigest)
Write-Output 'A digest binds inputs; it does not itself supply owner approval or a cloud-spending budget.'
`;
}

export async function materializeFactoryPackage(bundle, directory) {
  object(bundle, ['version', 'digest', 'blueprintDigest', 'files', 'manifest']);
  if (bundle.version !== 1 || !bundle.files || Object.keys(bundle.files).length !== filenames.length
    || filenames.some((name) => typeof bundle.files[name] !== 'string')
    || digest(bundle.files) !== bundle.digest) throw new StudioError('PACKAGE_INTEGRITY', 'The deployment package contents or digest are invalid.');
  if (!isAbsolute(directory)) throw new StudioError('PACKAGE_DESTINATION', 'Choose an explicit absolute output directory.');
  try {
    await lstat(directory);
    throw new StudioError('PACKAGE_DESTINATION', 'Choose a new output directory; existing files are never overwritten.', 409);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(directory);
  for (const name of filenames) await writeFile(join(directory, name), bundle.files[name], { flag: 'wx', mode: 0o644 });
  await writeFile(join(directory, 'package.json'), json(bundle.manifest), { flag: 'wx', mode: 0o644 });
  await writeFile(join(directory, 'package.digest'), `${bundle.digest}\n`, { flag: 'wx', mode: 0o644 });
  return { directory, digest: bundle.digest };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 3 || args[0] !== 'materialize') throw new StudioError('INVALID_ARGUMENTS', 'Use: node studio/package.mjs materialize <downloaded-package.json> <new-absolute-output-directory>.');
  return materializeFactoryPackage(JSON.parse(await readFile(args[1], 'utf8')), args[2]);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then((result) => console.log(`Factory package written: ${result.directory} / ${result.digest}`), (error) => { console.error(error.message); process.exitCode = 1; });
}
