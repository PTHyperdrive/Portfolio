# Storage Audit + Hierarchy Notes (2026-06-11)

## Live cluster (via 10.0.1.1:8006)

| Node | CPU | RAM | Enabled image pools (avail) |
|---|---|---|---|
| Timox-1 | 7% | 24% | NVME-2TB 1.67T • SATA-4TB 3.0T • HDD-8TB 5.8T • local-zfs 388G |
| Timox-2 | 0% | **48%** | SATA-512GB 309G • NVME-256GB 231G • local-zfs 140G |
| Timox-3 | 0% | 9% | NVME-512G(lvm) 297G • local-zfs 224G |

Findings:
- Disk usage is healthy everywhere (≤38%); backups (PBS) at 67.5% — watch that first.
- Real imbalance risk: allocator picked by free space only → everything lands on Timox-1.
  Fixed: `selectBestStorage` now scores `avail × (1 − nodeMemUsage)`.
- Timox-2 RAM already 48% with zero customer load — investigate what's resident there.
- Most pools on Timox-2/3 are DISABLED duplicates of Timox-1 names. Fine for now, but the
  "nvme" keyword matches `SSD-NVME-512G` (LVM, no snapshots) on Timox-3 — paid NVMe plans
  there lose ZFS snapshot/rollback features. Either enable a ZFS NVMe pool on Timox-3 or
  rename the LVM pool so the keyword skips it.

## Resource-hierarchy redesign — recommendation

GCP-style Org→Folder→Project hierarchy is built for companies with teams and IAM
delegation. Your buyers are individuals: one human, one wallet, a handful of VMs.
A full hierarchy adds clicks and concepts without adding value for them.

Suggested middle ground ("lightweight projects"):
- Keep: User → **Workspace (optional grouping)** → Resources (VM, VPC, volume, peer).
- One default workspace per user, auto-created and invisible until they make a second one.
  Casual users never see the concept; power users get grouping + per-workspace spend view.
- Billing stays at the user level (one credit wallet) — do NOT split wallets per workspace,
  that's enterprise pain. Just tag CreditTransactions with workspaceId for reporting.
- Schema impact is small: `Workspace {id,userId,name}` + nullable `workspaceId` on
  VpsInstance/Vpc/WgPeer. No auth-model change (owner = user, as today).

Better-than-hierarchy ideas for personal customers (higher ROI first):
1. Hourly/daily billing with auto-suspend at zero credits — personal users hate monthly lock-in.
2. One-click app templates (game server, VPN, dev box, n8n, Coolify) on top of cloud-init.
3. Spending cap + email/Telegram alert instead of org-style budgets.
4. Resize in place (plan up/down) — individuals outgrow plans, orgs buy new ones.
5. Referral credits via your existing InvitationCode system.
