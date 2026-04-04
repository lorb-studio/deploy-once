#!/usr/bin/env node
interface CliOptions {
    path: string;
    ttl: string;
    message: string | undefined;
    local: boolean;
    help: boolean;
}
export declare function parseTtl(input: string): number;
export declare function parseCliArgs(argv: string[]): CliOptions;
export {};
