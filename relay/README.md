# Claude Code relay

Drive Claude Code sessions running on your own machines from the admin panel.

```
browser ──wss──▶ nrsp-web ──wss──┬── agent "vm-dev"      ──▶ pty ──▶ claude
                   (hub)         ├── agent "workstation" ──▶ pty ──▶ claude
                                 └── agent "mac-mini"    ──▶ pty ──▶ claude
```

Agents dial **out**. Nothing listens on those machines, no inbound firewall rule
is needed, and it works behind NAT or WireGuard.

## What this is, and what it is not

Claude Code runs on your machine, authenticated as you, under your own
subscription — exactly as if you were sitting at it. The browser is a remote
screen, the same idea as SSH or tmux. No credential crosses the wire.

Do not expose it to the platform's tenants. Console sockets are admin-only and
should stay that way: the moment other people's requests reach that terminal, it
is no longer you using your own tools.

## Server setup

Two environment variables on `nrsp-web`:

| Variable | Purpose |
|---|---|
| `RELAY_AGENT_TOKEN` | Shared secret every agent presents. `openssl rand -hex 32` |
| `RELAY_TICKET_SECRET` | Signs browser tickets. Optional — falls back to `AUTH_SECRET` |

Then `pm2 restart nrsp-web --update-env`.

## Running an agent

One per machine. Give each a distinct `RELAY_AGENT_NAME` and they appear
together in the panel for you to switch between; reconnecting under a name
replaces that entry rather than adding a duplicate.

### Linux / macOS

```bash
cd relay/agent
npm install

export RELAY_URL=wss://www.notrespond.com/api/relay/agent
export RELAY_AGENT_TOKEN=...          # same value as the server
export RELAY_AGENT_NAME=vm-dev        # how it appears in the picker
node claude-relay.mjs
```

### Windows (PowerShell)

```powershell
cd relay\agent
npm install

$env:RELAY_URL         = "wss://www.notrespond.com/api/relay/agent"
$env:RELAY_AGENT_TOKEN = "..."
$env:RELAY_AGENT_NAME  = "workstation"
node claude-relay.mjs
```

`VAR=value command` is bash syntax and does nothing in PowerShell — use
`$env:VAR = "value"` as above.

## Terminal quality by platform

`node-pty` is a native module and optional, but what happens without it differs:

| Platform | With node-pty | Without |
|---|---|---|
| Linux | full pty, resizable | `script(1)` — real pty, fixed 80×24 |
| macOS | full pty, resizable | `script` — real pty, fixed 80×24 |
| Windows | ConPTY, resizable | plain pipes — poor line editing and colour |

There is no `script(1)` on Windows, so node-pty matters most there. Build
prerequisites:

- Linux: `sudo apt install -y build-essential python3`
- macOS: `xcode-select --install`
- Windows: Visual Studio Build Tools (C++ workload)

The panel shows which one an agent ended up using, so you are never guessing.

## When `claude` is not found

The most common failure, and it is a PATH problem rather than a relay problem: a
service or non-login shell has a narrower PATH than your interactive terminal.

The agent checks before connecting, and if the command is missing it **still
connects** and reports it in the browser — a red `NO CLAUDE` badge on that
machine — rather than opening a terminal that instantly dies.

Fixes, in order of preference:

```bash
# 1. Point at the binary directly
RELAY_COMMAND=/usr/local/bin/claude node claude-relay.mjs

# Windows equivalent
$env:RELAY_COMMAND = "C:\Users\you\AppData\Roaming\npm\claude.cmd"

# 2. Get a shell instead, to go and find the path
RELAY_SHELL=1 node claude-relay.mjs        # then: which claude
```

## Options

| Variable | Default | Meaning |
|---|---|---|
| `RELAY_URL` | — | `wss://host/api/relay/agent`. Required |
| `RELAY_AGENT_TOKEN` | — | Shared secret. Required |
| `RELAY_AGENT_NAME` | hostname | Name shown in the picker |
| `RELAY_COMMAND` | `claude` | What to run; use a full path if PATH is thin |
| `RELAY_CWD` | `$HOME` / `%USERPROFILE%` | Working directory |
| `RELAY_SHELL` | — | `1` for a plain shell (`bash`, or `powershell.exe`) |

## Running it as a service

### systemd (Linux)

```ini
# /etc/systemd/system/claude-relay.service
[Unit]
Description=Claude Code relay agent
After=network-online.target

[Service]
User=youruser
WorkingDirectory=/home/youruser/relay/agent
Environment=RELAY_URL=wss://www.notrespond.com/api/relay/agent
Environment=RELAY_AGENT_TOKEN=...
Environment=RELAY_AGENT_NAME=vm-dev
# systemd units get a minimal PATH — give the full path rather than hoping.
Environment=RELAY_COMMAND=/usr/local/bin/claude
ExecStart=/usr/bin/node claude-relay.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Windows

Simplest is a Scheduled Task set to "Run whether user is logged on or not",
action `node`, arguments `claude-relay.mjs`, started in `relay\agent`, with the
variables set in the task's environment. `nssm` works too if you prefer a
service.

## Notes

- Several browsers may watch the same machine at once, sharing one terminal —
  that is intentional.
- 64 KB of scrollback per machine is replayed on attach, so a live session is
  not a blank screen until the next keystroke.
- Browser tickets live 30 seconds. They travel in the WebSocket URL, which is
  where credentials end up in logs, so they expire fast.
- Behind nginx, the relay paths need `proxy_set_header Upgrade $http_upgrade;`
  and `Connection "upgrade"`. Cloudflare proxies WebSockets with no extra
  configuration.
