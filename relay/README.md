# Claude Code relay

Drive a Claude Code session that runs on your own Linux VM from the admin panel.

```
browser ──wss──▶ nrsp-web ──wss──▶ agent ──pty──▶ claude
                  (hub)            (your VM)
```

The agent dials **out**. Nothing listens on the VM, no inbound firewall rule is
needed, and it works behind NAT or WireGuard.

## What this is, and what it is not

Claude Code runs on your machine, authenticated as you, under your own
subscription — exactly as if you were sitting at that VM. The browser is a
remote screen, the same idea as SSH or tmux. No credential crosses the wire.

Do not expose it to the platform's tenants. Console sockets are admin-only and
should stay that way: the moment other people's requests reach this pty, it is
no longer you using your own tools, and that is a different thing entirely.

## Server setup

Two environment variables on `nrsp-web`:

| Variable | Purpose |
|---|---|
| `RELAY_AGENT_TOKEN` | Shared secret the agent presents. `openssl rand -hex 32` |
| `RELAY_TICKET_SECRET` | Signs browser tickets. Optional — falls back to `AUTH_SECRET` |

Then restart: `pm2 restart nrsp-web --update-env`.

## VM setup

```bash
git clone <repo> && cd relay/agent
npm install                     # node-pty is optional; see below
export RELAY_URL=wss://www.notrespond.com/api/relay/agent
export RELAY_AGENT_TOKEN=<same value as the server>
node claude-relay.mjs
```

`node-pty` is a native module and gives proper terminal sizing, which Claude
Code's UI wants. If it will not build, the agent falls back to `script(1)`,
which is present on every Linux box — the terminal then cannot be resized and
is pinned to 80x24. To build it:

```bash
sudo apt install -y build-essential python3
```

Run it under systemd so it survives reboots:

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
ExecStart=/usr/bin/node claude-relay.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Options

| Variable | Default | Meaning |
|---|---|---|
| `RELAY_COMMAND` | `claude` | What to run in the pty |
| `RELAY_CWD` | `$HOME` | Working directory |
| `RELAY_SHELL` | — | Set to `1` to get a plain `bash` instead |

## Notes

- Only one agent may connect at a time; a second is refused rather than
  silently replacing the first.
- Several browsers may attach at once and share one terminal — that is
  intentional, it is one session viewed from several screens.
- 64 KB of scrollback is replayed on attach, so a live session is not a blank
  screen until the next keystroke.
- Tickets live 30 seconds. They travel in the WebSocket URL, which is the one
  place credentials end up in logs, so they expire fast.
- If the platform sits behind nginx, the relay paths need
  `proxy_set_header Upgrade $http_upgrade;` and `Connection "upgrade"`.
  Cloudflare proxies WebSockets without extra configuration.
