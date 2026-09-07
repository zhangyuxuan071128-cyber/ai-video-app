#!/usr/bin/env node

const target = process.argv[2];
const timeoutMs = Number(process.argv[3] ?? '600000');
const intervalMs = Number(process.argv[4] ?? '1000');
const requestTimeoutMs = 5_000;

if (!target) {
  console.error('Usage: node scripts/wait-for-service.mjs <http-url> [timeout-ms] [interval-ms]');
  process.exit(2);
}

let targetUrl;
try {
  targetUrl = new URL(target);
} catch {
  console.error(`[wait-for-service] Invalid URL: ${target}`);
  process.exit(2);
}

if (!['http:', 'https:'].includes(targetUrl.protocol)) {
  console.error(`[wait-for-service] Unsupported protocol: ${targetUrl.protocol}`);
  process.exit(2);
}

if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(intervalMs) || intervalMs <= 0) {
  console.error('[wait-for-service] Timeout and interval must be positive integers.');
  process.exit(2);
}

let cancelled = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => {
    cancelled = true;
    console.error(`[wait-for-service] Received ${signal}; stopping.`);
    process.exit(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 129);
  });
}

const startedAt = Date.now();
let lastLogAt = 0;
let lastError = 'service has not responded yet';

const delay = (durationMs) => new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs));

while (!cancelled && Date.now() - startedAt < timeoutMs) {
  const controller = new AbortController();
  const requestTimer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });

    if (response.ok) {
      await response.body?.cancel();
      clearTimeout(requestTimer);
      console.log(`[wait-for-service] Ready: ${targetUrl.href} (${response.status}).`);
      process.exit(0);
    }

    lastError = `HTTP ${response.status}`;
    await response.body?.cancel();
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(requestTimer);
  }

  const now = Date.now();
  if (now - lastLogAt >= 10_000) {
    console.log(`[wait-for-service] Waiting for ${targetUrl.href}: ${lastError}`);
    lastLogAt = now;
  }

  await delay(intervalMs);
}

console.error(`[wait-for-service] Timed out after ${timeoutMs}ms waiting for ${targetUrl.href}: ${lastError}`);
process.exit(1);
