import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env if needed

async function main() {
  console.log('Starting cleanup of non-admin accounts...');
  // Dynamically import the DB so dotenv has time to populate process.env first
  const { prisma } = await import('../src/lib/db');

  try {
    // Find all users who are not admins
    const nonAdminUsers = await prisma.user.findMany({
      where: {
        role: {
          not: 'ADMIN',
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (nonAdminUsers.length === 0) {
      console.log('No non-admin users found. Database is already clean.');
      return;
    }

    console.log(`Found ${nonAdminUsers.length} non-admin user(s) to delete:`);
    nonAdminUsers.forEach(user => console.log(`- ${user.email} (${user.id})`));

    // Get the IDs of users to delete
    const userIds = nonAdminUsers.map(u => u.id);

    // Delete dependent records first to avoid Foreign Key constraint violations!
    // VpsInstance, VpnConfig, ProxyAccount, EmailAccount all depend on Order
    // without cascading deletes, so we must manually delete them first.
    await prisma.vpsInstance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.vpnConfig.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.proxyAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.emailAccount.deleteMany({ where: { userId: { in: userIds } } });
    
    // Now safe to delete Orders and Transactions
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });

    // Finally, delete the users
    const result = await prisma.user.deleteMany({
      where: {
        id: { in: userIds }
      },
    });

    console.log(`\nSuccessfully deleted ${result.count} non-admin user(s).`);

  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
