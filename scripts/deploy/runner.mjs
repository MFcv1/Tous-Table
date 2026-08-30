import { spawn, execSync } from 'node:child_process';
import { DEPLOY_TARGETS } from './config.mjs';

const PROD_PREFLIGHT_VALIDITY_MS = 15 * 60 * 1000;
const PROD_PROJECT_ID = 'tousatable-client';
let prodPreflightPassedAt = 0;

const isProductionTarget = (envConfig) => envConfig.projectId === PROD_PROJECT_ID;

function runLive(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (exitCode) => {
      const windowsLibuvShutdownCode = 3221226505;
      if (exitCode === 0 || exitCode === windowsLibuvShutdownCode) {
        resolve();
        return;
      }
      reject(new Error(`La commande a echoué (code de sortie : ${exitCode})`));
    });

    proc.on('error', (err) => {
      reject(new Error(`Impossible de lancer "${command}" : ${err.message}`));
    });
  });
}

export function switchProject(envConfig) {
  try {
    execSync(`firebase use ${envConfig.alias}`, { stdio: 'pipe' });
    return { ok: true };
  } catch {
    try {
      execSync(`firebase use ${envConfig.projectId}`, { stdio: 'pipe' });
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: `Impossible de basculer vers "${envConfig.projectId}". Vérifie .firebaserc.`,
      };
    }
  }
}

export async function buildProject(envConfig) {
  try {
    await runLive('npm', ['run', envConfig.buildScript]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function runProdPreflight(envConfig) {
  prodPreflightPassedAt = 0;

  if (!isProductionTarget(envConfig)) {
    return { ok: true, buildReady: false };
  }

  try {
    await runLive('npm', ['run', 'preflight:prod']);
    prodPreflightPassedAt = Date.now();
    return { ok: true, buildReady: true };
  } catch (err) {
    return { ok: false, buildReady: false, error: err.message };
  }
}

async function deployOnly(targets, envConfig) {
  const isProd = isProductionTarget(envConfig);
  const hasFreshProdPreflight = prodPreflightPassedAt > 0
    && Date.now() - prodPreflightPassedAt <= PROD_PREFLIGHT_VALIDITY_MS;

  if (isProd && !hasFreshProdPreflight) {
    return {
      ok: false,
      error: 'Déploiement production bloqué : le contrôle complet preflight:prod doit réussir juste avant.',
    };
  }

  // Un preflight production ne peut autoriser qu'une seule tentative de déploiement.
  if (isProd) prodPreflightPassedAt = 0;

  try {
    await runLive('firebase', [
      'deploy',
      '--only',
      targets.join(','),
      '--project',
      envConfig.projectId,
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export const deployHosting = (envConfig) => deployOnly([DEPLOY_TARGETS.hosting], envConfig);
export const deployFunctions = (envConfig) => deployOnly([DEPLOY_TARGETS.functions], envConfig);
export const deployFirestore = (envConfig) => deployOnly([DEPLOY_TARGETS.firestore], envConfig);
export const deployStorage = (envConfig) => deployOnly([DEPLOY_TARGETS.storage], envConfig);

export const deployEverything = (envConfig) => deployOnly([
  DEPLOY_TARGETS.hosting,
  DEPLOY_TARGETS.functions,
  DEPLOY_TARGETS.firestore,
  DEPLOY_TARGETS.storage,
], envConfig);
