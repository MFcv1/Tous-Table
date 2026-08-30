import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');

if (!existsSync(distDir)) {
  console.error('dist/ is missing. Run npm run build:prod first.');
  process.exit(1);
}

const files = [];

function collectFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collectFiles(path);
    } else if (/\.(html|js|css|json|webmanifest)$/i.test(entry)) {
      files.push(path);
    }
  }
}

collectFiles(distDir);

const forbiddenPatterns = [
  {
    label: 'sandbox Firebase project id',
    pattern: /tatmadeinnormandie(?!\.webp|\.jpg|\.jpeg|\.png|\.avif|\.gif)/i,
  },
  {
    label: 'Stripe test key',
    pattern: /pk_test_/i,
  },
  {
    label: 'Stripe live placeholder',
    pattern: /__REPLACE_WITH_STRIPE/i,
  },
  {
    label: 'Stripe JS loader while card payments are disabled',
    pattern: /js\.stripe\.com/i,
  },
  {
    label: 'App Check debug token hook',
    pattern: /FIREBASE_APPCHECK_DEBUG_TOKEN/,
    excludeFilePattern: /[\\/]firebase-[^\\/]+\.js$/i,
  },
];

const findings = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const { label, pattern, excludeFilePattern } of forbiddenPatterns) {
    if (!excludeFilePattern?.test(file) && pattern.test(content)) {
      findings.push({ file: file.replace(process.cwd(), '').replace(/^[\\/]/, ''), label });
    }
  }
}

if (findings.length > 0) {
  console.error('Prod bundle verification failed:');
  for (const finding of findings) {
    console.error(`- ${finding.label}: ${finding.file}`);
  }
  process.exit(1);
}

console.log(`Prod bundle OK: ${files.length} files scanned, no sandbox config, App Check debug token hook or active Stripe loader found.`);
