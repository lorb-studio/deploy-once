# otd — Build Chain

spec: knowledge/products/otd/spec.md

## Tasks

- [x] Scaffold: package.json (@lorb/otd), tsconfig.json, ESM setup, bin entry
- [x] Core: local HTTP server with one-shot middleware (serve once → 410 Gone)
- [x] Tunneling: Cloudflare Quick Tunnel integration (trycloudflare.com URL)
- [x] CLI: argument parsing (path, --ttl, --message), validation, clean output
- [x] TTL: auto-expiry timer, graceful shutdown on visit or timeout
- [x] Tests: unit tests for one-shot middleware, TTL logic, argument parsing
- [x] Build: tsc compile, verify bin works via npx, bundle size check (< 5MB)
