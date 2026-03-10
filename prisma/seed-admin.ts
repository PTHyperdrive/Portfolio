import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding admin user...');

  const email = 'admin@example.com';
  const plainPassword = 'adminpassword123';
  const name = 'System Admin';

  const userExists = await prisma.user.findUnique({
    where: { email }
  });

  if (userExists) {
    console.log(`User ${email} already exists!`);
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

  console.log('Admin user created successfully:', admin.id);
  console.log(`Email: ${email}`);
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
