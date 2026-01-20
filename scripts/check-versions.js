#!/usr/bin/env node
// Quick version checker for PunchBuggy
// Usage: node scripts/check-versions.js

const fs = require('fs');
const path = require('path');

function readFile(p){
  try{ return fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8'); }catch(e){ return null; }
}

const files = {
  appVersionCandidates: ['public/app-version.js', 'app-version.js', 'src/app-version.js'],
  manifest: 'public/manifest.webmanifest',
  changelog: 'CHANGELOG.md',
};

const output = {};

// app-version.js
let appJs = null;
for(const candidate of files.appVersionCandidates){
  appJs = readFile(candidate);
  if(appJs) break;
}
if(appJs){
  const m = appJs.match(/PUNCHBUGGY_APP_VERSION\s*=\s*['"]([^'\"]+)/);
  output.appVersion = m ? m[1] : null;
} else output.appVersion = null;

// manifest
const manifestText = readFile(files.manifest);
if(manifestText){
  try{
    const manifest = JSON.parse(manifestText);
    output.manifestVersion = manifest.version || null;
  }catch(e){ output.manifestVersion = null; }
} else output.manifestVersion = null;

// changelog: find first heading like ## [x.y.z]
const changelog = readFile(files.changelog);
if(changelog){
  const m = changelog.match(/^## \[([^\]]+)\]/m);
  output.changelogLatest = m ? m[1] : null;
} else output.changelogLatest = null;

console.log('Version audit — PunchBuggy');
console.log('------------------------------------');
console.log('app-version.js:', output.appVersion || 'MISSING');
console.log('manifest.webmanifest:', output.manifestVersion || 'MISSING');
console.log('CHANGELOG.md latest entry:', output.changelogLatest || 'MISSING');
console.log('------------------------------------');

const versions = [output.appVersion, output.manifestVersion, output.changelogLatest].filter(Boolean);
const unique = Array.from(new Set(versions));
if(unique.length <= 1){
  console.log('OK: versions are consistent.');
  process.exit(0);
} else {
  console.log('WARN: version mismatch detected:');
  const map = {
    appVersion: output.appVersion,
    manifest: output.manifestVersion,
    changelog: output.changelogLatest,
  };
  Object.keys(map).forEach(k=>console.log(`  ${k}: ${map[k] || 'MISSING'}`));
  process.exit(2);
}
