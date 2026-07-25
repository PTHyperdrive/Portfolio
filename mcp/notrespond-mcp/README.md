# notrespond-mcp

Read-only MCP server exposing NotRespond infrastructure knowledge and live
status to a local MCP client (Claude Code, Claude Desktop).

## Why this exists separately from the HTTP surface

There are two MCP surfaces and they are deliberately not the same server:

| | stdio (this) | HTTP (`/api/ai/mcp`) |
|---|---|---|
| Consumer | operator's local MCP client | platform chat users |
| Auth | possession of the host + DB credentials | signed-in session |
| Role | `ADMIN` | the caller's real role |
| Tools | full read-only set | tenant-safe subset |

Splitting them means the privilege difference is enforced by *which process
you can reach*, not by a conditional inside one handler. A bug in the HTTP
gate cannot expose the operator toolset, because that toolset is not served
by that process.

## What it cannot do

No tool mutates anything. `proxmox.ts` exports `startVM`, `stopVM` and
`restartVM`; none are imported here, so no amount of prompt injection can
reach them — the capability is absent rather than guarded.

No tool accepts a URL, hostname, path or command. Arguments are ids, slugs
and free-text queries only, so this cannot be turned into an SSRF or command
execution primitive.

Results pass through the same redaction and untrusted-data framing as the
in-chat tools (`src/lib/ai-security.ts`).

## Setup

Runs against the project's database, so it needs the same `DATABASE_URL`.

```bash
node mcp/notrespond-mcp/server.mjs
```

Register it with Claude Code from the repository root:

```bash
claude mcp add notrespond -- node ./mcp/notrespond-mcp/server.mjs
```

## Tools

| Tool | Purpose |
|---|---|
| `search_infrastructure_docs` | Semantic search over the knowledge base |
| `list_infrastructure_docs` | Enumerate available documents |
| `get_infrastructure_doc` | Read one document by slug |
| `get_ai_node_status` | Inference node health |
| `get_hypervisor_status` | Proxmox node and VM states |
| `get_platform_summary` | Aggregate counts, no personal data |
