#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { DEPLOY_TARGETS, PROJECT_NAME, ENVIRONMENTS } from './config.mjs';
import {
  checkBuildArtifact,
  checkEnvFile,
  checkFirebaseCLI,
  checkFirebaseJson,
  checkGitStatus,
  getCurrentProject,
  getFirebaseUser,
} from './checks.mjs';
import {
  buildProject,
  deployHosting,
  deployEverything,
  deployFirestore,
  deployFunctions,
  deployStorage,
  switchProject,
} from './runner.mjs';

const ok = (msg) => console.log(chalk.green(`  OK  ${msg}`));
const warn = (msg) => console.log(chalk.yellow(`  !   ${msg}`));
const fail = (msg) => console.log(chalk.red(`  X   ${msg}`));
const step = (title) => {
  console.log('');
  console.log(chalk.bold(`  -- ${title}`));
  console.log('');
};

let ACTIVE_ENV = null;

function showHeader() {
  console.clear();

  const project = getCurrentProject(ENVIRONMENTS);
  const git = checkGitStatus();

  console.log('');
  console.log(chalk.bold.white('  FIREBASE DEPLOY DASHBOARD'));
  console.log(chalk.gray(`       ${PROJECT_NAME}`));
  console.log('');

  if (ACTIVE_ENV) {
    const badgeColor = ACTIVE_ENV.color === 'red' ? chalk.bgRed.white.bold : chalk.bgCyan.black.bold;
    console.log(`  Environnement sélectionné ->  ${badgeColor(` ${ACTIVE_ENV.label} `)}  ${chalk.gray(ACTIVE_ENV.projectId)}`);
  }

  if (project.ok && project.env) {
    const pBadgeColor = project.env.color === 'red' ? chalk.bgRed.white.bold : chalk.bgCyan.black.bold;
    console.log(`  Projet actif Firebase     ->  ${pBadgeColor(` ${project.env.label} `)}  ${chalk.gray(project.projectId)}`);
  } else {
    console.log(`  Projet actif Firebase     ->  ${chalk.bgGray.white.bold(' INCONNU ')}  ${chalk.gray(project.projectId ?? '?')}`);
  }

  if (git.ok) {
    const branchLabel = git.clean
      ? chalk.green(`${git.branch} clean`)
      : chalk.yellow(`${git.branch} - ${git.changes} fichier(s) non commité(s)`);
    console.log(`  Branche git               ->  ${branchLabel}`);
  }

  if (ACTIVE_ENV) {
    console.log('');
    console.log(chalk.gray('  ' + '-'.repeat(64)));
    console.log(`  ${chalk.cyan('URL Principale')}  ${chalk.underline(ACTIVE_ENV.url)}`);
    console.log(`  ${chalk.cyan('Fichier Env')}     ${ACTIVE_ENV.envFile}`);
    console.log(chalk.gray('  ' + '-'.repeat(64)));
    console.log('');
  }
}

function runPreChecks({ requireBuild = false } = {}) {
  const cli = checkFirebaseCLI();
  if (!cli.ok) return cli;
  ok(`Firebase CLI ${cli.version}`);

  const env = checkEnvFile(ACTIVE_ENV);
  if (!env.ok) return env;
  ok(`${ACTIVE_ENV.envFile} pointe bien vers ${ACTIVE_ENV.projectId}`);

  const firebaseJson = checkFirebaseJson();
  if (!firebaseJson.ok) return firebaseJson;
  ok(`firebase.json trouvé`);

  const git = checkGitStatus();
  if (git.ok && git.clean) {
    ok(`Git : branch "${git.branch}" clean`);
  } else if (git.ok) {
    warn(`Git : ${git.changes} fichier(s) non commité(s) sur "${git.branch}"`);
  }

  if (requireBuild) {
    const build = checkBuildArtifact(ACTIVE_ENV);
    if (!build.ok) return build;
    ok(`Build Vite (dist) vérifié pour ${ACTIVE_ENV.projectId}`);
  }

  return { ok: true };
}

async function switchToEnv() {
  const spinner = ora(`  Bascule vers ${ACTIVE_ENV.projectId}...`).start();
  const result = switchProject(ACTIVE_ENV);
  if (!result.ok) {
    spinner.fail(chalk.red(`  X  ${result.error}`));
    return false;
  }
  spinner.succeed(chalk.green(`  OK Projet Firebase actif -> ${ACTIVE_ENV.projectId}`));
  return true;
}

async function runBuildGate() {
  step(`BUILD ${ACTIVE_ENV.label} (npm run ${ACTIVE_ENV.buildScript})`);
  const result = await buildProject(ACTIVE_ENV);
  if (!result.ok) {
    fail(`Build échoué : ${result.error}`);
    return false;
  }

  step('VERIFICATION POST-BUILD');
  const artifact = checkBuildArtifact(ACTIVE_ENV);
  if (!artifact.ok) {
    fail(artifact.error);
    return false;
  }

  ok(`dist/ contient ${ACTIVE_ENV.projectId}`);
  ok('Aucun ID Firebase interdit détecté dans les artefacts compilés');
  return true;
}

async function runHostingDeploy() {
  const start = Date.now();
  step('PRE-CHECKS');
  const checks = runPreChecks();
  if (!checks.ok) { fail(checks.error); return; }
  if (!await switchToEnv()) return;
  if (!await runBuildGate()) return;

  step(`DEPLOIEMENT HOSTING -> ${ACTIVE_ENV.label}`);
  console.log(chalk.gray(`  firebase deploy --only ${DEPLOY_TARGETS.hosting} --project ${ACTIVE_ENV.projectId}`));
  console.log('');

  const result = await deployHosting(ACTIVE_ENV);
  if (!result.ok) { fail(`Déploiement échoué : ${result.error}`); return; }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  ok(`Hosting ${ACTIVE_ENV.label} déployé en ${duration}s`);
  console.log(`  URL : ${chalk.underline(ACTIVE_ENV.url)}`);
  console.log('');
}

async function runFunctionsDeploy() {
  step(`DEPLOY FUNCTIONS -> ${ACTIVE_ENV.label}`);
  const checks = runPreChecks();
  if (!checks.ok) { fail(checks.error); return; }
  if (!await switchToEnv()) return;

  console.log(chalk.gray(`\n  firebase deploy --only ${DEPLOY_TARGETS.functions} --project ${ACTIVE_ENV.projectId}\n`));
  const result = await deployFunctions(ACTIVE_ENV);
  result.ok ? ok(`Cloud Functions déployées en ${ACTIVE_ENV.label}`) : fail(result.error);
  console.log('');
}

async function runFirestoreDeploy() {
  step(`DEPLOY FIRESTORE RULES + INDEXES -> ${ACTIVE_ENV.label}`);
  const checks = runPreChecks();
  if (!checks.ok) { fail(checks.error); return; }
  if (!await switchToEnv()) return;

  console.log(chalk.gray(`\n  firebase deploy --only ${DEPLOY_TARGETS.firestore} --project ${ACTIVE_ENV.projectId}\n`));
  const result = await deployFirestore(ACTIVE_ENV);
  result.ok ? ok(`Firestore rules + indexes déployés en ${ACTIVE_ENV.label}`) : fail(result.error);
  console.log('');
}

async function runStorageDeploy() {
  step(`DEPLOY STORAGE RULES -> ${ACTIVE_ENV.label}`);
  const checks = runPreChecks();
  if (!checks.ok) { fail(checks.error); return; }
  if (!await switchToEnv()) return;

  console.log(chalk.gray(`\n  firebase deploy --only ${DEPLOY_TARGETS.storage} --project ${ACTIVE_ENV.projectId}\n`));
  const result = await deployStorage(ACTIVE_ENV);
  result.ok ? ok(`Storage rules déployées en ${ACTIVE_ENV.label}`) : fail(result.error);
  console.log('');
}

async function runEverythingDeploy() {
  console.log('');
  
  const warnColor = ACTIVE_ENV.color === 'red' ? chalk.red.bold : chalk.yellow.bold;
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: warnColor(`ATTENTION: Tout déployer sur ${ACTIVE_ENV.label} (${ACTIVE_ENV.projectId}) ?`),
    default: false,
  }]);
  
  if (!confirm) {
    console.log(chalk.yellow('\n  Annulé.\n'));
    return;
  }

  const start = Date.now();
  step('PRE-CHECKS');
  const checks = runPreChecks();
  if (!checks.ok) { fail(checks.error); return; }
  if (!await switchToEnv()) return;
  if (!await runBuildGate()) return;

  step(`DEPLOIEMENT COMPLET -> ${ACTIVE_ENV.label}`);
  const only = [
    DEPLOY_TARGETS.hosting,
    DEPLOY_TARGETS.functions,
    DEPLOY_TARGETS.firestore,
    DEPLOY_TARGETS.storage,
  ].join(',');
  console.log(chalk.gray(`  firebase deploy --only ${only} --project ${ACTIVE_ENV.projectId}`));
  console.log(chalk.gray('  (Hosting + Functions + Firestore rules/indexes + Storage rules)'));
  console.log('');

  const result = await deployEverything(ACTIVE_ENV);
  if (!result.ok) { fail(`Déploiement échoué : ${result.error}`); return; }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  ok(`Tout déployé en ${ACTIVE_ENV.label} en ${duration}s`);
  console.log(`  URL : ${chalk.underline(ACTIVE_ENV.url)}`);
  console.log('');
}

async function showStatus() {
  step('ETAT COMPLET DU SYSTEME');

  const cli = checkFirebaseCLI();
  cli.ok ? ok(`Firebase CLI ${cli.version}`) : fail(cli.error);

  const user = getFirebaseUser();
  user.ok ? ok(`Compte connecté : ${chalk.bold(user.email)}`) : fail(user.error);

  const project = getCurrentProject(ENVIRONMENTS);
  if (project.ok && project.env) {
    const badge = project.env.color === 'red' ? chalk.bgRed.white.bold : chalk.bgCyan.black.bold;
    ok(`Projet actif : ${badge(` ${project.env.label} `)} ${project.projectId}`);
  } else if (project.ok) {
    warn(`Projet actif inconnu : ${project.projectId ?? 'inconnu'}`);
  } else {
    warn(project.error);
  }

  const git = checkGitStatus();
  if (git.ok) {
    git.clean
      ? ok(`Git : branch "${git.branch}" clean`)
      : warn(`Git : branch "${git.branch}" - ${git.changes} fichier(s) non commité(s)`);
  }

  console.log('');
}

async function askEnvironment() {
  showHeader();
  const { env } = await inquirer.prompt([{
    type: 'list',
    name: 'env',
    message: 'Quel environnement souhaites-tu gérer ?',
    choices: [
      { name: chalk.cyan.bold('SANDBOX    (tatmadeinnormandie)'), value: 'sandbox' },
      { name: chalk.red.bold('PRODUCTION (tousatable-client)'), value: 'prod' },
      new inquirer.Separator(),
      { name: 'Voir l\'état du système (Status)', value: 'status' },
      { name: chalk.gray('Quitter'), value: 'quit' },
    ]
  }]);

  if (env === 'status') {
    await showStatus();
    await inquirer.prompt([{ type: 'input', name: '_', message: chalk.gray('Appuie sur Entrée pour revenir au menu...') }]);
    return askEnvironment();
  }

  if (env === 'quit') {
    return false;
  }

  ACTIVE_ENV = ENVIRONMENTS[env];
  return true;
}

async function main() {
  const cli = checkFirebaseCLI();
  if (!cli.ok) {
    console.log(chalk.red(`\n  ERREUR : ${cli.error}\n`));
    process.exit(1);
  }

  const proceed = await askEnvironment();
  if (!proceed) {
    console.log(chalk.gray('\n  Au revoir.\n'));
    return;
  }

  let running = true;
  while (running) {
    showHeader();

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Que veux-tu faire ?',
      pageSize: 10,
      choices: [
        {
          name: `${chalk.bold(`Déployer Frontend (${ACTIVE_ENV.label})`)}  ${chalk.gray(`build local + deploy Firebase Hosting`)}`,
          value: 'hosting',
        },
        new inquirer.Separator(chalk.gray('  ' + '-'.repeat(48))),
        { name: `Functions uniquement            ${chalk.gray('(sans rebuild du site)')}`, value: 'functions' },
        { name: `Firestore rules + indexes      ${chalk.gray('(firestore.rules + firestore.indexes.json)')}`, value: 'firestore' },
        { name: `Storage rules uniquement       ${chalk.gray('(storage.rules)')}`, value: 'storage' },
        new inquirer.Separator(chalk.gray('  ' + '-'.repeat(48))),
        {
          name: `${chalk.magenta.bold(`TOUT déployer en ${ACTIVE_ENV.label}`)}    ${chalk.gray('hosting + functions + firestore + storage')}`,
          value: 'everything',
        },
        new inquirer.Separator(chalk.gray('  ' + '-'.repeat(48))),
        { name: 'Changer d\'environnement', value: 'change_env' },
        { name: chalk.gray('Quitter'), value: 'quit' },
      ],
    }]);

    switch (action) {
      case 'hosting':
        await runHostingDeploy();
        break;
      case 'functions':
        await runFunctionsDeploy();
        break;
      case 'firestore':
        await runFirestoreDeploy();
        break;
      case 'storage':
        await runStorageDeploy();
        break;
      case 'everything':
        await runEverythingDeploy();
        break;
      case 'change_env':
        ACTIVE_ENV = null;
        if (!(await askEnvironment())) running = false;
        continue;
      case 'quit':
        running = false;
        console.log(chalk.gray('\n  Au revoir.\n'));
        break;
    }

    if (running) {
      await inquirer.prompt([{
        type: 'input',
        name: '_',
        message: chalk.gray('Appuie sur Entrée pour revenir au menu...'),
      }]);
    }
  }
}

main().catch((err) => {
  console.error(chalk.red(`\n  ERREUR FATALE : ${err.message}\n`));
  process.exit(1);
});
