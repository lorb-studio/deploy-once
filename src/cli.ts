#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOneShotServer } from './server.js';
import { startTunnel, TunnelError } from './tunnel.js';

interface CliOptions {
  path: string;
  ttl: string;
  message: string | undefined;
  local: boolean;
  help: boolean;
}

const HELP_TEXT = `deploy-once — deploy a site that serves once and self-destructs

Usage: deploy-once <path> [options]

Arguments:
  path              File or directory to serve (e.g. ./dist, index.html)

Options:
  --ttl <duration>  Auto-expire after duration (default: 24h)
                    Examples: 30m, 1h, 6h, 24h
  --message <text>  Message to display in terminal on visit
  --local           Skip tunnel, serve on localhost only
  -h, --help        Show this help

Examples:
  deploy-once ./dist
  deploy-once index.html --ttl 1h
  deploy-once ./build --ttl 30m --message "Preview ready"
`;

const TTL_PATTERN = /^(\d+)(m|h)$/;

export function parseTtl(input: string): number {
  const match = input.match(TTL_PATTERN);
  if (!match) {
    throw new Error(`Invalid TTL format: "${input}". Use e.g. 30m, 1h, 24h`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (value <= 0) {
    throw new Error(`TTL must be positive: "${input}"`);
  }
  const ms = unit === 'h' ? value * 60 * 60 * 1000 : value * 60 * 1000;
  return ms;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      ttl: { type: 'string', default: '24h' },
      message: { type: 'string' },
      local: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    return { path: '', ttl: '24h', message: undefined, local: false, help: true };
  }

  if (positionals.length === 0) {
    throw new Error('Missing required argument: <path>\nRun `deploy-once --help` for usage.');
  }

  if (positionals.length > 1) {
    throw new Error(`Unexpected arguments: ${positionals.slice(1).join(', ')}\nRun \`deploy-once --help\` for usage.`);
  }

  // Validate TTL format early
  parseTtl(values.ttl!);

  return {
    path: positionals[0],
    ttl: values.ttl!,
    message: values.message,
    local: values.local ?? false,
    help: false,
  };
}

async function validatePath(inputPath: string): Promise<string> {
  const resolved = resolve(inputPath);
  try {
    const info = await stat(resolved);
    if (!info.isFile() && !info.isDirectory()) {
      throw new Error(`Not a file or directory: ${resolved}`);
    }
    if (info.isFile() && !resolved.endsWith('.html')) {
      throw new Error(`File must be .html: ${resolved}`);
    }
    return resolved;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Path not found: ${resolved}`);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  let options: CliOptions;

  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  try {
    await validatePath(options.path);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  const ttlMs = parseTtl(options.ttl);

  // Start local server with one-shot middleware + TTL
  const server = await createOneShotServer({
    path: options.path,
    ttlMs,
  });

  let tunnel: { url: string; close: () => Promise<void> } | undefined;

  if (options.local) {
    console.log(`http://localhost:${server.port}`);
  } else {
    try {
      console.error(`Starting tunnel...`);
      tunnel = await startTunnel({ port: server.port });
      console.log(tunnel.url);
    } catch (err) {
      await server.close();
      if (err instanceof TunnelError) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
  }

  if (options.message) {
    console.error(`Message: ${options.message}`);
  }
  console.error(`Waiting for visit (TTL: ${options.ttl})...`);

  // Listen for visit event
  server.events.on('visited', (info: { time: Date; ip: string | undefined }) => {
    console.error(`\nVisited at ${info.time.toISOString()}${info.ip ? ` from ${info.ip}` : ''}`);
    if (options.message) {
      console.error(options.message);
    }
  });

  // Listen for TTL expiry
  server.events.on('expired', () => {
    console.error(`\nTTL expired (${options.ttl}). No one visited.`);
  });

  // Wait for shutdown (visit or TTL)
  const reason = await server.done;
  if (tunnel) await tunnel.close();

  console.error(`Done. Site destroyed.`);
  process.exit(0);
}

// Only skip when imported by test runner (vitest sets this)
const isTestImport = process.env['VITEST'] !== undefined;
if (!isTestImport) {
  main();
}
