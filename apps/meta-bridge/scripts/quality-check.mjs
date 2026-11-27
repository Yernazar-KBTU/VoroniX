
import { spawnSync } from 'node:child_process';

const checks = [
  'src/server.mjs',
  'src/lib.mjs',
  'src/media.mjs'
];

let failed = false;

for (const file of checks) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit'
  });

  if (result.status === 0) {
    console.log(`PASS: ${file}`);
  } else {
    console.log(`FAIL: ${file}`);
    failed = true;
  }
}

console.log('\nRunning automated tests...');

const tests = spawnSync(
  process.execPath,
  ['--test', 'test/lib.test.mjs', 'test/media.test.mjs'],
  { stdio: 'inherit' }
);

if (tests.status !== 0) {
  failed = true;
}

if (failed) {
  console.log('\nQUALITY CHECK FAILED');
  process.exit(1);
}

console.log('\nQUALITY CHECK PASSED');
