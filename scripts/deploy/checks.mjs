import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FORBIDDEN_IDS } from './config.mjs';

const TEXT_EXTENSIONS = new Set(['.js', '.json', '.html', '.css', '.txt']);

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

export function checkFirebaseCLI() {
  try {
    const rawVersion = execSync('firebase --version', { stdio: 'pipe' }).toString();
    return { ok: true, version: rawVersion.trim() };
  } catch {
    return {
      ok: false,
      error: 'Firebase CLI non installé. Lance : npm install -g firebase-tools',
    };
  }
}

export function getFirebaseUser() {
  try {
    const result = execSync('firebase login:list', { stdio: 'pipe' }).toString();
    const match = result.match(/Logged in as (\S+)/);
    if (match) return { ok: true, email: match[1] };
    return { ok: false, error: 'Non connecté à Firebase. Lance : firebase login' };
  } catch {
    return { ok: false, error: 'Impossible de vérifier le compte Firebase' };
  }
}

export function getCurrentProject(environments) {
  try {
    const result = execSync('firebase use', { stdio: 'pipe' }).toString();
    
    let activeEnv = null;
    let activeProjectId = null;
    
    for (const [key, env] of Object.entries(environments)) {
      if (result.includes(env.projectId)) {
        activeEnv = env;
        activeProjectId = env.projectId;
        break;
      }
    }
    
    if (!activeProjectId) {
      activeProjectId = result.split(/\r?\n/).find(Boolean)?.trim() ?? null;
    }

    return {
      ok: true,
      projectId: activeProjectId,
      env: activeEnv,
    };
  } catch {
    return {
      ok: false,
      error: 'Aucun projet Firebase actif.',
    };
  }
}

export function checkEnvFile(envConfig) {
  if (!fs.existsSync(envConfig.envFile)) {
    return { ok: false, error: `Fichier ${envConfig.envFile} introuvable` };
  }

  const content = fs.readFileSync(envConfig.envFile, 'utf8');
  const accepted = [
    `VITE_FIREBASE_PROJECT_ID=${envConfig.projectId}`
  ];

  if (!accepted.some((line) => content.includes(line))) {
    return {
      ok: false,
      error: `${envConfig.envFile} ne pointe pas vers "${envConfig.projectId}"`,
    };
  }

  return { ok: true };
}

export function checkFirebaseJson() {
  if (!fs.existsSync('firebase.json')) {
    return { ok: false, error: 'firebase.json introuvable' };
  }
  return { ok: true };
}

export function checkBuildArtifact(envConfig) {
  if (!fs.existsSync('dist')) {
    return { ok: false, error: 'Aucun build Vite dans dist/. Lance npm run build.' };
  }

  const files = walkFiles('dist').filter((file) => TEXT_EXTENSIONS.has(path.extname(file)));

  let foundProjectId = false;
  const foundForbidden = new Set();

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(envConfig.projectId)) foundProjectId = true;
    for (const forbiddenId of FORBIDDEN_IDS) {
      if (content.includes(forbiddenId)) foundForbidden.add(forbiddenId);
    }
  }

  if (foundForbidden.size > 0) {
    return {
      ok: false,
      error: `ALERTE : le build contient des IDs interdits : ${[...foundForbidden].join(', ')}`,
    };
  }

  if (!foundProjectId) {
    return {
      ok: false,
      error: `Le build ne contient pas "${envConfig.projectId}". Mauvais environnement de build ?`,
    };
  }

  return { ok: true };
}

export function checkGitStatus() {
  try {
    const status = execSync('git status --porcelain', { stdio: 'pipe' }).toString().trim();
    const branch = execSync('git branch --show-current', { stdio: 'pipe' }).toString().trim();
    return {
      ok: true,
      clean: status === '',
      branch,
      changes: status.split('\n').filter(Boolean).length,
    };
  } catch {
    return { ok: false, error: 'Impossible de lire le statut git' };
  }
}
