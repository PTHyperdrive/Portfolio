import { PrismaClient } from '../src/generated/prisma/index.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL!.replace(/^mysql:\/\//, 'mariadb://');
const adapter = new PrismaMariaDb(connectionString);
const prisma = new (PrismaClient as any)({ adapter });

async function main() {
  console.log('Seeding secret admin user...');

  const email = process.env.ADMIN_INTERNAL_EMAIL || 'admin@notrespond.com';
  const plainPassword = 'nrspadmin2505@#';
  const name = 'System Administrator';

  const userExists = await prisma.user.findUnique({
    where: { email }
  });

  if (userExists) {
    console.log(`Admin user ${email} already exists! Updating password hash...`);
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    await prisma.user.update({
      where: { email },
      data: { passwordHash, role: 'ADMIN' }
    });
    console.log('✅ Password hash updated.');
  } else {
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const admin = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'ADMIN',
        emailVerified: new Date(),
      }
    });
    console.log('✅ Admin user created successfully:', admin.id);
  }

  console.log(`Internal Email: ${email}`);
  console.log(`Secret Login Username: ${process.env.ADMIN_SECRET_USERNAME || '(not set)'}`);
  console.log(`Password: ${plainPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
