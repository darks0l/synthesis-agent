// ── Logger ──────────────────────────────────────────────────────────
// Structured logging with module tags.

import { appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, '..', 'logs');

try { mkdirSync(logDir, { recursive: true }); } catch {}

const logFile = join(logDir, `agent-${new Date().toISOString().slice(0, 10)}.log`);

export function log(module, message, level = 'info') {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] [${module}] ${message}`;
  console.log(line);
  try { appendFileSync(logFile, line + '\n'); } catch {}
}

export function logError(module, message) {
  log(module, message, 'error');
}

export function logWarn(module, message) {
  log(module, message, 'warn');
}
