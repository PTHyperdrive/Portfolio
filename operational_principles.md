# Operational Principles — Cloud VM Renting Platform

> Infrastructure-level architecture and operational workflows showing how security policies, identity management, and resource provisioning are enforced across network boundaries.

---

## System Architecture — Policy-Based Access Control Model

![Cloud Platform Architecture Diagram](/C:/Users/PTHyperdrive/.gemini/antigravity/brain/1fc2628b-5c4b-43c8-ba72-b08a6fbe22cc/cloud_platform_principles_1774864401259.png)

### Architecture Mapping to Security Standards

| Security Concept | Platform Component | Standard |
|---|---|---|
| **Policy Enforcement Point (PEP)** | pfSense Firewall — NAT, port forwarding, ACL | ISO 27001 A.13 |
| **Policy Decision Point (PDP)** | Next.js API — NextAuth, RBAC, Rate Limiter | ISO 27001 A.9 |
| **Identity Repository** | MariaDB — User, DeviceSession, 2FA secrets | ISO 27001 A.9.2 |
| **Policy Repository** | MariaDB — AuditLog (immutable), Roles | ISO 27001 A.12.4 |
| **Resource Registry** | MariaDB — VpsInstance, DeploymentTicket | ISO 27017 CLD.9 |
| **Provisioning Services** | Proxmox VE API — VM lifecycle management | ISO 27001 A.12.1 |
| **Audit Logger** | AuditLog model — append-only, 3yr retention | ISO 27001 A.12.4 |

---

## Scenario A: Secure noVNC Console Access

> **Focus:** Network translation, single-use ticket handshake, and WebSocket path through pfSense NAT.

```mermaid
sequenceDiagram
    autonumber

    participant U as User Browser
    participant A as Next.js API
    participant DB as MariaDB
    participant PF as pfSense
    participant PVE as Proxmox VE

    Note over U, PVE: Phase 1 - Ticket Acquisition via HTTPS

    U ->> A: POST /api/proxmox/vms/vmId/console/novnc
    A ->> A: Validate JWT Session via NextAuth
    A ->> DB: Verify VM ownership query
    DB -->> A: Instance record with node + displayType
    A ->> DB: AuditLog.create - CONSOLE_VNC_ACCESS
    A ->> PVE: POST /vncproxy with PVEAPIToken header
    PVE ->> PVE: Generate single-use VNC ticket with 60s TTL
    PVE -->> A: Return ticket + port + password
    A ->> A: Build WSS URL for Timox-1.notrespond.com port 8000
    A -->> U: Return wsUrl + ticket + password + port

    Note over U, PVE: Phase 2 - WebSocket via pfSense NAT

    U ->> U: Create RFB instance with scaleViewport enabled
    U ->> PF: WSS connect to Timox-1.notrespond.com port 8000

    Note right of PF: pfSense NAT Rule - WAN 8000 forwards to 10.0.1.1 port 8006 - Injects PVEAPIToken auth header

    PF ->> PVE: Forward WebSocket to 10.0.1.1 port 8006
    PVE ->> PVE: Validate single-use ticket - consumed on connect
    PVE -->> U: VNC Console Stream Established

    Note over U, PVE: Phase 3 - Active Console Session

    loop Every Frame
        PVE -->> U: Framebuffer update via RFB protocol
        U ->> PVE: Keyboard and Mouse input events
    end

    U ->> U: User navigates away - useEffect cleanup fires
    U ->> PVE: rfb.disconnect closes WebSocket

    Note over U, PVE: WebSocket closed and ticket invalidated
```

---

## Scenario B: VM Provisioning

> **Focus:** Database consistency, credit billing, Proxmox resource allocation, and the deployment ticket system.

```mermaid
sequenceDiagram
    autonumber

    participant U as User Browser
    participant A as Next.js API
    participant DB as MariaDB
    participant PVE as Proxmox VE

    Note over U, PVE: Phase 1 - Authentication and Authorization

    U ->> A: POST /api/proxmox/provision with plan + isoId + vmName
    A ->> A: Validate JWT Session and role check
    A ->> DB: Fetch user credits + activePlan + hasUsedTrial
    DB -->> A: User record with balance and plan data
    A ->> A: Anti-bypass checks - trial used, credits sufficient, plan valid

    Note over U, PVE: Phase 2 - Billing and Ticket Consumption

    A ->> DB: Query DeploymentTicket where status = AVAILABLE

    alt Has Available Ticket
        DB -->> A: Ticket found - free deploy
        A ->> DB: Update ticket status AVAILABLE to CONSUMED
    else No Ticket - Credit Payment
        DB -->> A: No ticket available
        A ->> A: Calculate cost from plan pricing
        A ->> DB: Transaction - decrement credits + create CreditTransaction + create ticket
    end

    Note over U, PVE: Phase 3 - Proxmox Resource Allocation

    A ->> PVE: GET /cluster/resources to query available nodes
    PVE -->> A: Node list with free storage and compute
    A ->> A: Smart node selection - pick node with most free storage
    A ->> PVE: POST /nodes/node/qemu with vmid + cores + memory + disk + iso + network
    PVE ->> PVE: Allocate disk on ZFS, reserve RAM and CPU, create network bridge, mount ISO
    PVE -->> A: Return new vmid - 201 Created
    A ->> PVE: POST /nodes/node/qemu/vmid/status/start
    PVE ->> PVE: Boot VM from ISO

    Note over U, PVE: Phase 4 - State Persistence and Audit

    A ->> DB: Transaction - create VpsInstance with vmId + node + specs + ticketId
    A ->> DB: AuditLog.create - VM_CREATE with node + plan + iso metadata
    A -->> U: Success - VM provisioning, ready in 60 seconds

    Note over U, PVE: Phase 5 - Post-Provisioning

    U ->> U: Redirect to dashboard and start polling

    loop Status Polling every 5 seconds
        U ->> A: GET /api/proxmox/vms/vmId
        A ->> PVE: GET /nodes/node/qemu/vmId/status/current
        PVE -->> A: Status running with uptime + cpu + mem
        A -->> U: Live VM status and metrics
    end
```

---

## Network Translation Map

```mermaid
flowchart LR
    subgraph Internet["Public Internet"]
        client["User Browser"]
    end

    subgraph CF["Cloudflare"]
        waf["WAF Rules"]
        dns["DNS Resolution"]
    end

    subgraph PFS["pfSense - 10.0.1.254"]
        nat["NAT Engine"]
    end

    subgraph LAN["Internal LAN - 10.0.1.0/24"]
        next["Next.js App - port 3000"]
        db["MariaDB - port 3306"]
        pve["Proxmox VE - port 8006"]
        vm1["VM 150"]
        vm2["VM 151"]
    end

    client -->|"HTTPS port 443"| waf
    waf -->|"Origin Pull"| dns
    dns -->|"TLS to WAN IP"| nat

    nat -->|"443 to Next.js 3000"| next
    nat -->|"8000 to Proxmox 8006 - VNC WebSocket"| pve

    next -->|"Prisma"| db
    next -->|"PVEAPIToken"| pve
    pve -->|"QEMU Monitor"| vm1
    pve -->|"QEMU Monitor"| vm2

    style CF fill:#f59e0b22,stroke:#f59e0b
    style PFS fill:#ef444422,stroke:#ef4444
    style LAN fill:#10b98122,stroke:#10b981
```

---

## Security Boundaries Summary

| Boundary | Enforcer | Mechanism | ISO Control |
|----------|----------|-----------|-------------|
| **Browser to Cloudflare** | Cloudflare WAF | TLS 1.3, rate limiting, DDoS mitigation | A.13.1.1 |
| **Cloudflare to pfSense** | Origin Certificate | Cloudflare Full Strict SSL mode | A.13.1.2 |
| **pfSense to Internal** | NAT + ACL | Port forwarding only on 443 and 8000 | A.13.1.3 |
| **API to Proxmox** | PVEAPIToken | Bearer token injected by pfSense | A.9.4.2 |
| **API to Database** | Prisma + TLS | Connection pooling, parameterized queries | A.14.2.5 |
| **VNC Ticket** | Proxmox | Single-use, 60s TTL, consumed on connect | A.9.4.1 |
| **User Deletion** | onDelete Restrict | Audit logs cannot be destroyed with user | A.12.4.2 |
| **Audit Trail** | AuditLog ISO 27001 | Immutable, append-only, 3-year retention | A.12.4.1 |
