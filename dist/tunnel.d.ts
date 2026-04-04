export interface TunnelOptions {
    port: number;
    timeoutMs?: number;
}
export interface Tunnel {
    url: string;
    close: () => Promise<void>;
}
export declare class TunnelError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
export declare function startTunnel(options: TunnelOptions): Promise<Tunnel>;
