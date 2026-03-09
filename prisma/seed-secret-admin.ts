import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  console.log('Seeding secret admin user...');

  const email = process.env.ADMIN_INTERNAL_EMAIL || 'admin@notrespond.com';
  const plainPassword = 'nrspadmin2505@#'; // Change this if needed
  const name = 'System Administrator';

  const userExists = await prisma.user.findUnique({
    where: { email }
  });

  if (userExists) {
    console.log(`Admin user ${email} already exists!`);
    console.log(`You can now log in using the secret username: ${process.env.ADMIN_SECRET_USERNAME}`);
    return;
  }

  const passwordHash = await bcrypt.hash(plainPassword, 10);

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
  console.log(`Internal Email: ${email}`);
  console.log(`Secret Login Username: ${process.env.ADMIN_SECRET_USERNAME}`);
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
