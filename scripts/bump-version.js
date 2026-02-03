#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const version = args[0];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/bump-version.js <x.y.z> [notes]');
  process.exit(1);
}

const notes = args.slice(1).join(' ').trim();
const date = new Date().toISOString().slice(0, 10);

const root = path.resolve(__dirname, '..');
const appVersionPaths = [path.join(root, 'public', 'app-version.js')];
const manifestPath = path.join(root, 'manifest.webmanifest');
const changelogPath = path.join(root, 'CHANGELOG.md');

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, 'utf8');
}

function updateAppVersion(contents) {
  const pattern = /PUNCHBUGGY_APP_VERSION\s*=\s*['"][^'"]+['"]/;
  if (!pattern.test(contents)) {
    throw new Error('Could not find PUNCHBUGGY_APP_VERSION assignment.');
  }
  return contents.replace(pattern, `PUNCHBUGGY_APP_VERSION = '${version}'`);
}

function updateManifest(contents) {
  const pattern = /"version"\s*:\s*"[^"]+"/;
  if (!pattern.test(contents)) {
    throw new Error('Could not find manifest version.');
  }
  return contents.replace(pattern, `"version": "${version}"`);
}

function updateChangelog(contents) {
  if (contents.includes(`## [${version}]`)) {
    return contents;
  }
  const lines = contents.split('\n');
  const headerIndex = lines.findIndex((line) => line.startsWith('## ['));
  const insertIndex = headerIndex === -1 ? lines.length : headerIndex;
  const entry = [`## [${version}] - ${date}`, `- ${notes || 'TBD'}`, ''];
  lines.splice(insertIndex, 0, ...entry);
  return lines.join('\n');
}

try {
  appVersionPaths.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing app version file: ${filePath}`);
    }
    const appVersion = updateAppVersion(readFile(filePath));
    writeFile(filePath, appVersion);
  });

  const manifest = updateManifest(readFile(manifestPath));
  writeFile(manifestPath, manifest);

  const changelog = updateChangelog(readFile(changelogPath));
  writeFile(changelogPath, changelog);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

console.log(`Version bumped to ${version}`);
