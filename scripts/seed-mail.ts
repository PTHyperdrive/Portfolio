/**
 * Seed the mail server's domains and functional mailboxes.
 *
 * These rows ARE the mail server's config — Postfix and Dovecot read them
 * directly, so this script is what makes the server able to accept mail at
 * all. Safe to re-run: everything is an upsert.
 *
 *   npx tsx scripts/seed-mail.ts
 *
 * Creates:
 *   - mail.notrespond.com   self-service domain for user mailboxes
 *   - notrespond.com        admin-only domain (noreply, support, …)
 *   - catchall@<domain>     receives mail for addresses with no inbox, so the
 *                           admin UI can prompt to create one
 *   - noreply@notrespond.com  send-only sender for OTP and notifications
 */

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const USER_DOMAIN = process.env.MAIL_USER_DOMAIN || "mail.notrespond.com";
const PRIMARY_DOMAIN = process.env.MAIL_PRIMARY_DOMAIN || "notrespond.com";

function cuid(): string {
    // The app's Prisma client mints cuids; scripts talk to MariaDB directly
    // (the generated client is TS-only), so mint a compatible-looking id.
    return "c" + randomBytes(12).toString("hex");
}

function password(): string {
    return randomBytes(18).toString("base64url");
}

async function main() {
    const url = new URL(process.env.DATABASE_URL!);
    const db = await mysql.createConnection({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
    });

    const created: { address: string; password: string }[] = [];

    for (const [domain, adminOnly] of [
        [USER_DOMAIN, 0],
        [PRIMARY_DOMAIN, 1],
    ] as const) {
        const [rows] = await db.execute(
            "SELECT id FROM MailDomain WHERE domain = ?", [domain],
        );
        let domainId = (rows as { id: string }[])[0]?.id;

        if (!domainId) {
            domainId = cuid();
            await db.execute(
                `INSERT INTO MailDomain (id, domain, active, adminOnly, catchAll, dkimSelector, createdAt, updatedAt)
                 VALUES (?, ?, 1, ?, 1, 'nrsp', NOW(3), NOW(3))`,
                [domainId, domain, adminOnly],
            );
            console.log(`  + domain ${domain}${adminOnly ? " (admin only)" : " (self-service)"}`);
        } else {
            console.log(`  = domain ${domain} already present`);
        }

        // Catch-all box: holds mail for addresses that have no inbox yet.
        const [cRows] = await db.execute(
            "SELECT id FROM MailMailbox WHERE address = ?", [`catchall@${domain}`],
        );
        if (!(cRows as unknown[]).length) {
            const pw = password();
            await db.execute(
                `INSERT INTO MailMailbox
                   (id, userId, domainId, localPart, address, passwordHash, quotaMb, active, kind, createdAt, updatedAt)
                 VALUES (?, NULL, ?, 'catchall', ?, ?, 2048, 1, 'CATCHALL', NOW(3), NOW(3))`,
                [cuid(), domainId, `catchall@${domain}`, await bcrypt.hash(pw, 12)],
            );
            created.push({ address: `catchall@${domain}`, password: pw });
            console.log(`  + mailbox catchall@${domain}`);
        }

        // Catch-all alias so Postfix routes unknown recipients into that box.
        const [aRows] = await db.execute(
            "SELECT id FROM MailAlias WHERE source = ?", [`@${domain}`],
        );
        if (!(aRows as unknown[]).length) {
            await db.execute(
                `INSERT INTO MailAlias (id, domainId, source, destination, active, createdAt)
                 VALUES (?, ?, ?, ?, 1, NOW(3))`,
                [cuid(), domainId, `@${domain}`, `catchall@${domain}`],
            );
            console.log(`  + catch-all alias @${domain} -> catchall@${domain}`);
        }
    }

    // no-reply sender for OTP / notifications, on the primary domain.
    const [pRows] = await db.execute("SELECT id FROM MailDomain WHERE domain = ?", [PRIMARY_DOMAIN]);
    const primaryId = (pRows as { id: string }[])[0]?.id;
    const [nRows] = await db.execute(
        "SELECT id FROM MailMailbox WHERE address = ?", [`noreply@${PRIMARY_DOMAIN}`],
    );
    if (primaryId && !(nRows as unknown[]).length) {
        const pw = password();
        await db.execute(
            `INSERT INTO MailMailbox
               (id, userId, domainId, localPart, address, passwordHash, quotaMb, active, kind, createdAt, updatedAt)
             VALUES (?, NULL, ?, 'noreply', ?, ?, 512, 1, 'SYSTEM', NOW(3), NOW(3))`,
            [cuid(), primaryId, `noreply@${PRIMARY_DOMAIN}`, await bcrypt.hash(pw, 12)],
        );
        created.push({ address: `noreply@${PRIMARY_DOMAIN}`, password: pw });
        console.log(`  + mailbox noreply@${PRIMARY_DOMAIN}`);
    }

    await db.end();

    if (created.length) {
        console.log("\n=== Credentials (store these; shown once) ===");
        for (const c of created) console.log(`  ${c.address}\n    ${c.password}`);
        console.log("\nPut the noreply password in the website .env as SMTP_PASS.");
    }
    console.log("\nSeed complete.");
}

main().catch(err => { console.error(err); process.exit(1); });
