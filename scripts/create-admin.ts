/**
 * Create or reset an ADMIN account.
 * Uses direct mysql2 + bcrypt — no Prisma client needed.
 *
 * Usage:  npx tsx scripts/create-admin.ts
 */

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const ADMIN_EMAIL    = "admin@notrespond.com";
const ADMIN_PASSWORD = "NRSP3dhouse@#$";
const ADMIN_NAME     = "Administrator";
const SALT_ROUNDS    = 12;

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set in .env");

    const conn = await mysql.createConnection(url);
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    const id = crypto.randomBytes(12).toString("hex").slice(0, 25);

    // Check if user exists
    const [rows] = await conn.execute(
        "SELECT id FROM User WHERE email = ?",
        [ADMIN_EMAIL]
    ) as [any[], any];

    if (rows.length > 0) {
        // Update existing
        await conn.execute(
            "UPDATE User SET passwordHash = ?, role = ?, name = ? WHERE email = ?",
            [passwordHash, "ADMIN", ADMIN_NAME, ADMIN_EMAIL]
        );
        console.log(`Admin account updated:`);
        console.log(`  ID:    ${rows[0].id}`);
    } else {
        // Create new
        await conn.execute(
            `INSERT INTO User (id, email, passwordHash, role, name, credits, hasUsedTrial, canInvite, twoFactorEnabled)
             VALUES (?, ?, ?, 'ADMIN', ?, 0, false, false, false)`,
            [id, ADMIN_EMAIL, passwordHash, ADMIN_NAME]
        );
        console.log(`Admin account created:`);
        console.log(`  ID:    ${id}`);
    }

    console.log(`  Email: ${ADMIN_EMAIL}`);
    console.log(`  Role:  ADMIN`);
    console.log(`  Pass:  ${ADMIN_PASSWORD}`);

    await conn.end();
}

main().catch(e => { console.error("Failed:", e); process.exit(1); });
