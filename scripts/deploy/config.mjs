export const PROJECT_NAME = 'Tous-Table';

export const ENVIRONMENTS = {
  sandbox: {
    name: 'sandbox',
    alias: 'default',
    projectId: 'tatmadeinnormandie',
    envFile: '.env.local', // Le mode dev de Vite lit .env.local
    buildScript: 'build',
    url: 'https://tatmadeinnormandie.web.app',
    label: 'SANDBOX',
    color: 'cyan'
  },
  prod: {
    name: 'prod',
    alias: 'prod',
    projectId: 'tousatable-client',
    envFile: '.env.prod',
    buildScript: 'build:prod',
    url: 'https://tousatable-madeinnormandie.fr',
    label: 'PRODUCTION',
    color: 'red'
  }
};

export const DEPLOY_TARGETS = {
  hosting: 'hosting',
  functions: 'functions',
  firestore: 'firestore',
  storage: 'storage',
};

export const FORBIDDEN_IDS = [
  'secondevie-a0745'
];
