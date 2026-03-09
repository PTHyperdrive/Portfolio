import dotenv from 'dotenv';
import path from 'path';
import https from 'https';

// Load .env explicitly for the test script
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PVE_HOST = process.env.PROXMOX_VE_HOST || "";
const PVE_PORT = process.env.PROXMOX_VE_PORT || "8006";
const PVE_TOKEN_ID = process.env.PROXMOX_VE_TOKEN_ID || "";
const PVE_TOKEN_VALUE = process.env.PROXMOX_VE_TOKEN_VALUE || "";

const PVE_BASE = `https://${PVE_HOST}:${PVE_PORT}/api2/json`;

// Create an HTTPS agent that ignores SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function pveFetch(endpoint: string, options: RequestInit = {}) {
    if (!PVE_HOST || !PVE_PORT) throw new Error("PROXMOX_VE_HOST/PORT not configured in .env");
    const url = `${PVE_BASE}${endpoint}`;
    
    console.log(`\nAttempting to connect to: ${url}`);
    
    try {
        const res = await fetch(url, {
            ...options,
            headers: {
                "Authorization": `PVEAPIToken=${PVE_TOKEN_ID}=${PVE_TOKEN_VALUE}`,
                "Content-Type": "application/json",
                ...options.headers,
            },
            // Use the custom agent to bypass the hostname mismatch error
            dispatcher: httpsAgent,
        } as RequestInit); // cast needed or standard fetch typings may complain about dispatcher

        if (!res.ok) {
            const text = await res.text().catch(() => "Unknown error");
            throw new Error(`[HTTP ${res.status}] ${text}`);
        }

        const json = await res.json();
        return json.data;
    } catch (error: any) {
        if (error.cause) {
            throw new Error(`${error.message} (Cause: ${error.cause.message})`);
        }
        throw error;
    }
}

async function testProxmoxVE() {
  console.log("Testing Proxmox VE Direct API...");
  console.log(`Using Host: ${PVE_HOST}:${PVE_PORT}`);
  console.log(`Using Token ID: ${PVE_TOKEN_ID}`);

  try {
    console.log("Fetching cluster nodes to verify authentication...");
    const nodes = await pveFetch('/nodes'); 
    console.log("✅ VE API Success! Connection and Authentication established.");
    console.log("Nodes found:", nodes.map((n:any) => n.node).join(', '));
  } catch (err: any) {
    console.error("❌ VE API Error:", err.message);
  }
}

testProxmoxVE();
