#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

const archiver = require('archiver');

const REPO_ROOT = process.cwd();
const PROJECT_DIR = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function zipDirectory({ srcDir, zipPath, folderInZip, exclude, fileOverrides }) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const finish = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);

  archive.directory(srcDir, folderInZip, (entry) => {
    const relWithRoot = entry.name.replace(/\\/g, '/');
    const rootPrefix = `${folderInZip}/`;
    const rel = relWithRoot.startsWith(rootPrefix)
      ? relWithRoot.slice(rootPrefix.length)
      : relWithRoot;
    if (exclude && exclude.some((re) => re.test(rel))) return false;
    if (fileOverrides && fileOverrides[rel]) return false;
    return entry;
  });

  // Add overridden files (e.g. stamped module.json)
  if (fileOverrides) {
    for (const [rel, content] of Object.entries(fileOverrides)) {
      archive.append(content, { name: `${folderInZip}/${rel}` });
    }
  }

  await archive.finalize();
  await finish;
}

async function main() {
  const args = parseArgs(process.argv);

  // By default, treat the foundry-project-point-tracker project directory as the
  // module root (module.json lives alongside lang/, scripts/, styles/, templates/).
  // This supports both:
  // - Standalone repo: run `node tools/build_foundry_release.js` from anywhere
  // - Monorepo: run `node foundry-project-point-tracker/tools/build_foundry_release.js` from repo root
  const moduleDir = args.module
    ? path.resolve(REPO_ROOT, args.module)
    : PROJECT_DIR;
  const moduleJsonPath = path.join(moduleDir, 'module.json');

  if (!fs.existsSync(moduleJsonPath)) {
    console.error(`Missing module.json at: ${moduleJsonPath}`);
    process.exit(2);
  }

  const mod = readJson(moduleJsonPath);

  const version = args.version || mod.version;
  if (!version) {
    console.error('module.json is missing a version field (or pass --version).');
    process.exit(2);
  }

  const moduleId = mod.id || 'ds-project-tracker';
  const tag = args.tag || `v${version}`;
  const zipBaseName = args.zip || `${moduleId}-v${version}.zip`;

  // dist lives at the project level.
  // If building from an overridden moduleDir, keep dist next to moduleDir.
  const distDir = path.join(args.module ? path.dirname(moduleDir) : PROJECT_DIR, 'dist');
  const zipOutPath = path.join(distDir, zipBaseName);
  const manifestOutPath = path.join(distDir, 'module.json');

  // Derive the release repo from the existing manifest/url fields in module.json
  // so we don't override the correct repo with a hardcoded default.
  // Falls back to --repo arg or the module's url field.
  const repoFromUrl = (mod.url || '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/$/, '');
  const repo = args.repo || repoFromUrl || 'bruceamoser/draw-steel-downtime-project-tracker';

  // Update manifest and download URLs, stamping the current version into the
  // download path while preserving the correct repo.
  const manifestUrl = `https://github.com/${repo}/releases/latest/download/module.json`;
  const downloadUrl = `https://github.com/${repo}/releases/download/${tag}/${zipBaseName}`;
  const projectUrl = `https://github.com/${repo}`;

  // Ensure the manifest fields are present in the emitted manifest.
  const emitted = {
    ...mod,
    version,
    url: mod.url || projectUrl,
    manifest: manifestUrl,
    download: downloadUrl,
  };

  writeJson(manifestOutPath, emitted);

  // Build zip that contains the module folder at root.
  // The folder inside the zip MUST match the Foundry module ID, not the local
  // disk folder name, so that Foundry installs it into the correct path.
  // Exclude non-module artifacts when zipping from module root.
  const exclude = [
    /^\.DS_Store$/,
    /(^|\/)dist(\/|$)/,
    /(^|\/)tools(\/|$)/,
    /(^|\/)node_modules(\/|$)/,
    /(^|\/)\.git(\/|$)/,
    /(^|\/)\.github(\/|$)/,
    /^README\.md$/,
    /^package\.json$/,
    /^package-lock\.json$/,
  ];

  await zipDirectory({
    srcDir: moduleDir,
    zipPath: zipOutPath,
    folderInZip: moduleId,
    exclude,
    fileOverrides: {
      'module.json': JSON.stringify(emitted, null, 2) + '\n',
    },
  });

  console.log(`Wrote manifest: ${path.relative(REPO_ROOT, manifestOutPath)}`);
  console.log(`Wrote zip: ${path.relative(REPO_ROOT, zipOutPath)}`);
  console.log('Upload BOTH files to the GitHub Release assets.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
