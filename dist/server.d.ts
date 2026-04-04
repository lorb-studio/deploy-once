import { EventEmitter } from 'node:events';
export interface OneShotServerOptions {
    path: string;
    port?: number;
    ttlMs?: number;
}
export interface OneShotServer {
    url: string;
    port: number;
    events: EventEmitter;
    close: () => Promise<void>;
    /** Resolves when the server shuts down (visit or TTL expiry). 'visited' | 'ttl' */
    done: Promise<'visited' | 'ttl'>;
}
export declare function createOneShotServer(options: OneShotServerOptions): Promise<OneShotServer>;
