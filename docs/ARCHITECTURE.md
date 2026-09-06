# gd-diff — Architecture

A web decompilation diff/source viewer for the Geometry Dash modding community. The server
runs IDA Pro (headless) to decompile game binaries; the browser renders assembly, pseudocode,
hex and diffs without hammering the server.

## Stack

- **SvelteKit 5** (runes mode) + **Bun** runtime.
- **SQLite** via `bun:sqlite` — single embedded database for metadata, index and content.
- **Tailwind CSS 4** for styling (no config file; tokens via `@theme`).
- **CodeMirror 6** for the code readers and diff (monospace, lightweight, actively maintained).
- **Docker / docker-compose** for production (Debian). `@sveltejs/adapter-node` builds a server
  Bun can run directly.

## Directory layout

```
src/
  lib/
    shared/    pure TypeScript: domain constants + types (no svelte, no bun imports)
    server/    DB, env, repository, decompilation pipeline (bun:sqlite, node builtins)
    client/    Svelte components + helpers (CodeMirror, stores)
  routes/      SvelteKit pages + API
worker/        decomp job loop (index.ts) + the IDA export script it runs (export.py)
ida/           (gitignored) IDA Pro binaries + BromaIDA plugin, mounted into the worker
docs/          design documents
```

`src/lib/shared` must stay dependency-free so client, server and worker can all import it.

## Domain model

### Platforms

The fixed set (each has an architecture and a known set of binaries):

| id        | label                  | arch   | binaries                                                        |
| --------- | ---------------------- | ------ | --------------------------------------------------------------- |
| win       | Windows                | x64    | GeometryDash.exe (game), libcocos2d.dll (engine), libExtensions.dll (extensions), fmod.dll (audio) |
| android32 | Android (ARMv7)        | arm32  | libcocos2dcpp.so (monolith), libfmod.so (audio)                 |
| android64 | Android (ARMv8)        | arm64  | libcocos2dcpp.so (monolith), libfmod.so (audio)                 |
| imac      | macOS (Intel)          | x64    | Geometry Dash (monolith)                                        |
| m1        | macOS (Apple Silicon)  | arm64  | Geometry Dash (monolith)                                        |
| ios       | iOS                    | arm64  | Geometry Jump (monolith)                                        |

### Versions

String ids (`2.206`, `2.2071`, ...). Versions are dynamic: seeded from a known list but can be
extended by admin uploads. An explicit `ord` column keeps a stable display order (avoids
parsing ambiguity of ids like `2.2071`).

### Decompilation modes

- `raw` — pure IDA decompilation.
- `broma` — decompilation after applying geode-sdk bindings via the BromaIDA plugin.

Every `(version, platform, binary)` pair can have one decompilation per mode. Status:
`pending → running → done | failed`.

## Database schema (SQLite)

- `platforms`, `versions` — reference data.
- `binaries` — a specific file for a `(version, platform)`, with role and sha256.
- `decompilations` — one row per `(binary, mode)`; tracks status, bindings commit, error.
- `functions` — index of every function: name, demangled name, address, size, signature.
- `function_calls` — caller → callee edges (powers the xref finder).
- `member_uses` — `(function, owner_type, member_name)` (powers member xref + "used members" diff).
- `function_content` — the heavy payload as one JSON blob per function.

Content is normalized into `function_calls`/`member_uses` for indexing, and duplicated inside
the content blob for rendering/diffing. WAL mode + foreign keys are on.

## Decompilation export format

IDA headless runs an export script that emits one JSON object per function:

```jsonc
{
  "name": "PlayerObject::update(float)",
  "demangled": "PlayerObject::update(float)",
  "address": 4200064,
  "size": 8192,
  "signature": "void __cdecl PlayerObject::update(float)",
  "asm": [
    { "addr": 4200064, "bytes": "48 89 5C 24 08", "mnemonic": "mov", "operands": "[rsp+8], rbx" }
  ],
  "pseudocode": [
    { "line": 1, "text": "if (this->m_isDashing) {", "addrs": [4200064, 4200072] }
  ],
  "hex": [
    { "addr": 4200064, "bytes": "48 89 5C 24 08 57 ...", "ascii": "H.\\$..W..." }
  ],
  "calls": [
    { "addr": 4200100, "name": "PlayerObject::startDashing" }
  ],
  "members": [
    { "owner": "PlayerObject", "name": "m_isDashing", "kind": "this", "addrs": [4200064] }
  ]
}
```

The **address maps are the contract** that powers everything client-side:

- `pseudocode[i].addrs` — the addresses a pseudocode line was derived from (from Hex-Rays item
  address mapping).
- `asm[j].addr` — the address of an instruction.
- `hex[k].addr` — the address of a byte row.

Selecting a line in any view resolves to an address range, which highlights the matching lines
in the other views. Diffing compares these structured rows, not raw text.

## Pipeline

1. Admin uploads a binary → stored under `DATA_DIR/uploads/<version>/<platform>/`.
2. A `binaries` + `decompilations` row is created with status `pending`.
3. The `worker` polls for pending decompilations, spawns IDA headless
   (`idat -A -c -S"export.py" <binary>`), applies BromaIDA for `broma` mode, and dumps JSON.
4. The worker ingests JSON into SQLite (`functions`, `function_calls`, `member_uses`,
   `function_content`) and flips status to `done`.
5. Clients read through the API.

IDA Pro and the BromaIDA plugin are mounted into the worker container (admin-provided). See
`compose.yaml` for mount points and `.env.example` for paths.

## Client

### Views

- **Pseudocode** (default), **Assembly** (default), **Hex** (opt-in). All three sync on a
  shared "selected address" state via the address maps above.
- **Diff** — side-by-side + highlighted diff of assembly / pseudocode / used members / used
  functions. Enabled freely for any combination; same-platform diff is the primary case, with
  an opt-in "same arch" mode (arm↔arm etc.) that warns the result is probably poor.

### Deep linking

Every state is a URL. E.g.:

- `/` — explorer home (version × platform matrix)
- `/2.206/android64` — binaries for that version/platform
- `/2.206/android64/libcocos2dcpp.so/raw` — function list
- `/2.206/android64/libcocos2dcpp.so/raw/PlayerObject::update` — a function
- `/2.206/android64/libcocos2dcpp.so/raw/diff/2.207/android64/libcocos2dcpp.so/raw/PlayerObject::update` — a diff

Selection state (selected line/address, enabled views) is encoded in query/hash params so a
link can be shared and re-opens the exact highlight.

### Hide casts

Client-side only. Hex-Rays "hide casts" mostly removes `(Type)` cast tokens from the displayed
text; stripping them from the rendered text preserves line count and address ranges, so sync
and diff continue to work. Storing two full decompilations would double storage for no
structural benefit.

## Auth

A single admin password (`ADMIN_PASSWORD`) → signed HTTP-only cookie session. No OAuth.

## Caching & embeds

- Read API responses are immutable per decompilation; served with `Cache-Control: public,
  max-age=..., immutable` where safe. Function content is versioned by address so it can be
  cached aggressively.
- OpenGraph/Twitter cards are rendered server-side per function/diff page for Discord embeds.

## Roadmap

- **Phase 0** — foundation (this doc + infra + domain model + DB + read API + shell).
- **Phase 1** — decompilation pipeline (IDA export script, worker, ingestion, upload API).
- **Phase 2** — function view (synced pseudocode/asm/hex), diff viewer.
- **Phase 3** — xref finder, search, caching/embeds, admin UI, polish.

