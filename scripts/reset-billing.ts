/**
 * Billing reset — migrate to hourly-metered billing.
 *
 * Zeroes EVERY user's credit balance and clears the financial ledgers
 * (CreditTransaction, Transaction) plus active plan selections, giving a
 * clean slate for the new hourly system. Audit logs are kept (immutable).
 *
 * Usage:  npx tsx scripts/reset-billing.ts --yes
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

async function main() {
    if (!process.argv.includes("--yes")) {
        console.error("Refusing to run without --yes (this wipes all balances + ledgers).");
        process.exit(1);
    }

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");

    const conn = await mysql.createConnection(url);

    const [credits] = await conn.execute("UPDATE User SET credits = 0");
    const [plans] = await conn.execute(
        "UPDATE User SET activePlan = NULL, planActivatedAt = NULL"
    );
    const [ctx] = await conn.execute("DELETE FROM CreditTransaction");
    const [tx] = await conn.execute("DELETE FROM Transaction");
    await conn.execute("DELETE FROM SystemConfig WHERE `key` = 'last_billing_cycle_at'");

    const r = (x: unknown) => (x as { affectedRows: number }).affectedRows;
    console.log(`Credits zeroed:        ${r(credits)} users`);
    console.log(`Plans cleared:         ${r(plans)} users`);
    console.log(`CreditTransactions:    ${r(ctx)} deleted`);
    console.log(`Transactions:          ${r(tx)} deleted`);
    console.log("Billing cycle gate reset. Hourly billing starts fresh.");

    await conn.end();
}

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
