import dotenv from 'dotenv';
import { sequelize, User, Project, Donation } from '../models';
import { logger } from '../config/logger';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (question: string): Promise<string> => {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
};

const getDatabaseStats = async () => {
  const userCount = await User.count();
  const projectCount = await Project.count();
  const donationCount = await Donation.count();

  const totalDonated = (await Donation.sum('amount')) || 0;

  return {
    users: userCount,
    projects: projectCount,
    donations: donationCount,
    totalAmount: totalDonated,
  };
};

const clearAllData = async () => {
  logger.info('Starting database cleanup...');

  try {
    // Delete in correct order to respect foreign key constraints
    logger.info('Deleting donations...');
    const deletedDonations = await Donation.destroy({ where: {} });

    logger.info('Deleting projects...');
    const deletedProjects = await Project.destroy({ where: {} });

    logger.info('Deleting users...');
    const deletedUsers = await User.destroy({ where: {} });

    logger.info('Database cleanup completed successfully', {
      deletedUsers,
      deletedProjects,
      deletedDonations,
    });

    return {
      users: deletedUsers,
      projects: deletedProjects,
      donations: deletedDonations,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error during database cleanup');
    throw error;
  }
};

const clearDatabase = async (): Promise<void> => {
  try {
    logger.info('Connecting to database...');
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Get current statistics
    const beforeStats = await getDatabaseStats();

    console.log('\n🗃️  Current Database Status');
    console.log('===========================');
    console.log(`👥 Users: ${beforeStats.users}`);
    console.log(`📊 Projects: ${beforeStats.projects}`);
    console.log(`💰 Donations: ${beforeStats.donations}`);
    console.log(
      `💵 Total Amount: $${beforeStats.totalAmount.toLocaleString()}`
    );

    if (
      beforeStats.users === 0 &&
      beforeStats.projects === 0 &&
      beforeStats.donations === 0
    ) {
      console.log('\n✨ Database is already empty!');
      rl.close();
      await sequelize.close();
      return;
    }

    console.log('\n⚠️  WARNING: This will permanently delete ALL data!');
    console.log('This action cannot be undone.');

    const confirmation = await askQuestion(
      '\nAre you sure you want to clear the database? (yes/no): '
    );

    if (confirmation.toLowerCase() !== 'yes') {
      console.log('\n🚫 Operation cancelled');
      rl.close();
      await sequelize.close();
      return;
    }

    const finalConfirmation = await askQuestion(
      '\nType "DELETE ALL DATA" to confirm: '
    );

    if (finalConfirmation !== 'DELETE ALL DATA') {
      console.log('\n🚫 Operation cancelled - confirmation text did not match');
      rl.close();
      await sequelize.close();
      return;
    }

    console.log('\n🧹 Clearing database...');
    const deletedCounts = await clearAllData();

    // Verify cleanup
    const afterStats = await getDatabaseStats();

    console.log('\n✅ Database Cleanup Complete!');
    console.log('==============================');
    console.log(`🗑️  Deleted ${deletedCounts.users} users`);
    console.log(`🗑️  Deleted ${deletedCounts.projects} projects`);
    console.log(`🗑️  Deleted ${deletedCounts.donations} donations`);
    console.log('\n📊 Current Database Status:');
    console.log(`👥 Users: ${afterStats.users}`);
    console.log(`📊 Projects: ${afterStats.projects}`);
    console.log(`💰 Donations: ${afterStats.donations}`);

    if (
      afterStats.users === 0 &&
      afterStats.projects === 0 &&
      afterStats.donations === 0
    ) {
      console.log('\n🎉 Database is now completely empty!');
    } else {
      console.log('\n⚠️  Warning: Some data may still remain');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error clearing database');
    console.error('\n❌ Clear operation failed:', error);
    process.exit(1);
  } finally {
    rl.close();
    await sequelize.close();
  }
};

// Run the clear script
if (require.main === module) {
  clearDatabase();
}

export default clearDatabase;
