const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pluginDir = path.join(rootDir, 'acode-plugin');
const webviewBundleDir = path.join(rootDir, 'out', 'webview-bundle');
const targetBundleDir = path.join(pluginDir, 'webview-bundle');

console.log('Building webview for Acode plugin...');
try {
  // First ensure we have the latest webview built
  execSync('npm run build:webview', { stdio: 'inherit', cwd: rootDir });
} catch (e) {
  console.log('Fallback: webview build via VS Code build script failed. Using pnpm directly.');
  execSync('pnpm build', { stdio: 'inherit', cwd: path.join(rootDir, 'webview-ui') });
}

console.log('Copying webview assets to acode-plugin directory...');
if (!fs.existsSync(targetBundleDir)) {
  fs.mkdirSync(targetBundleDir, { recursive: true });
}

// Copy the bundle files
['index.html', 'index.css', 'index.js'].forEach(file => {
  const src = path.join(webviewBundleDir, file);
  const dest = path.join(targetBundleDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file}`);
  } else {
    console.warn(`Warning: Expected asset ${file} not found in ${webviewBundleDir}`);
  }
});

console.log('Packaging plugin...');
const zipFile = path.join(rootDir, 'intent_router.zip');
try {
  if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
  }
  // Run zip command inside acode-plugin directory
  execSync(`zip -r ../intent_router.zip main.js plugin.json README.md icon.png webview-bundle/`, { cwd: pluginDir, stdio: 'inherit' });
  console.log(`Plugin packaged successfully to ${zipFile}`);
} catch(e) {
  console.error('Failed to create zip archive.', e.message);
}
