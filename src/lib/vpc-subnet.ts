/**
 * VPC Subnet Allocation — VLAN 50, /28 per VPC, hashed from the owner's id
 *
 * Network model:
 *   - All customer VPCs ride a single 802.1Q VLAN (50) on the MikroTik
 *     "vlan50-customers" interface and one shared Proxmox SDN VNet.
 *   - The 10.50.0.0/16 pool is carved into 4096 /28 blocks (14 usable IPs each).
 *   - Each VPC's /28 is derived by hashing a seed (the owner's user id, plus a
 *     per-VPC discriminator) into an 8-hex "network id", reduced to a block
 *     index. Collisions are resolved by deterministic linear probing against
 *     the set of already-allocated indexes, so allocation is stable and
 *     never double-assigns a subnet.
 */

import { createHash } from "crypto";

export const CUSTOMER_VLAN_ID = 50;
export const VPC_POOL_CIDR = "10.50.0.0/16";

/** /28 blocks available in 10.50.0.0/16 (65536 / 16). */
export const TOTAL_SUBNETS = 4096;

export interface VpcNet {
    /** 8-hex label hashed from the seed (the human-facing "network id"). */
    networkId: string;
    /** 0..4095 — the actual /28 block index (source of truth for the address). */
    index: number;
    subnet: string;     // e.g. "10.50.3.16/28"
    gateway: string;    // e.g. "10.50.3.17"
    dhcpStart: string;  // e.g. "10.50.3.18"
    dhcpEnd: string;    // e.g. "10.50.3.30"
}

/** 8-hex network id hashed from any seed (stable per seed). */
export function networkIdFor(seed: string): string {
    return createHash("sha256").update(seed).digest("hex").slice(0, 8);
}

/** Reduce an 8-hex network id to a /28 block index. */
export function indexFromNetworkId(networkId: string): number {
    return parseInt(networkId, 16) % TOTAL_SUBNETS;
}

/** Build the full /28 descriptor for a given block index. */
export function netFromIndex(index: number, networkId: string): VpcNet {
    const o3 = index >> 4;          // 0..255  (third octet)
    const o4 = (index & 0xf) * 16;  // 0,16,…,240 (fourth octet, /28 aligned)
    return {
        networkId,
        index,
        subnet: `10.50.${o3}.${o4}/28`,
        gateway: `10.50.${o3}.${o4 + 1}`,
        dhcpStart: `10.50.${o3}.${o4 + 2}`,
        dhcpEnd: `10.50.${o3}.${o4 + 14}`,
    };
}

/**
 * Allocate a /28 for a VPC.
 *
 * @param seed         Hash seed — pass the owner's userId (optionally suffixed
 *                     with a per-VPC discriminator for users with >1 VPC).
 * @param usedIndexes  Block indexes already taken by existing VPCs.
 */
export function allocateVpcNet(seed: string, usedIndexes: Set<number>): VpcNet {
    const networkId = networkIdFor(seed);
    const start = indexFromNetworkId(networkId);
    for (let k = 0; k < TOTAL_SUBNETS; k++) {
        const i = (start + k) % TOTAL_SUBNETS;
        if (!usedIndexes.has(i)) {
            // Re-label with the resolved index so networkId ↔ index stays coherent.
            return netFromIndex(i, networkIdFor(`${seed}#${i}`));
        }
    }
    throw new Error("VPC subnet pool exhausted (10.50.0.0/16 full)");
}
