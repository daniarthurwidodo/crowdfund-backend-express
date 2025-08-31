import dotenv from 'dotenv';
import { sequelize, User } from '../models';
import { UserRole } from '../types';
import { logger } from '../config/logger';

dotenv.config();

const createAdminUsers = async (): Promise<void> => {
  try {
    logger.info('Creating admin users...');

    await sequelize.authenticate();
    logger.info('Database connection established');

    const adminUsers = [
      {
        email: 'admin@crowdfund.com',
        username: 'admin',
        password: 'admin123',
        firstName: 'System',
        lastName: 'Administrator',
        role: UserRole.ADMIN,
        isActive: true,
      },
      {
        email: 'fundraiser@crowdfund.com',
        username: 'fundraiser',
        password: 'fundraiser123',
        firstName: 'Test',
        lastName: 'Fundraiser',
        role: UserRole.FUNDRAISER,
        isActive: true,
      },
      {
        email: 'user@crowdfund.com',
        username: 'testuser',
        password: 'user123',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.USER,
        isActive: true,
      },
    ];

    const createdUsers: any[] = [];

    for (const userData of adminUsers) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({
          where: {
            email: userData.email,
          },
        });

        if (existingUser) {
          logger.info(`User ${userData.email} already exists, skipping...`);
          continue;
        }

        const user = await User.create(userData);
        createdUsers.push(user);
        logger.info(`Created user: ${userData.email} (${userData.role})`);
      } catch (error) {
        logger.error(
          { err: error, email: userData.email },
          'Failed to create user'
        );
      }
    }

    console.log('\n🔐 Admin Users Created/Verified!');
    console.log('===================================');
    console.log('\nLogin Credentials:');
    console.log('------------------');

    adminUsers.forEach((user, index) => {
      const status = createdUsers.find(u => u.email === user.email)
        ? '✅ CREATED'
        : 'ℹ️  EXISTS';
      console.log(`\n${user.role}:`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Password: ${user.password}`);
      console.log(`  Status: ${status}`);
    });

    console.log('\n💡 Tip: Use these credentials to test different user roles');
    console.log('🚀 Ready to test the API!');

    await sequelize.close();
  } catch (error) {
    logger.error({ err: error }, 'Error creating admin users');
    console.error('\n❌ Failed to create admin users:', error);
    process.exit(1);
  }
};

// Run the script
if (require.main === module) {
  createAdminUsers();
}

export default createAdminUsers;
