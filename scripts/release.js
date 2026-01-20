#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const version = args[0];
const notes = args.slice(1).join(' ').trim();

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/release.js <x.y.z> [notes]');
  process.exit(1);
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync('node_modules')) {
  console.log('Installing dependencies...');
  run('npm', ['install']);
}

run('npm', ['run', 'lint']);
run('npm', ['run', 'bump', '--', version, notes]);
run('npm', ['run', 'format:check']);
run('npm', ['run', 'build']);

console.log(`Release workflow complete for ${version}.`);
