import { spawn, execSync } from 'node:child_process';
import { DEPLOY_TARGETS } from './config.mjs';

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

async function deployOnly(targets, envConfig) {
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
