# Mutual TLS on the admin surface

A second factor in front of everything privileged. The browser must present a
client certificate signed by a CA you control, whose fingerprint is on an
explicit allowlist. A stolen session cookie, TOTP code, or vault token is not
enough on its own — without the private key in the device keystore, TLS never
completes.

Covers `/adminsystemnrsp/*` and `/api/admin/*`.

## Order of operations — read this first

Turning `MTLS_ENFORCE=true` **before** nginx is sending the headers locks you
out of your own admin panel, because every request will look like it arrived
without a certificate. Do it in this order:

1. Import the certificate into your browser
2. Add the nginx server block and reload
3. Confirm the admin panel loads over the mTLS hostname
4. Only then set `MTLS_ENFORCE=true` and restart

If you do lock yourself out: `MTLS_ENFORCE=false` in `.env` and
`pm2 restart nrsp-web --update-env` restores access. That is why the flag exists
rather than the check being unconditional.

## Where the check happens, and why it is safe

TLS terminates at nginx, so nginx is the only thing that can validate a client
certificate. The application reads the verdict from headers nginx sets. That is
sound only because of two properties, and **both** are required:

1. **nginx sets these headers on every proxied request**, so a value supplied by
   a client is overwritten rather than honoured.
2. **Next listens on 127.0.0.1 only**, so nothing can reach it without going
   through nginx. Were it bound to `0.0.0.0`, anyone on the LAN could connect
   directly and simply assert `X-Client-Verify: SUCCESS`.

If you ever move Next off loopback, this becomes a bypass.

**Every server block that proxies to Next must set these headers** — not just
the mTLS one. A block that leaves them unset lets a client send
`X-Client-Verify: SUCCESS` itself and walk straight through.

## Cloudflare

A proxied (orange-cloud) hostname terminates TLS at Cloudflare, so the client
certificate never reaches nginx and verification can never succeed. The admin
hostname must be **DNS-only (grey cloud)**.

That also means the admin surface is no longer behind Cloudflare's protections
and is reachable by whoever can route to the origin. Behind WireGuard that is
the point. On the open internet, think about it before you do it.

## nginx

```nginx
server {
    listen 443 ssl;
    server_name admin.notrespond.com;

    ssl_certificate     /etc/letsencrypt/live/admin.notrespond.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.notrespond.com/privkey.pem;

    # The CA that signs admin client certificates, and nothing else.
    ssl_client_certificate /home/nrsp/mtls/ca.crt;
    ssl_verify_client on;
    ssl_verify_depth  2;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

        # The verdict. Always set, so a client cannot supply its own.
        proxy_set_header X-Client-Verify      $ssl_client_verify;
        proxy_set_header X-Client-Fingerprint $ssl_client_fingerprint;
        proxy_set_header X-Client-DN          $ssl_client_s_dn;
    }
}
```

And in the **existing** `www.notrespond.com` block, inside its `location /`,
add the same three lines. With no client certificate on that hostname they
evaluate to `NONE` and an empty string, which is exactly right — the point is
that they are set rather than passed through from the request:

```nginx
        proxy_set_header X-Client-Verify      $ssl_client_verify;
        proxy_set_header X-Client-Fingerprint $ssl_client_fingerprint;
        proxy_set_header X-Client-DN          $ssl_client_s_dn;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Server configuration

```ini
MTLS_ENFORCE=false
MTLS_ALLOWED_FINGERPRINTS=<sha256 of each permitted certificate, comma separated>
```

Leaving the allowlist empty means "any certificate this CA signed", which is
coherent — the CA exists only to sign these — but it means revoking one device
requires rotating the CA and reissuing to all of them. Listing fingerprints
makes revocation a one-line edit, so prefer it.

## Issuing a certificate

```bash
~/mtls/mkcerts.sh <device-name>
```

Prints the PKCS#12 password and the SHA-256 fingerprint. The `.p12` is the
credential: anyone holding it and its password is an administrator. Move it to
the device over something private, import it, and delete the copy.

Leaf certificates last 825 days, the longest most browsers accept. The CA lasts
ten years, because rotating it means reissuing to every device.

## Importing

| Platform | How |
|---|---|
| Windows | Double-click the `.p12` → Current User → enter the password. Chrome and Edge use this store. |
| macOS | Double-click → add to the **login** keychain. Safari and Chrome use it. |
| Firefox | Settings → Privacy & Security → Certificates → View Certificates → Your Certificates → Import. Firefox has its own store and ignores the OS one. |
| iOS | AirDrop or email it to yourself, install the profile, then General → About → Certificate Trust Settings. |

The browser will ask which certificate to present the first time it reaches the
admin hostname. If it never asks, the hostname is still proxied by Cloudflare or
`ssl_verify_client` is not on.

## Revoking a device

Remove its fingerprint from `MTLS_ALLOWED_FINGERPRINTS` and restart. That is
immediate and needs no CRL or OCSP, which is the reason for preferring an
allowlist over bare CA trust.

## What this does not protect

The public site, the vault page, and the relay agent socket all stay reachable
without a certificate — they are not admin paths. mTLS here is about the
administrative surface, not about the whole deployment.
