# Notrespond.com — System Architecture

## Network & Infrastructure Flow

```mermaid
graph TB
    subgraph Internet["🌐 Internet"]
        Browser["🖥️ Browser<br/>(User)"]
    end

    subgraph Cloudflare["☁️ Cloudflare"]
        CF_DNS["DNS<br/>www.notrespond.com"]
        CF_WAF["WAF<br/>DDoS Protection"]
        CF_TLS["TLS Termination<br/>(Public SSL)"]
        CF_DNS --> CF_WAF --> CF_TLS
    end

    subgraph Server["🖧 Origin Server (nrsp-web)"]
        subgraph Nginx["Nginx Reverse Proxy"]
            NG_SSL["Origin TLS<br/>(Cloudflare Origin Cert)"]
            NG_ROUTE{"Route by Path"}
            NG_NOVNC["/novnc/* proxy<br/>+ API Token Injection"]
            NG_APP["/* proxy<br/>→ localhost:3000"]
            NG_SSL --> NG_ROUTE
            NG_ROUTE -->|"/novnc/*"| NG_NOVNC
            NG_ROUTE -->|"Everything else"| NG_APP
        end

        subgraph NextJS["Next.js 16 (Turbopack) — :3000"]
            APP_PAGES["App Router Pages"]
            APP_API["API Routes"]
            AUTH["NextAuth.js<br/>+ 2FA (TOTP)"]
            PRISMA["Prisma ORM"]

            APP_PAGES --- AUTH
            APP_API --- AUTH
            APP_API --- PRISMA
        end
    end

    subgraph Database["🗄️ MySQL/MariaDB — 10.2.0.3:3306"]
        DB[("portfolio_site")]
    end

    subgraph Proxmox["🖥️ Proxmox VE — 10.0.1.1:8006"]
        PVE_API["Proxmox API<br/>(REST + WebSocket)"]
        PVE_VNC["VNC Proxy<br/>(per-VM)"]
        VMS["Virtual Machines<br/>(QEMU/KVM)"]
        PVE_API --> PVE_VNC --> VMS
    end

    Browser --> CF_DNS
    CF_TLS -->|"HTTPS"| NG_SSL
    NG_APP -->|"HTTP"| NextJS
    NG_NOVNC -->|"WSS + Auth Header"| PVE_API
    PRISMA -->|"MySQL Protocol"| DB
    APP_API -->|"HTTPS API Token Auth"| PVE_API

    style Cloudflare fill:#f6a821,stroke:#e8960e,color:#000
    style Server fill:#1a1f35,stroke:#334155,color:#fff
    style Nginx fill:#009639,stroke:#006b2b,color:#fff
    style NextJS fill:#0d1117,stroke:#00f0ff,color:#fff
    style Database fill:#003b57,stroke:#00618a,color:#fff
    style Proxmox fill:#2c3e50,stroke:#e67e22,color:#fff
    style Internet fill:#1e293b,stroke:#475569,color:#fff
```

## Request Flow Details

### 🌐 Regular Page Request
```
Browser → Cloudflare (WAF + TLS) → Nginx (/:443) → Next.js (:3000) → Prisma → MySQL
```

### 🖥️ noVNC Console (WebSocket)
```
Browser → Cloudflare → Nginx (/novnc/) → Proxmox VE (:8006)
   │                                         │
   │  ┌─ 1. POST /api/proxmox/vms/{id}/console/novnc ──→ Next.js ──→ Proxmox (get ticket)
   │  │                                                                    │
   │  │  ┌─────────── ticket + password + wsUrl (path only) ←──────────────┘
   │  │  │
   │  └──┤  2. wss://www.notrespond.com/novnc/...?vncticket=... 
   │     │     ↓
   │     │  Nginx injects Authorization header → Proxmox authenticates
   │     │     ↓
   │     └─ 3. RFB handshake (password = generated password) → VM console stream
   │
   └── noVNC renders <canvas> in browser
```

### 🔐 VM Management (API)
```
Browser → Next.js API Route → Proxmox REST API (API Token Auth)
                │
                ├── POST /start    → Start VM
                ├── POST /stop     → Stop VM
                ├── POST /reboot   → Restart VM
                ├── POST /destroy  → Delete VM
                ├── PATCH /display → Switch VGA (noVNC/SPICE)
                └── POST /deploy   → Create new VM
```

## Database Schema (MySQL)

```mermaid
erDiagram
    User ||--o{ Account : has
    User ||--o{ Session : has
    User ||--o{ DeviceSession : has
    User ||--o{ Order : places
    User ||--o{ VpsInstance : owns
    User ||--o{ BlogPost : writes
    User ||--o{ Transaction : has
    User ||--o{ CreditTransaction : has
    User ||--o{ ActivityLog : generates
    User ||--o{ AppliedPromoCode : uses
    User ||--o{ DeploymentTicket : has
    User ||--o{ VpnConfig : has
    User ||--o{ ProxyAccount : has
    User ||--o{ EmailAccount : has

    Order ||--o{ VpsInstance : provisions
    Order ||--o{ DeploymentTicket : creates

    User {
        string id PK
        string email UK
        string passwordHash
        string role
        int credits
        boolean twoFactorEnabled
        string twoFactorSecret
        boolean hasUsedTrial
        string activePlan
    }

    VpsInstance {
        string id PK
        string vmId
        string node
        string name
        string os
        string status
        json specs
        string ipAddress
        string userId FK
        string orderId FK
    }

    Order {
        string id PK
        string userId FK
        string serviceId FK
        string status
        float totalPrice
        json details
    }

    Service {
        string id PK
        string name
        string category
        float price
        json specs
    }

    BlogPost {
        string id PK
        string title
        string slug UK
        string content
        boolean published
        string authorId FK
    }

    DeploymentTicket {
        string id PK
        string userId FK
        string status
        string vmId
    }
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **CDN / WAF** | Cloudflare (DNS, DDoS, TLS, WebSocket proxy) |
| **Reverse Proxy** | Nginx (path routing, noVNC WebSocket proxy, API token injection) |
| **Frontend** | Next.js 16, React 19, Turbopack |
| **Auth** | NextAuth.js v5, TOTP 2FA |
| **ORM** | Prisma (MySQL) |
| **Database** | MariaDB/MySQL |
| **Hypervisor** | Proxmox VE (QEMU/KVM) |
| **Console** | noVNC (pre-bundled via esbuild IIFE) |
| **Styling** | CSS + Tailwind |

## Network Topology

```
┌─────────────────────────────────────────────────┐
│  Private Network                                │
│                                                 │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ nrsp-web     │    │ Proxmox (Timox-1)    │   │
│  │ 10.2.0.2     │───▶│ 10.0.1.1:8006        │   │
│  │              │    │                      │   │
│  │ • Nginx      │    │ • VM 111 (Ubuntu)    │   │
│  │ • Next.js    │    │ • VM xxx ...         │   │
│  │ • Prisma     │    │                      │   │
│  └──────┬───────┘    └──────────────────────┘   │
│         │                                       │
│  ┌──────▼───────┐                               │
│  │ MariaDB      │                               │
│  │ 10.2.0.3:3306│                               │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
          │
          │ Cloudflare Tunnel / Direct
          ▼
    ☁️ Cloudflare → 🌐 Internet → 🖥️ Browser
```
