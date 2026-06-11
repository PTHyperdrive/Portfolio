# User Self-Service VPC Creation

Users currently see "Contact an administrator" on the Networks page. The goal is to let authenticated users create their own VPC and assign their own VMs to it — with automatic VLAN/subnet allocation and MikroTik provisioning.

## User Review Required

> [!IMPORTANT]
> **VPC Limit per User** — How many VPCs should a single user be allowed to create? Proposed default: **1 VPC per user** (matching the /28 subnet model — 14 usable IPs per customer).

> [!IMPORTANT]
> **Auto-allocation vs. Manual** — The plan auto-allocates the next free VLAN ID (501-599) and subnet. Users don't choose network details — they just click "Create VPC" and get one. Is this correct, or should users pick a name/description?

> [!WARNING]
> **VM Ownership Guard** — Users will only be able to assign VMs **they own** to their VPC. They cannot assign another user's VM or access admin-created VPCs they don't own.

## Open Questions

1. Should users be able to **delete** their own VPC (with MikroTik cleanup), or is deletion admin-only?
2. Should users be able to **unassign** their VM from a VPC?
3. Should the VPC name be auto-generated (e.g., `VPC-{username}-001`) or user-chosen?

## Proposed Changes

### User VPC API

#### [NEW] [route.ts](file:///e:/Codes/Portfolio/src/app/api/networks/vpc/route.ts)

`POST /api/networks/vpc` — User-initiated VPC creation:
- Auth check: must be logged in
- Limit check: user can have at most 1 VPC (count existing VPCs where user's VMs are assigned)
- Auto-allocate: find lowest unused VLAN ID (501-599), compute subnet `10.50.{vlanId-500}.0/28`, gateway `10.50.{vlanId-500}.1`
- MikroTik provisioning: create VLAN interface, add gateway IP, add firewall isolation rule (same logic as admin route)
- Create `Vpc` + `VpcAssignment` records in DB
- Audit log: `VPC_CREATE`

#### [NEW] [route.ts](file:///e:/Codes/Portfolio/src/app/api/networks/vpc/assign/route.ts)

`POST /api/networks/vpc/assign` — User assigns their own VM to their VPC:
- Body: `{ vpcId, vpsInstanceId }`
- Verify: user owns the VPC (via assignment check) AND owns the VM
- Check: VM not already in a VPC
- Create `VpcAssignment` record
- Audit log: `VPC_ASSIGN_VM`

`DELETE /api/networks/vpc/assign` — User unassigns their VM:
- Body: `{ vpcId, vpsInstanceId }`
- Verify ownership
- Delete `VpcAssignment` record
- Audit log: `VPC_UNASSIGN_VM`

---

### User Networks API

#### [MODIFY] [route.ts](file:///e:/Codes/Portfolio/src/app/api/networks/route.ts)

Update the existing GET endpoint to also return the user's owned VPC info (not just assignments), so the UI knows if the user already has a VPC.

---

### Networks Dashboard Page

#### [MODIFY] [page.tsx](file:///e:/Codes/Portfolio/src/app/dashboard/networks/page.tsx)

- Add "Create VPC" button in the header (shown when user has 0 VPCs)
- Add VPC creation flow: clicking the button calls `POST /api/networks/vpc`, shows loading state, then refreshes
- When user has a VPC with unassigned VMs, show an "Assign VM" dropdown
- Add "Unassign" button per assigned VM row
- Replace the "Contact an administrator" empty state with the Create VPC CTA

---

### Schema

No schema changes needed — the existing `Vpc`, `VpcAssignment`, and audit action models support this flow. The `Vpc` model has no `userId` field, but ownership is determined through VPC → VpcAssignment → VpsInstance → userId chain.

## Verification Plan

### Manual Verification
- Log in as a regular user with at least 1 VM
- Navigate to /dashboard/networks
- Create a VPC — verify VLAN allocation and MikroTik provisioning
- Assign a VM — verify it appears in the table
- Unassign a VM — verify cleanup
- Try creating a second VPC — should be blocked
- Check audit logs for VPC_CREATE, VPC_ASSIGN_VM entries
