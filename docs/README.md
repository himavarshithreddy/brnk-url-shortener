# BRNK Documentation Hub

This folder contains complete project documentation for both technical and non-technical audiences.

## Who should read what?

- **Founders, marketers, support, and non-engineering contributors**
  - Start with [`non-technical-guide.md`](./non-technical-guide.md)
- **Developers and technical reviewers**
  - Start with [`technical-architecture.md`](./technical-architecture.md)
  - Then review [`api-reference.md`](./api-reference.md)
  - Use [`security-and-abuse-prevention.md`](./security-and-abuse-prevention.md) for abuse controls and hardening

## Documentation Map

1. [`non-technical-guide.md`](./non-technical-guide.md)
   - Product purpose, user journey, feature explanation, use cases, and operational language for non-engineers.
2. [`technical-architecture.md`](./technical-architecture.md)
   - System architecture, codebase layout, core backend/frontend flows, and data model behavior.
3. [`api-reference.md`](./api-reference.md)
   - HTTP endpoints, request/response behavior, status codes, and practical examples.
4. [`security-and-abuse-prevention.md`](./security-and-abuse-prevention.md)
   - Threat model, middleware protections, killswitch behavior, and security best practices.

## Required technical coverage checklist

The docs in this folder explicitly cover:

- **APIs**: [`api-reference.md`](./api-reference.md) (endpoints, request/response contracts, rate limits, idempotency)
- **Frontend**: [`technical-architecture.md`](./technical-architecture.md) (frontend architecture, interstitial warning page, redirect flow)
- **Backend**: [`technical-architecture.md`](./technical-architecture.md) + [`security-and-abuse-prevention.md`](./security-and-abuse-prevention.md)
- **Architecture**: [`technical-architecture.md`](./technical-architecture.md) (repository structure, caching, batching, code generation)
- **Techniques used**: [`technical-architecture.md`](./technical-architecture.md) (performance, caching, abuse controls, click batching)
- **Database**: [`technical-architecture.md`](./technical-architecture.md) (Redis key schema, payload structures, TTL strategy)
- **Scheme** (schema/key structure): [`technical-architecture.md`](./technical-architecture.md) (exact key names: `l:`, `clicks:`, `u:`)
- **Short code generation**: [`technical-architecture.md`](./technical-architecture.md) (nanoid algorithm, alphabet, pool, collision retry)
- **Caching strategy**: [`technical-architecture.md`](./technical-architecture.md) (L1/L2, TTLs, eviction, serverless considerations)
- **Click analytics**: [`technical-architecture.md`](./technical-architecture.md) (batching, fire-and-forget, separate counter key)
- **Rate limiting**: [`technical-architecture.md`](./technical-architecture.md) + [`security-and-abuse-prevention.md`](./security-and-abuse-prevention.md) (all dimensions documented)
- **Security layers**: [`security-and-abuse-prevention.md`](./security-and-abuse-prevention.md) (trust scoring, open redirect mitigation, QR phishing, rate limiting)
- **Feature list**: [`non-technical-guide.md`](./non-technical-guide.md) + root [`README.md`](../README.md)
- **Complete technical implementation details**: [`technical-architecture.md`](./technical-architecture.md), [`api-reference.md`](./api-reference.md), and [`security-and-abuse-prevention.md`](./security-and-abuse-prevention.md)

## Source of truth

The implementation in `/backend` and `/frontend` is the source of truth.
When code changes, update this `docs/` folder to keep user-facing and engineering documentation in sync.
