import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const environments = {
  sandbox: {
    project: 'sandboxtat',
    envFile: '.env.local',
    publicUrl: 'https://sandboxtat.web.app',
    requiredDomains: ['localhost', 'sandboxtat.firebaseapp.com', 'sandboxtat.web.app'],
  },
  prod: {
    project: 'tousatable-client',
    envFile: '.env.prod',
    publicUrl: 'https://tousatable-madeinnormandie.fr',
    requiredDomains: [
      'localhost',
      'tousatable-client.firebaseapp.com',
      'tousatable-client.web.app',
      'tousatable-madeinnormandie.fr',
    ],
  },
};

const failures = [];
const passes = [];

function quoteWindowsArg(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_./:=@~(),-]+$/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function run(command, args) {
  try {
    if (process.platform === 'win32') {
      const cli = command.endsWith('.cmd') ? command : `${command}.cmd`;
      const line = [cli, ...args].map(quoteWindowsArg).join(' ');
      return execFileSync('cmd.exe', ['/d', '/s', '/c', line], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    }
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = String(error?.stderr || error?.message || 'unknown CLI error').trim();
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
}

function runJson(command, args) {
  const output = run(command, args);
  return output ? JSON.parse(output) : [];
}

function parseEnv(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function check(label, condition, detail = '') {
  if (condition) {
    passes.push(label);
    console.log(`PASS ${label}`);
    return;
  }
  failures.push(detail ? `${label}: ${detail}` : label);
  console.error(`FAIL ${label}${detail ? ` - ${detail}` : ''}`);
}

const env = Object.fromEntries(
  Object.entries(environments).map(([name, config]) => [name, parseEnv(config.envFile)]),
);

for (const [name, config] of Object.entries(environments)) {
  check(`${name} Firebase project id`, env[name].VITE_FIREBASE_PROJECT_ID === config.project);
  check(`${name} App Check uses reCAPTCHA Enterprise`, env[name].VITE_RECAPTCHA_ENTERPRISE === 'true');
  check(`${name} App Check site key configured`, Boolean(env[name].VITE_RECAPTCHA_SITE_KEY));
}
check('prod App Check debug token is empty', !env.prod.VITE_APPCHECK_DEBUG_TOKEN);

const accessToken = run('gcloud', ['auth', 'print-access-token']);

async function googleGet(project, url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-user-project': project,
    },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function functionShape(fn) {
  const parts = fn.name.split('/');
  return {
    name: parts.at(-1),
    region: parts.at(-3),
    runtime: fn.runtime,
    entryPoint: fn.entryPoint,
    status: fn.status,
    memory: fn.availableMemoryMb || 256,
    timeout: fn.timeout || '60s',
    ingress: fn.ingressSettings || 'ALLOW_ALL',
    trigger: fn.httpsTrigger ? 'https' : fn.eventTrigger?.eventType || 'unknown',
    secretKeys: (fn.secretEnvironmentVariables || []).map((secret) => secret.key).sort(),
    envKeys: Object.keys(fn.environmentVariables || {}).sort(),
  };
}

const functionsByEnv = {};
for (const [name, config] of Object.entries(environments)) {
  const functions = runJson('gcloud', ['functions', 'list', `--project=${config.project}`, '--format=json']);
  functionsByEnv[name] = functions;
  check(`${name} has 34 active Functions`, functions.length === 34 && functions.every((fn) => fn.status === 'ACTIVE'));
}

const sandboxFunctionShape = functionsByEnv.sandbox.map(functionShape).sort((a, b) => a.name.localeCompare(b.name));
const prodFunctionShape = functionsByEnv.prod.map(functionShape).sort((a, b) => a.name.localeCompare(b.name));
check('Function runtime configuration parity', same(sandboxFunctionShape, prodFunctionShape));

for (const [name, config] of Object.entries(environments)) {
  const serviceAccount = `${config.project}@appspot.gserviceaccount.com`;
  const policy = runJson('gcloud', [
    'iam', 'service-accounts', 'get-iam-policy', serviceAccount,
    `--project=${config.project}`, '--format=json',
  ]);
  const hasSelfSigner = (policy.bindings || []).some((binding) => (
    binding.role === 'roles/iam.serviceAccountTokenCreator'
    && (binding.members || []).includes(`serviceAccount:${serviceAccount}`)
  ));
  check(`${name} App Engine service account can sign its own Firebase tokens`, hasSelfSigner);
}

function functionIamShape(rows) {
  const byName = new Map();
  for (const row of rows) {
    const name = row.resource.split('/').at(-1);
    const bindings = (row.policy?.bindings || [])
      .map((binding) => `${binding.role}=${[...(binding.members || [])].sort().join(',')}`)
      .sort();
    if (!byName.has(name)) byName.set(name, bindings);
  }
  return [...byName.entries()]
    .map(([name, bindings]) => ({ name, bindings }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const functionIam = {};
for (const [name, config] of Object.entries(environments)) {
  const rows = runJson('gcloud', [
    'asset', 'search-all-iam-policies', `--scope=projects/${config.project}`,
    '--query=resource:cloudfunctions.googleapis.com', '--format=json',
  ]);
  functionIam[name] = functionIamShape(rows);
}
check('Function invoker IAM parity', same(functionIam.sandbox, functionIam.prod));

const secretsByEnv = {};
for (const [name, config] of Object.entries(environments)) {
  const secrets = runJson('gcloud', ['secrets', 'list', `--project=${config.project}`, '--format=json'])
    .map((secret) => secret.name.split('/').at(-1))
    .sort();
  secretsByEnv[name] = secrets;

  const attachments = functionsByEnv[name].flatMap((fn) => (
    (fn.secretEnvironmentVariables || []).map((secret) => ({
      functionName: fn.name.split('/').at(-1),
      key: secret.key,
      version: String(secret.version),
    }))
  ));

  for (const secretName of secrets) {
    const latest = run('gcloud', [
      'secrets', 'versions', 'list', secretName, `--project=${config.project}`,
      '--filter=state=ENABLED', '--sort-by=~createTime', '--limit=1', '--format=value(name.basename())',
    ]);
    const stale = attachments.filter((attachment) => attachment.key === secretName && attachment.version !== latest);
    check(
      `${name} Functions use latest ${secretName} version`,
      stale.length === 0,
      stale.map((attachment) => attachment.functionName).join(', '),
    );
  }
}
check('Secret name parity', same(secretsByEnv.sandbox, secretsByEnv.prod));

const requiredApis = [
  'cloudfunctions.googleapis.com',
  'firebaseappcheck.googleapis.com',
  'firebaserules.googleapis.com',
  'firestore.googleapis.com',
  'iamcredentials.googleapis.com',
  'identitytoolkit.googleapis.com',
  'secretmanager.googleapis.com',
  'storage.googleapis.com',
];
for (const [name, config] of Object.entries(environments)) {
  const enabled = new Set(runJson('gcloud', [
    'services', 'list', '--enabled', `--project=${config.project}`, '--format=json',
  ]).map((service) => service.config.name));
  const missingApis = requiredApis.filter((api) => !enabled.has(api));
  check(`${name} required APIs enabled`, missingApis.length === 0, missingApis.join(', '));
}

const authShape = {};
for (const [name, config] of Object.entries(environments)) {
  const authConfig = await googleGet(
    config.project,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${config.project}/config`,
  );
  const providers = await googleGet(
    config.project,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${config.project}/defaultSupportedIdpConfigs`,
  );
  authShape[name] = {
    emailEnabled: authConfig.signIn?.email?.enabled === true,
    passwordRequired: authConfig.signIn?.email?.passwordRequired === true,
    anonymousEnabled: authConfig.signIn?.anonymous?.enabled === true,
    mfaState: authConfig.mfa?.state || 'DISABLED',
    googleEnabled: (providers.defaultSupportedIdpConfigs || []).some((provider) => (
      provider.name.endsWith('/google.com') && provider.enabled === true
    )),
  };
  check(`${name} required Auth domains`, config.requiredDomains.every((domain) => (
    (authConfig.authorizedDomains || []).includes(domain)
  )));
}
check('Authentication provider parity', same(authShape.sandbox, authShape.prod));

const expectedEnforcement = {
  'firebasestorage.googleapis.com': 'UNENFORCED',
  'firestore.googleapis.com': 'ENFORCED',
  'identitytoolkit.googleapis.com': 'ENFORCED',
};
for (const [name, config] of Object.entries(environments)) {
  const appId = encodeURIComponent(env[name].VITE_FIREBASE_APP_ID);
  const enterprise = await googleGet(
    config.project,
    `https://firebaseappcheck.googleapis.com/v1/projects/${config.project}/apps/${appId}/recaptchaEnterpriseConfig`,
  );
  check(`${name} Enterprise App Check key matches frontend`, enterprise.siteKey === env[name].VITE_RECAPTCHA_SITE_KEY);
  check(`${name} Enterprise App Check TTL`, enterprise.tokenTtl === '3600s');

  const services = await googleGet(
    config.project,
    `https://firebaseappcheck.googleapis.com/v1/projects/${config.project}/services`,
  );
  const enforcement = Object.fromEntries(
    (services.services || []).map((service) => [service.name.split('/').at(-1), service.enforcementMode]),
  );
  check(`${name} App Check enforcement`, same(enforcement, expectedEnforcement));

  const debugTokens = await googleGet(
    config.project,
    `https://firebaseappcheck.googleapis.com/v1/projects/${config.project}/apps/${appId}/debugTokens`,
  );
  check(
    `${name} App Check debug token policy`,
    name === 'sandbox'
      ? (debugTokens.debugTokens || []).length >= 1
      : (debugTokens.debugTokens || []).length === 0,
  );

  const recaptchaKey = runJson('gcloud', [
    'recaptcha', 'keys', 'describe', env[name].VITE_RECAPTCHA_SITE_KEY,
    `--project=${config.project}`, '--format=json',
  ]);
  const requiredRecaptchaDomains = config.requiredDomains.filter((domain) => domain !== 'localhost');
  check(`${name} reCAPTCHA key domains`, requiredRecaptchaDomains.every((domain) => (
    (recaptchaKey.webSettings?.allowedDomains || []).includes(domain)
  )));
}

async function rulesHash(project, releaseSuffix) {
  const release = await googleGet(
    project,
    `https://firebaserules.googleapis.com/v1/projects/${project}/releases/${releaseSuffix}`,
  );
  const ruleset = await googleGet(
    project,
    `https://firebaserules.googleapis.com/v1/${release.rulesetName}`,
  );
  const content = (ruleset.source?.files || [])
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((file) => `${file.name}\n${String(file.content).replaceAll('\r\n', '\n')}`)
    .join('\n');
  return createHash('sha256').update(content).digest('hex');
}

const sandboxFirestoreRules = await rulesHash(environments.sandbox.project, 'cloud.firestore');
const prodFirestoreRules = await rulesHash(environments.prod.project, 'cloud.firestore');
check('Deployed Firestore rules parity', sandboxFirestoreRules === prodFirestoreRules);

const sandboxStorageRules = await rulesHash(
  environments.sandbox.project,
  `firebase.storage/${env.sandbox.VITE_FIREBASE_STORAGE_BUCKET}`,
);
const prodStorageRules = await rulesHash(
  environments.prod.project,
  `firebase.storage/${env.prod.VITE_FIREBASE_STORAGE_BUCKET}`,
);
check('Deployed Storage rules parity', sandboxStorageRules === prodStorageRules);

function indexShape(index) {
  return {
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: (index.fields || []).map((field) => ({
      fieldPath: field.fieldPath,
      order: field.order,
      arrayConfig: field.arrayConfig,
    })),
    state: index.state,
  };
}

const sandboxIndexes = runJson('gcloud', [
  'firestore', 'indexes', 'composite', 'list', `--project=${environments.sandbox.project}`, '--format=json',
]).map(indexShape);
const prodIndexes = runJson('gcloud', [
  'firestore', 'indexes', 'composite', 'list', `--project=${environments.prod.project}`, '--format=json',
]).map(indexShape);
check('Firestore composite index parity', same(sandboxIndexes, prodIndexes));

const databaseShape = {};
for (const [name, config] of Object.entries(environments)) {
  const database = runJson('gcloud', [
    'firestore', 'databases', 'describe', '--database=(default)',
    `--project=${config.project}`, '--format=json',
  ]);
  databaseShape[name] = {
    type: database.type,
    concurrencyMode: database.concurrencyMode,
    appEngineIntegrationMode: database.appEngineIntegrationMode,
    deleteProtectionState: database.deleteProtectionState,
    pointInTimeRecoveryEnablement: database.pointInTimeRecoveryEnablement,
  };
}
check('Firestore database behavior parity (location excluded)', same(databaseShape.sandbox, databaseShape.prod));

const securityHeaders = [
  'cache-control',
  'content-security-policy',
  'referrer-policy',
  'x-content-type-options',
  'x-frame-options',
];
const hostingHeaders = {};
for (const [name, config] of Object.entries(environments)) {
  const response = await fetch(config.publicUrl, { method: 'HEAD' });
  check(`${name} Hosting responds`, response.ok, `HTTP ${response.status}`);
  hostingHeaders[name] = Object.fromEntries(
    securityHeaders.map((header) => [header, response.headers.get(header) || '']),
  );
}
check('Hosting security header parity', same(hostingHeaders.sandbox, hostingHeaders.prod));

if (failures.length > 0) {
  console.error(`\nEnvironment parity failed: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nEnvironment parity OK: ${passes.length} checks passed. No Firestore data was read or written.`);
