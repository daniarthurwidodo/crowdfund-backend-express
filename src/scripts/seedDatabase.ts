import dotenv from 'dotenv';
import { sequelize, User, Project, Donation } from '../models';
import { UserRole, ProjectStatus } from '../types';
import { logger } from '../config/logger';

dotenv.config();

interface UserData {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
}

interface ProjectData {
  title: string;
  description: string;
  images: string[];
  targetAmount: number;
  startDate: Date;
  endDate: Date;
  status: ProjectStatus;
  fundraiserId: string;
}

interface DonationData {
  amount: number;
  isAnonymous: boolean;
  donorName?: string;
  message?: string;
  projectId: string;
  userId?: string;
}

// Sample data arrays
const firstNames = [
  'John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Chris', 'Jessica',
  'Robert', 'Ashley', 'Matthew', 'Amanda', 'James', 'Jennifer', 'William',
  'Lisa', 'Richard', 'Michelle', 'Thomas', 'Kimberly', 'Charles', 'Amy',
  'Daniel', 'Angela', 'Mark', 'Helen', 'Paul', 'Deborah', 'Steven', 'Rachel',
  'Kevin', 'Carolyn', 'Jason', 'Janet', 'Jeffrey', 'Maria', 'Ryan', 'Heather',
  'Jacob', 'Diane', 'Gary', 'Julie', 'Nicholas', 'Joyce', 'Eric', 'Victoria'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzales',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark',
  'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
  'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green',
  'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell'
];

const projectTitles = [
  'Community Solar Garden Initiative',
  'Urban Beekeeping Education Center',
  'Mobile Library for Rural Areas',
  'Youth Coding Bootcamp Program',
  'Senior Citizens Digital Literacy',
  'Sustainable Vertical Farm Project',
  'Local Artist Mural Campaign',
  'Food Bank Distribution Network',
  'Mental Health Support Groups',
  'Environmental Cleanup Initiative',
  'Homeless Shelter Renovation',
  'Children\'s Playground Construction',
  'Community Tool Lending Library',
  'Free Music Lessons Program',
  'Disaster Relief Emergency Kit',
  'Small Business Incubator Space',
  'Public Art Installation Project',
  'Community Garden Expansion',
  'Local History Documentation',
  'Youth Sports Equipment Fund',
  'Senior Meal Delivery Service',
  'Neighborhood Watch Program',
  'Free Computer Lab Setup',
  'Community Composting Center',
  'Local Bike Share Program'
];

const projectDescriptions = [
  'Creating a sustainable future through renewable energy solutions that benefit our entire community.',
  'Educating the next generation about environmental stewardship and the importance of pollinators.',
  'Bringing knowledge and resources directly to underserved communities through mobile services.',
  'Empowering young minds with technology skills that will shape their future careers.',
  'Bridging the digital divide by teaching essential computer skills to seniors.',
  'Revolutionizing local food production with innovative vertical farming techniques.',
  'Beautifying our neighborhood while supporting local artistic talent and creativity.',
  'Ensuring no family goes hungry by improving our food distribution infrastructure.',
  'Providing crucial mental health resources and support networks for our community.',
  'Protecting our environment through organized cleanup and conservation efforts.',
  'Creating safe, warm shelter for those experiencing homelessness in our community.',
  'Building a safe, fun space where children can play, learn, and grow together.',
  'Promoting sustainability and community cooperation through shared tool resources.',
  'Nurturing musical talent and creativity through accessible music education programs.',
  'Preparing our community for emergencies with essential supplies and resources.',
  'Supporting entrepreneurship and innovation through collaborative workspace solutions.',
  'Enhancing our public spaces with inspiring and thought-provoking artistic installations.',
  'Expanding green spaces and promoting healthy eating through community gardening.',
  'Preserving and sharing our rich local heritage for future generations.',
  'Keeping kids active and healthy through accessible sports and recreation programs.',
  'Supporting our elderly community members with nutritious meal delivery services.',
  'Enhancing community safety through organized neighborhood watch initiatives.',
  'Providing digital access and education through community computer laboratories.',
  'Reducing waste and promoting sustainability through community composting programs.',
  'Promoting healthy transportation and reducing carbon emissions through bike sharing.'
];

const donationMessages = [
  'Great cause! Happy to support.',
  'Keep up the excellent work!',
  'This project will make a real difference.',
  'Proud to be part of this initiative.',
  'Thank you for making this happen.',
  'Every little bit helps!',
  'Amazing project, well done!',
  'This is exactly what our community needs.',
  'Excited to see the results!',
  'Wonderful initiative, keep going!',
  'Supporting local causes is important.',
  'Love what you\'re doing here.',
  'This will benefit so many people.',
  'Fantastic idea, well executed.',
  'Happy to contribute to this cause.',
  'Community spirit at its best!',
  'Making a positive impact together.',
  'This is how change happens.',
  'Inspiring work, thank you!',
  'Building a better future together.'
];

const anonymousNames = [
  'Anonymous Supporter',
  'Community Member',
  'Local Resident',
  'Concerned Citizen',
  'Neighborhood Friend',
  'Anonymous Donor',
  'Mystery Benefactor',
  'Kind Stranger',
  'Silent Supporter',
  'Anonymous Well-wisher'
];

// Utility functions
const getRandomItem = <T>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

const getRandomNumber = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomAmount = (min: number, max: number): number => {
  // For IDR, return whole numbers (no decimals)
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomDate = (start: Date, end: Date): Date => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const generateUsers = (count: number, role: UserRole): UserData[] => {
  const users: UserData[] = [];
  const usedEmails = new Set<string>();
  const usedUsernames = new Set<string>();

  for (let i = 0; i < count; i++) {
    let email: string;
    let username: string;
    
    // Ensure unique email and username
    do {
      const firstName = getRandomItem(firstNames);
      const lastName = getRandomItem(lastNames);
      const number = getRandomNumber(1, 999);
      
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${number}@example.com`;
      username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${number}`;
    } while (usedEmails.has(email) || usedUsernames.has(username));
    
    usedEmails.add(email);
    usedUsernames.add(username);
    
    const firstName = getRandomItem(firstNames);
    const lastName = getRandomItem(lastNames);
    
    users.push({
      email,
      username,
      password: 'password123', // Will be hashed by the model
      firstName,
      lastName,
      role,
      isActive: true
    });
  }
  
  return users;
};

const generateProjects = (fundraisers: any[], count: number): ProjectData[] => {
  const projects: ProjectData[] = [];
  const now = new Date();
  const statuses = Object.values(ProjectStatus);
  
  for (let i = 0; i < count; i++) {
    const fundraiser = getRandomItem(fundraisers);
    const title = getRandomItem(projectTitles);
    const description = getRandomItem(projectDescriptions);
    const targetAmount = getRandomAmount(5000000, 500000000); // 5M to 500M IDR
    
    // Generate realistic date ranges
    const startDate = getRandomDate(
      new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000), // 6 months ago
      new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)    // 1 month from now
    );
    
    const endDate = getRandomDate(
      new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000), // At least 30 days
      new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000) // Up to 1 year
    );
    
    let status = getRandomItem(statuses);
    
    // Make status more realistic based on dates
    if (endDate < now && status === ProjectStatus.ACTIVE) {
      status = Math.random() > 0.5 ? ProjectStatus.CLOSED : ProjectStatus.ACTIVE;
    }
    
    const images = [
      `https://picsum.photos/800/600?random=${i * 3 + 1}`,
      `https://picsum.photos/800/600?random=${i * 3 + 2}`,
      `https://picsum.photos/800/600?random=${i * 3 + 3}`
    ].slice(0, getRandomNumber(1, 3));
    
    projects.push({
      title: `${title} ${i + 1}`,
      description: `${description} This project aims to create lasting positive change in our community through collaborative effort and innovative solutions.`,
      images,
      targetAmount,
      startDate,
      endDate,
      status,
      fundraiserId: fundraiser.id
    });
  }
  
  return projects;
};

const generateDonations = (users: any[], projects: any[]): DonationData[] => {
  const donations: DonationData[] = [];
  
  projects.forEach((project, projectIndex) => {
    // Generate 3-15 donations per project
    const donationCount = getRandomNumber(3, 15);
    let totalDonated = 0;
    
    for (let i = 0; i < donationCount; i++) {
      const isAnonymous = Math.random() > 0.7; // 30% anonymous
      const amount = getRandomAmount(50000, Math.min(10000000, project.targetAmount * 0.3)); // 50K to 10M IDR max
      
      let donationData: DonationData = {
        amount,
        isAnonymous,
        projectId: project.id
      };
      
      if (isAnonymous) {
        donationData.donorName = getRandomItem(anonymousNames);
      } else {
        const donor = getRandomItem(users);
        donationData.userId = donor.id;
        donationData.donorName = `${donor.firstName} ${donor.lastName}`;
      }
      
      // Add message to 60% of donations
      if (Math.random() > 0.4) {
        donationData.message = getRandomItem(donationMessages);
      }
      
      donations.push(donationData);
      totalDonated += amount;
      
      // If project is CLOSED and we've reached target, stop adding donations
      if (project.status === ProjectStatus.CLOSED && totalDonated >= project.targetAmount) {
        break;
      }
    }
    
    // Update project current amount
    project.currentAmount = totalDonated;
    
    // Adjust status based on funding
    if (totalDonated >= project.targetAmount && project.status === ProjectStatus.ACTIVE) {
      project.status = ProjectStatus.CLOSED;
    }
  });
  
  return donations;
};

const clearDatabase = async (): Promise<void> => {
  logger.info('Clearing existing data...');
  
  await Donation.destroy({ where: {} });
  await Project.destroy({ where: {} });
  await User.destroy({ where: {} });
  
  logger.info('Database cleared successfully');
};

const seedDatabase = async (): Promise<void> => {
  try {
    logger.info('Starting database seeding...');
    
    // Connect to database
    await sequelize.authenticate();
    logger.info('Database connection established');
    
    // Clear existing data
    await clearDatabase();
    
    // Generate and create users
    logger.info('Creating users...');
    const regularUsersData = generateUsers(20, UserRole.USER);
    const fundraisersData = generateUsers(20, UserRole.FUNDRAISER);
    
    const regularUsers = await User.bulkCreate(regularUsersData);
    const fundraisers = await User.bulkCreate(fundraisersData);
    
    logger.info(`Created ${regularUsers.length} regular users and ${fundraisers.length} fundraisers`);
    
    // Generate and create projects
    logger.info('Creating projects...');
    const projectsData = generateProjects(fundraisers, 20);
    const projects = await Project.bulkCreate(projectsData);
    
    logger.info(`Created ${projects.length} projects`);
    
    // Generate and create donations
    logger.info('Creating donations...');
    const allUsers = [...regularUsers, ...fundraisers];
    const donationsData = generateDonations(allUsers, projects);
    const donations = await Donation.bulkCreate(donationsData);
    
    logger.info(`Created ${donations.length} donations`);
    
    // Update project current amounts based on donations
    logger.info('Updating project funding amounts...');
    for (const project of projects) {
      const projectDonations = donations.filter(d => d.projectId === project.id);
      const totalAmount = projectDonations.reduce((sum, donation) => sum + donation.amount, 0);
      
      let status = project.status;
      const now = new Date();
      
      // Update status based on funding and time
      if (totalAmount >= project.targetAmount) {
        status = ProjectStatus.CLOSED;
      } else if (project.endDate < now && status === ProjectStatus.ACTIVE) {
        status = Math.random() > 0.3 ? ProjectStatus.CLOSED : ProjectStatus.ACTIVE;
      }
      
      await project.update({ 
        currentAmount: totalAmount,
        status
      });
    }
    
    // Generate statistics
    const stats = {
      users: {
        total: regularUsers.length + fundraisers.length,
        regular: regularUsers.length,
        fundraisers: fundraisers.length
      },
      projects: {
        total: projects.length,
        active: projects.filter(p => p.status === ProjectStatus.ACTIVE).length,
        closed: projects.filter(p => p.status === ProjectStatus.CLOSED).length,
        cancelled: projects.filter(p => p.status === ProjectStatus.CANCELLED).length
      },
      donations: {
        total: donations.length,
        anonymous: donations.filter(d => d.isAnonymous).length,
        authenticated: donations.filter(d => !d.isAnonymous).length,
        totalAmount: donations.reduce((sum, d) => sum + d.amount, 0)
      }
    };
    
    logger.info('Database seeding completed successfully!', stats);
    
    console.log('\n🎉 Database Seeding Complete!');
    console.log('================================');
    console.log(`👥 Users: ${stats.users.total} (${stats.users.regular} users, ${stats.users.fundraisers} fundraisers)`);
    console.log(`📊 Projects: ${stats.projects.total} (${stats.projects.active} active, ${stats.projects.closed} closed, ${stats.projects.cancelled} cancelled)`);
    console.log(`💰 Donations: ${stats.donations.total} (${stats.donations.anonymous} anonymous, ${stats.donations.authenticated} authenticated)`);
    console.log(`💵 Total Amount: IDR ${stats.donations.totalAmount.toLocaleString()}`);
    console.log('\n✨ You can now test the API with realistic data!');
    
    await sequelize.close();
    
  } catch (error) {
    logger.error({ err: error }, 'Error seeding database');
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Run the seeder
if (require.main === module) {
  seedDatabase();
}

export default seedDatabase;