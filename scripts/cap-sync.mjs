import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicApk = path.join(root, 'public', 'HydroSync-App.apk');
const tempDir = path.join(root, '.tmp');
const tempApk = path.join(tempDir, 'HydroSync-App.apk');
const distApk = path.join(root, 'dist', 'HydroSync-App.apk');
const embeddedApk = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'public',
  'HydroSync-App.apk'
);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

let moved = false;

try {
  // If a previous sync copied the downloadable APK into the native assets,
  // delete it so it can't be bundled into the Android APK.
  if (fs.existsSync(embeddedApk)) fs.rmSync(embeddedApk);
  if (fs.existsSync(distApk)) fs.rmSync(distApk);

  if (fs.existsSync(publicApk)) {
    fs.mkdirSync(tempDir, { recursive: true });
    if (fs.existsSync(tempApk)) fs.rmSync(tempApk);
    fs.renameSync(publicApk, tempApk);
    moved = true;
  }

  // Build the web bundle while the APK is temporarily removed,
  // so it doesn't get copied into dist/ and then into Android assets.
  await run('npm', ['run', 'build']);

  // Prevent bundling the downloadable APK into the native app.
  await run('npx', ['cap', 'sync']);
} finally {
  // Ensure it wasn't re-created by any step.
  if (fs.existsSync(embeddedApk)) fs.rmSync(embeddedApk);
  if (fs.existsSync(distApk)) fs.rmSync(distApk);

  if (moved) {
    if (fs.existsSync(publicApk)) fs.rmSync(publicApk);
    fs.renameSync(tempApk, publicApk);
  }
}

