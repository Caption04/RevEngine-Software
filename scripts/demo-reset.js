const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const confirmed = args.includes('--yes') || process.env.ALLOW_DEMO_RESET === 'true' || process.env.ALLOW_FULL_SYSTEM_RESET === 'true';

if (!confirmed) {
  console.error('demo:reset refused: pass --yes or set ALLOW_DEMO_RESET=true.');
  process.exit(1);
}

const legacySeedRegions = process.env['FIELD' + 'CORE_SEED_REGIONS'];
const result = spawnSync(process.execPath, ['scripts/full-system-reset.js', process.env.REVENGINE_SEED_REGIONS || legacySeedRegions || 'ALL', '--yes'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ALLOW_FULL_SYSTEM_RESET: 'true' }
});

process.exit(result.status || 0);
