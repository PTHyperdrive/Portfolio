#!/usr/bin/env node

/**
 * Proxmox CA Certificate Helper
 *
 * Fetches the TLS certificate from a Proxmox VE node and saves it as a
 * PEM file that can be referenced by PROXMOX_VE_CA_PATH.
 *
 * Usage:
 *   node scripts/fetch-proxmox-cert.mjs                          # uses PROXMOX_VE_HOST:PROXMOX_VE_PORT from .env
 *   node scripts/fetch-proxmox-cert.mjs pve.example.com 8006     # explicit host and port
 *   node scripts/fetch-proxmox-cert.mjs --generate               # generate a self-signed CA for testing
 *
 * The certificate is saved to: certs/proxmox-ca.pem
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import tls from "tls";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const CERT_DIR = resolve(PROJECT_ROOT, "certs");
const CERT_PATH = resolve(CERT_DIR, "proxmox-ca.pem");

// ── Load .env.local for defaults ────────────────────────────────────────────
function loadEnvFile(filename) {
    const filepath = resolve(PROJECT_ROOT, filename);
    if (!existsSync(filepath)) return {};
    const env = {};
    for (const line of readFileSync(filepath, "utf-8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    }
    return env;
}

// ── Fetch certificate from a live Proxmox host ──────────────────────────────
function fetchCertFromHost(host, port) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect(
            { host, port: parseInt(port, 10), rejectUnauthorized: false, servername: host },
            () => {
                const cert = socket.getPeerCertificate(/* detailed */ true);
                if (!cert || !cert.raw) {
                    socket.destroy();
                    return reject(new Error("No certificate returned by the server"));
                }

                // Walk the chain to find the root CA (or use the leaf if self-signed)
                let current = cert;
                const seen = new Set();
                while (current.issuerCertificate && current.issuerCertificate !== current) {
                    const fp = current.fingerprint256;
                    if (seen.has(fp)) break; // circular reference guard
                    seen.add(fp);
                    current = current.issuerCertificate;
                }

                // Convert DER → PEM
                const pemLines = current.raw
                    .toString("base64")
                    .match(/.{1,64}/g)
                    .join("\n");
                const pem = `-----BEGIN CERTIFICATE-----\n${pemLines}\n-----END CERTIFICATE-----\n`;

                socket.destroy();
                resolve({ pem, subject: current.subject, issuer: current.issuer });
            }
        );
        socket.on("error", reject);
        socket.setTimeout(10_000, () => {
            socket.destroy();
            reject(new Error(`Connection to ${host}:${port} timed out`));
        });
    });
}

// ── Generate a self-signed CA cert (for local dev / testing) ────────────────
function generateSelfSignedCA() {
    // Requires OpenSSL to be available in PATH
    try {
        execSync("openssl version", { stdio: "ignore" });
    } catch {
        console.error("✘ OpenSSL is not installed or not in PATH.");
        console.error("  Install it to use --generate, or fetch from a live host instead.");
        process.exit(1);
    }

    const keyPath = resolve(CERT_DIR, "proxmox-ca.key");

    console.log("Generating self-signed CA certificate for local development...\n");

    // Generate 4096-bit RSA private key
    execSync(`openssl genrsa -out "${keyPath}" 4096`, { stdio: "inherit" });

    // Generate self-signed CA cert (valid 10 years)
    execSync(
        `openssl req -new -x509 -days 3650 -key "${keyPath}" -out "${CERT_PATH}" ` +
        `-subj "/C=XX/ST=Dev/L=Local/O=Proxmox-Dev-CA/CN=Proxmox Dev Root CA"`,
        { stdio: "inherit" }
    );

    console.log(`\n✔ Self-signed CA generated:`);
    console.log(`  Key:  ${keyPath}`);
    console.log(`  Cert: ${CERT_PATH}`);
    console.log(`\n  Add to .env.local:`);
    console.log(`  PROXMOX_VE_CA_PATH="${CERT_PATH}"`);
    console.log(`\n  ⚠ This is for testing only. For production, use a real CA or Let's Encrypt.`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);

    mkdirSync(CERT_DIR, { recursive: true });

    // --generate: create a self-signed CA
    if (args.includes("--generate")) {
        generateSelfSignedCA();
        return;
    }

    // Determine host and port
    const env = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
    const host = args[0] || env.PROXMOX_VE_HOST;
    const port = args[1] || env.PROXMOX_VE_PORT || "8006";

    if (!host) {
        console.error("✘ No host specified.");
        console.error("  Usage: node scripts/fetch-proxmox-cert.mjs [host] [port]");
        console.error("  Or set PROXMOX_VE_HOST in .env.local");
        process.exit(1);
    }

    console.log(`Fetching TLS certificate from ${host}:${port}...\n`);

    try {
        const { pem, subject, issuer } = await fetchCertFromHost(host, port);

        writeFileSync(CERT_PATH, pem, "utf-8");

        const subjectStr = Object.entries(subject || {}).map(([k, v]) => `${k}=${v}`).join(", ");
        const issuerStr = Object.entries(issuer || {}).map(([k, v]) => `${k}=${v}`).join(", ");

        console.log(`✔ Certificate saved to: ${CERT_PATH}`);
        console.log(`  Subject: ${subjectStr}`);
        console.log(`  Issuer:  ${issuerStr}`);
        console.log(`\n  Add to .env.local:`);
        console.log(`  PROXMOX_VE_CA_PATH="${CERT_PATH}"`);

        // Check if it's Let's Encrypt
        if (issuerStr.includes("Let's Encrypt") || issuerStr.includes("ISRG")) {
            console.log(`\n  ℹ This is a Let's Encrypt certificate — it's already trusted by`);
            console.log(`    system CAs. You likely don't need PROXMOX_VE_CA_PATH at all.`);
            console.log(`    Just leave it unset and TLS verification will work automatically.`);
        }
    } catch (err) {
        console.error(`✘ Failed to fetch certificate: ${err.message}`);
        process.exit(1);
    }
}

main();
