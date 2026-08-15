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

One per machine. Give each a distinct `RELAY_AGENT_NAME`; they appear together
in the panel for you to switch between, and reconnecting under a name replaces
that entry rather than adding a duplicate.

**No checkout is needed on the agent machine.** The script downloads itself from
the server, so Node 20+ is the only prerequisite. Replace
`PASTE_RELAY_AGENT_TOKEN` with `RELAY_AGENT_TOKEN` from the server's `.env`.

Do not paste comments into these blocks. `#` is a comment in bash and PowerShell
but not in cmd.exe, where npm reads it as a package name and fails with
`EINVALIDTAGNAME`.

### Linux / macOS

```bash
mkdir -p ~/claude-relay && cd ~/claude-relay
npm init -y
npm install ws
curl -fsSL -H "Authorization: Bearer PASTE_RELAY_AGENT_TOKEN" "https://www.notrespond.com/api/relay/agent-source" -o claude-relay.mjs
export RELAY_URL="wss://www.notrespond.com/api/relay/agent"
export RELAY_AGENT_TOKEN="PASTE_RELAY_AGENT_TOKEN"
export RELAY_AGENT_NAME="vm-dev"
node claude-relay.mjs
```

### Windows - PowerShell

```powershell
mkdir claude-relay
cd claude-relay
npm init -y
npm install ws node-pty
Invoke-WebRequest -Uri "https://www.notrespond.com/api/relay/agent-source" -Headers @{ Authorization = "Bearer PASTE_RELAY_AGENT_TOKEN" } -OutFile claude-relay.mjs
$env:RELAY_URL = "wss://www.notrespond.com/api/relay/agent"
$env:RELAY_AGENT_TOKEN = "PASTE_RELAY_AGENT_TOKEN"
$env:RELAY_AGENT_NAME = "workstation"
node claude-relay.mjs
```

### Windows - cmd.exe

```bat
mkdir claude-relay
cd claude-relay
npm init -y
npm install ws node-pty
curl -H "Authorization: Bearer PASTE_RELAY_AGENT_TOKEN" "https://www.notrespond.com/api/relay/agent-source" -o claude-relay.mjs
set RELAY_URL=wss://www.notrespond.com/api/relay/agent
set RELAY_AGENT_TOKEN=PASTE_RELAY_AGENT_TOKEN
set RELAY_AGENT_NAME=workstation
node claude-relay.mjs
```

**These two Windows shells are not interchangeable.** `$env:VAR = "x"` is
PowerShell only; `set VAR=x` is cmd.exe only. Using the wrong one fails with
"The filename, directory name, or volume label syntax is incorrect", which says
nothing about the real cause. Your prompt tells you which you are in: cmd.exe
shows `C:\Users\you>`, PowerShell shows `PS C:\Users\you>`.

## Terminal quality by platform

`node-pty` is a native module. Whether it is optional depends on the platform,
and on Windows it is not:

| Platform | With node-pty | Without |
|---|---|---|
| Linux | full pty, resizable | `script(1)` — real pty, fixed 80x24. Claude Code runs. |
| macOS | full pty, resizable | `script` — real pty, fixed 80x24. Claude Code runs. |
| Windows | ConPTY, resizable | **plain pipes — Claude Code will not run** |

There is no `script(1)` on Windows. Given plain pipes, Claude Code sees a
non-interactive stdin, switches to `--print` mode, waits three seconds for
piped input and exits:

```
Error: Input must be provided either through stdin or as a prompt argument when using --print
```

The agent detects that combination and refuses to start rather than restarting
the command in a loop, which only buries the reason. Set
`RELAY_ALLOW_NO_PTY=1` to override it for a command that does not need a
terminal.

Build prerequisites:

- Linux: `sudo apt install -y build-essential python3`
- macOS: `xcode-select --install`
- Windows: Visual Studio Build Tools, C++ workload

If building it on Windows is not practical, run the agent under WSL or on a
Linux machine instead — the relay does not care where the terminal lives.

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
