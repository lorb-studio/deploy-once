import { describe, test, expect } from 'vitest';
import { parseTtl, parseCliArgs } from './cli.js';

describe('parseTtl', () => {
  test('parses minutes', () => {
    expect(parseTtl('30m')).toBe(30 * 60 * 1000);
    expect(parseTtl('1m')).toBe(60 * 1000);
  });

  test('parses hours', () => {
    expect(parseTtl('1h')).toBe(60 * 60 * 1000);
    expect(parseTtl('24h')).toBe(24 * 60 * 60 * 1000);
  });

  test('rejects invalid formats', () => {
    expect(() => parseTtl('abc')).toThrow('Invalid TTL format');
    expect(() => parseTtl('10s')).toThrow('Invalid TTL format');
    expect(() => parseTtl('1d')).toThrow('Invalid TTL format');
    expect(() => parseTtl('')).toThrow('Invalid TTL format');
    expect(() => parseTtl('h')).toThrow('Invalid TTL format');
  });

  test('rejects zero', () => {
    expect(() => parseTtl('0m')).toThrow('TTL must be positive');
    expect(() => parseTtl('0h')).toThrow('TTL must be positive');
  });
});

describe('parseCliArgs', () => {
  test('parses path only', () => {
    const opts = parseCliArgs(['./dist']);
    expect(opts.path).toBe('./dist');
    expect(opts.ttl).toBe('24h');
    expect(opts.message).toBeUndefined();
    expect(opts.help).toBe(false);
  });

  test('parses all options', () => {
    const opts = parseCliArgs(['./dist', '--ttl', '1h', '--message', 'Preview ready']);
    expect(opts.path).toBe('./dist');
    expect(opts.ttl).toBe('1h');
    expect(opts.message).toBe('Preview ready');
  });

  test('parses help flag', () => {
    const opts = parseCliArgs(['--help']);
    expect(opts.help).toBe(true);
  });

  test('parses short help flag', () => {
    const opts = parseCliArgs(['-h']);
    expect(opts.help).toBe(true);
  });

  test('throws on missing path', () => {
    expect(() => parseCliArgs([])).toThrow('Missing required argument');
  });

  test('throws on multiple positionals', () => {
    expect(() => parseCliArgs(['./dist', './other'])).toThrow('Unexpected arguments');
  });

  test('throws on invalid ttl', () => {
    expect(() => parseCliArgs(['./dist', '--ttl', 'bad'])).toThrow('Invalid TTL format');
  });
});
