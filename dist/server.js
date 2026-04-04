import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.webp': 'image/webp',
};
export async function createOneShotServer(options) {
    const sitePath = resolve(options.path);
    const siteInfo = await stat(sitePath);
    let rootDir;
    let indexFile = null;
    if (siteInfo.isDirectory()) {
        rootDir = sitePath;
        const files = await readdir(sitePath);
        if (files.includes('index.html')) {
            indexFile = 'index.html';
        }
    }
    else if (siteInfo.isFile()) {
        rootDir = join(sitePath, '..');
        indexFile = sitePath;
    }
    else {
        throw new Error(`Invalid path: ${sitePath}`);
    }
    const events = new EventEmitter();
    let visited = false;
    const server = createServer(async (req, res) => {
        if (visited) {
            res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body><h1>410 Gone</h1><p>This site has self-destructed.</p></body></html>');
            return;
        }
        const urlPath = new URL(req.url ?? '/', `http://localhost`).pathname;
        const safePath = urlPath.replace(/\.\./g, '');
        let filePath;
        if (safePath === '/' || safePath === '') {
            if (indexFile) {
                filePath = typeof indexFile === 'string' && indexFile.startsWith('/')
                    ? indexFile
                    : join(rootDir, indexFile ?? 'index.html');
            }
            else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not found');
                return;
            }
        }
        else {
            filePath = join(rootDir, safePath);
        }
        if (!filePath.startsWith(rootDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }
        try {
            const content = await readFile(filePath);
            const ext = extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
            const isHtmlRequest = safePath === '/' || safePath === '' || ext === '.html';
            if (isHtmlRequest) {
                visited = true;
                events.emit('visited', { time: new Date(), ip: req.socket.remoteAddress });
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
        catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
        }
    });
    const port = options.port ?? 0;
    const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    return new Promise((resolvePromise, reject) => {
        server.on('error', reject);
        server.listen(port, '0.0.0.0', () => {
            const addr = server.address();
            if (!addr || typeof addr === 'string') {
                reject(new Error('Failed to get server address'));
                return;
            }
            const actualPort = addr.port;
            const url = `http://localhost:${actualPort}`;
            let closed = false;
            const closeServer = () => {
                if (closed)
                    return Promise.resolve();
                closed = true;
                return new Promise((res, rej) => {
                    server.close((err) => err ? rej(err) : res());
                });
            };
            let resolveDone;
            const done = new Promise((res) => { resolveDone = res; });
            // TTL timer — shut down even if never visited
            const ttlTimer = setTimeout(async () => {
                if (!visited) {
                    events.emit('expired', { ttlMs });
                    await closeServer();
                    resolveDone('ttl');
                }
            }, ttlMs);
            // On visit — shut down after response is sent
            events.on('visited', async () => {
                clearTimeout(ttlTimer);
                // Small delay to ensure the response finishes writing
                setTimeout(async () => {
                    await closeServer();
                    resolveDone('visited');
                }, 500);
            });
            resolvePromise({
                url,
                port: actualPort,
                events,
                close: async () => {
                    clearTimeout(ttlTimer);
                    await closeServer();
                },
                done,
            });
        });
    });
}
