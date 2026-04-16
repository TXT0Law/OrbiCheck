# Boundary Validation

## Purpose

Every data shape crossing a system boundary MUST be parsed and validated
before entering business logic. "Parse, don't validate" at the edge.

## Scope

All integration points: REST API requests/responses, SSE payloads,
Celery task arguments, Scan Service results, and WebSocket messages.

## Allowed

1. **API endpoints** — Pydantic `BaseModel` for request body and response; FastAPI auto-validates.
2. **Frontend API client** — Zod schema `.parse()` on every response in `lib/api/*.ts`.
3. **SSE payloads** — parse with Zod schema in `lib/hooks/use-sse.ts` before dispatching to store.
4. **Scan results** — `backend/app/services/transformers.py` validates raw JSON shape before transform.
5. **Celery tasks** — task arguments typed with Pydantic; deserialize at task entry.
6. **URL input** — validate with `lib/utils/url-validator.ts` (frontend) and `backend/app/utils/url_parser.py` (backend).
7. **Environment variables** — validate at startup via `backend/app/core/config.py`; crash early if missing.

## Forbidden

1. Accessing `response.data` without schema validation in frontend API layer.
2. Passing raw `dict` / `any` from Scan Service into `transformers.py` without shape check.
3. Trusting SSE `event.data` as pre-validated — always parse first.
4. Using `type: any` or `# type: ignore` to bypass a boundary type.
5. Accepting Celery task args as untyped `*args, **kwargs`.

## Commands

```bash
# Frontend type safety
pnpm build                # tsc strict mode catches untyped boundaries

# Backend type + lint
make lint-backend         # ruff catches type annotation gaps

# Run tests that exercise boundary parsing
make test-backend-unit    # transformers + validators
make test-frontend        # API client mocks verify schema parse
```

## Verification

1. Every new API endpoint has a Pydantic request/response model.
2. Every new `lib/api/*.ts` function calls `.parse()` or `.safeParse()` on the response.
3. Every new SSE event type has a corresponding Zod schema in `shared/schemas/`.
4. `grep -r "as any" lib/ app/ components/` returns no new matches in the diff.
5. `pnpm build` and `make lint` exit 0.

## References

- [shared/schemas/scan.ts](../../shared/schemas/scan.ts) — scan Zod schemas
- [shared/schemas/monitor.ts](../../shared/schemas/monitor.ts) — monitor Zod schemas
- [backend/app/services/transformers.py](../../backend/app/services/transformers.py) — server-side transform
- [AGENTS.md](../../AGENTS.md) — global rules
