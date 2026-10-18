const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const distHtml = path.join(rootDir, 'dist', 'index.html');
const electronModule = require('../node_modules/electron');

console.log('========================================================');
console.log('         PhotoshopAI - Windows Desktop Runner           ');
console.log('========================================================');
console.log('Working Directory:', rootDir);

// 1. Ensure dist bundle exists before launching production desktop window
if (!fs.existsSync(distHtml)) {
  console.log('Building production bundle for desktop app...');
  const buildProc = spawn('npm.cmd', ['run', 'build'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  buildProc.on('close', (code) => {
    if (code !== 0) {
      console.error('Build failed with code:', code);
      process.exit(code);
    }
    launchElectron();
  });
} else {
  launchElectron();
}

function launchElectron() {
  console.log('Launching PhotoshopAI Desktop Window...');
  
  // Launch electron with proper quotes around rootDir
  const child = spawn(electronModule, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error('Error starting PhotoshopAI:', err);
    process.exit(1);
  });
}
