import { spawnSync } from 'node:child_process';

const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runStep(label, command, args) {
  console.log(`\n== ${label} ==`);
  const isWindowsCmd = process.platform === 'win32' && command.endsWith('.cmd');
  const result = spawnSync(
    isWindowsCmd ? 'cmd.exe' : command,
    isWindowsCmd ? ['/d', '/s', '/c', `${command} ${args.join(' ')}`] : args,
    {
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
    },
  );

  if (result.error) {
    console.error(`Preflight stopped: ${label} failed to start.`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Preflight stopped: ${label} failed.`);
    process.exit(result.status || 1);
  }
}

runStep('Prod env', npmBin, ['run', 'verify:prod-env']);
runStep('Prod furniture category mapping', npmBin, ['run', 'verify:prod-furniture']);
runStep('SEO roadmap verification', npmBin, ['run', 'verify:seo-roadmap']);
runStep('Analytics reliability verification', npmBin, ['run', 'verify:analytics-reliability']);
runStep('Cart ownership and quantity verification', npmBin, ['run', 'verify:cart-boundary']);
runStep('Dangerous admin and stock restore verification', npmBin, ['run', 'verify:dangerous-admin']);
runStep('Email OTP security verification', npmBin, ['run', 'verify:email-otp']);
runStep('Functions syntax', npmBin, ['run', 'verify:functions-syntax']);
runStep('Frontend production dependency audit', npmBin, ['audit', '--omit=dev']);
runStep('Functions production dependency audit', npmBin, ['--prefix', 'functions', 'audit', '--omit=dev']);
runStep('Prod frontend build', npmBin, ['run', 'build:prod']);
runStep('Prod bundle verification', npmBin, ['run', 'verify:prod-bundle']);

console.log('\n== Functions env audit ==');
console.log('This step is informational: it prints counts only and never secret values.');
runStep('Functions prod env audit', npmBin, [
  'run',
  'audit:functions-env',
  '--',
  '--project=tousatable-client',
]);

console.log('\nPreflight prod OK. No deployment was run.');
