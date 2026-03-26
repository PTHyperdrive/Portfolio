import { prisma } from '../src/lib/db';

async function main() {
  console.log('Starting cleanup of non-admin accounts...');

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

    // Delete the users. Note: Due to onDelete: Cascade on the Prisma schema,
    // this will automatically delete their associated accounts, sessions, orders, 
    // vpnConfigs, proxyAccounts, emailAccounts, vpsInstances, and transactions.
    const result = await prisma.user.deleteMany({
      where: {
        role: {
          not: 'ADMIN',
        },
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
