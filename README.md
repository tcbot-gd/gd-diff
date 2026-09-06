# gd-diff

Web decompilation diff/source viewer for the Geometry Dash modding community. The server runs
IDA Pro (headless) to decompile game binaries; the browser renders assembly, pseudocode and hex
views plus cross-version diffs.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Stack

- SvelteKit 5 (runes mode) + Bun
- SQLite via `node:sqlite` (embedded, WAL mode)
- Tailwind CSS 4
- Docker / docker-compose for production

## Developing

```sh
bun install
bun run dev
```

## Build & run

```sh
bun run build
bun build/index.js
```

## Decompilation pipeline (worker)

The `worker` process polls for pending decompilations and invokes IDA Pro headless. Provide IDA
Pro and the BromaIDA plugin by mounting them into the worker container (see `compose.yaml`).

## Configuration

Copy `.env.example` to `.env` and adjust. The admin password, IDA paths and the geode-sdk
bindings repo are all configured there.

