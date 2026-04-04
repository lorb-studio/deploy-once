import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

export interface TunnelOptions {
  port: number;
  timeoutMs?: number;
}

export interface Tunnel {
  url: string;
  close: () => Promise<void>;
}

export class TunnelError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TunnelError';
  }
}

export async function startTunnel(options: TunnelOptions): Promise<Tunnel> {
  const { port, timeoutMs = 30_000 } = options;
  let proc: ChildProcess;

  try {
    proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new TunnelError(
      'Failed to start cloudflared. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
      err,
    );
  }

  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new TunnelError(`Tunnel did not produce a URL within ${timeoutMs}ms`));
    }, timeoutMs);

    const urlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(urlPattern);
      if (match) {
        clearTimeout(timer);
        proc.stderr?.off('data', onData);
        proc.stdout?.off('data', onData);
        resolve(match[0]);
      }
    };

    proc.stderr?.on('data', onData);
    proc.stdout?.on('data', onData);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new TunnelError(
        'Failed to start cloudflared. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
        err,
      ));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      reject(new TunnelError(`cloudflared exited with code ${code} before producing a URL`));
    });
  });

  return {
    url,
    close: async () => {
      if (proc.exitCode === null) {
        proc.kill('SIGTERM');
        await Promise.race([
          once(proc, 'close'),
          new Promise(r => setTimeout(r, 5000)),
        ]);
        if (proc.exitCode === null) {
          proc.kill('SIGKILL');
        }
      }
    },
  };
}
