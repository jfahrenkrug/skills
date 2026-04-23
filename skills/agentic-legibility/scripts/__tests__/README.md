# Tests

This directory contains unit and integration tests for the agentic-legibility
scripts. The tests use Node's built-in `node:test` runner — no npm dependencies
are required.

## Running

From `skills/agentic-legibility/`:

       npm test

Or directly:

       node --test scripts/__tests__/

## Layout

- `*.test.js` — test files, discovered automatically by `node --test`.
- `helpers/` — shared fixtures and utilities used by more than one test file.

## Conventions

- Each test file targets one module (unit) or one CLI subcommand (integration).
- Unit tests exercise pure functions with synthetic input and strict-equality
  assertions.
- Integration tests build a temporary fixture repo under `os.tmpdir()`, invoke
  the real CLI via `child_process`, parse the JSON output, and assert on it.
- Every fixture is cleaned up after its test completes.
- New checks must land with at least one unit test and one integration test.
