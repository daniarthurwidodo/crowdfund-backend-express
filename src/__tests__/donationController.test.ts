import request from 'supertest';
import express from 'express';
import donationRoutes from '../routes/donations';
import { authenticateToken } from '../middleware/auth';
import { Project, User, Donation } from '../models';
import { ProjectStatus, UserRole, PaymentStatus } from '../types';

// Mock the authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = {
      id: 'user123',
      email: 'donor@example.com',
      username: 'donor',
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.USER
    };
    next();
  }
}));

// Mock the logger
jest.mock('../config/logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    fatal: jest.fn()
  })
}));

// Mock the ULID utility
jest.mock('../utils/ulid', () => ({
  isValidULID: jest.fn().mockReturnValue(true)
}));

// Mock the models
jest.mock('../models', () => ({
  Project: {
    findByPk: jest.fn()
  },
  User: {
    findByPk: jest.fn()
  },
  Donation: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    sum: jest.fn()
  }
}));

describe('Donation Controller', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/donations', donationRoutes);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /api/donations', () => {
    const validDonationData = {
      amount: 50000,
      isAnonymous: false,
      message: 'Supporting this great cause!',
      projectId: '01HZAB123456789012345678CD'
    };

    const mockProject = {
      id: '01HZAB123456789012345678CD',
      title: 'Test Project',
      status: ProjectStatus.ACTIVE,
      currentAmount: 100000,
      targetAmount: 500000,
      endDate: new Date('2025-12-31'),
      startDate: new Date('2025-01-01')
    };

    const mockDonation = {
      id: 'donation123',
      amount: 50000,
      isAnonymous: false,
      message: 'Supporting this great cause!',
      projectId: '01HZAB123456789012345678CD',
      userId: 'user123',
      donorName: 'John Doe',
      paymentStatus: PaymentStatus.PENDING
    };

    beforeEach(() => {
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
      (Donation.create as jest.Mock).mockResolvedValue(mockDonation);
      (Donation.findByPk as jest.Mock).mockResolvedValue({
        ...mockDonation,
        project: mockProject,
        user: {
          id: 'user123',
          username: 'donor',
          firstName: 'John',
          lastName: 'Doe'
        }
      });
    });

    it('should create donation successfully for authenticated user', async () => {
      const response = await request(app)
        .post('/api/donations')
        .send(validDonationData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Donation created successfully');
      expect(response.body.donation.amount).toBe(50000);
      expect(Donation.create).toHaveBeenCalledWith({
        amount: 50000,
        isAnonymous: false,
        message: 'Supporting this great cause!',
        projectId: '01HZAB123456789012345678CD',
        userId: 'user123',
        donorName: 'John Doe'
      });
    });

    it('should create anonymous donation successfully', async () => {
      const anonymousData = {
        ...validDonationData,
        isAnonymous: true,
        donorName: 'Secret Supporter'
      };

      const response = await request(app)
        .post('/api/donations')
        .send(anonymousData);

      expect(response.status).toBe(201);
      expect(Donation.create).toHaveBeenCalledWith({
        amount: 50000,
        isAnonymous: true,
        message: 'Supporting this great cause!',
        projectId: '01HZAB123456789012345678CD',
        donorName: 'Secret Supporter'
      });
    });

    it('should use "Anonymous" as default donor name for anonymous donations', async () => {
      const anonymousData = {
        ...validDonationData,
        isAnonymous: true
      };

      const response = await request(app)
        .post('/api/donations')
        .send(anonymousData);

      expect(response.status).toBe(201);
      expect(Donation.create).toHaveBeenCalledWith({
        amount: 50000,
        isAnonymous: true,
        message: 'Supporting this great cause!',
        projectId: '01HZAB123456789012345678CD',
        donorName: 'Anonymous'
      });
    });

    it('should return 400 for validation errors', async () => {
      const invalidData = {
        amount: 500, // Below minimum
        projectId: 'invalid-ulid' // Invalid format
      };

      const response = await request(app)
        .post('/api/donations')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be greater than or equal to 1000');
    });

    it('should return 404 if project not found', async () => {
      (Project.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/donations')
        .send(validDonationData);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Project not found');
    });

    it('should return 400 for inactive project', async () => {
      const inactiveProject = { ...mockProject, status: ProjectStatus.DRAFT };
      (Project.findByPk as jest.Mock).mockResolvedValue(inactiveProject);

      const response = await request(app)
        .post('/api/donations')
        .send(validDonationData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot donate to inactive project');
    });

    it('should return 400 if project funding period has ended', async () => {
      const expiredProject = { ...mockProject, endDate: new Date('2023-12-31') };
      (Project.findByPk as jest.Mock).mockResolvedValue(expiredProject);

      const response = await request(app)
        .post('/api/donations')
        .send(validDonationData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Project funding period has ended');
    });

    it('should return 400 if project has reached funding goal', async () => {
      const fullyFundedProject = { ...mockProject, currentAmount: 500000, targetAmount: 500000 };
      (Project.findByPk as jest.Mock).mockResolvedValue(fullyFundedProject);

      const response = await request(app)
        .post('/api/donations')
        .send(validDonationData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Project has already reached its funding goal');
    });

    it('should validate amount limits', async () => {
      const highAmountData = { ...validDonationData, amount: 2000000000 }; // Above maximum

      const response = await request(app)
        .post('/api/donations')
        .send(highAmountData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be less than or equal to 1000000000');
    });

    it('should validate project ID format', async () => {
      const invalidProjectData = { ...validDonationData, projectId: 'short-id' };

      const response = await request(app)
        .post('/api/donations')
        .send(invalidProjectData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('length must be 26 characters long');
    });

    it('should validate message length', async () => {
      const longMessageData = { 
        ...validDonationData, 
        message: 'x'.repeat(501) // Exceeds maximum length
      };

      const response = await request(app)
        .post('/api/donations')
        .send(longMessageData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('length must be less than or equal to 500');
    });
  });

  describe('GET /api/donations', () => {
    const mockDonations = [
      {
        id: 'donation1',
        amount: 50000,
        isAnonymous: false,
        message: 'Great cause!',
        createdAt: new Date('2025-01-01'),
        project: {
          id: 'project1',
          title: 'Project 1',
          status: ProjectStatus.ACTIVE
        },
        user: {
          id: 'user1',
          username: 'donor1',
          firstName: 'John',
          lastName: 'Doe'
        }
      },
      {
        id: 'donation2',
        amount: 25000,
        isAnonymous: true,
        message: 'Keep it up!',
        createdAt: new Date('2025-01-02'),
        project: {
          id: 'project2',
          title: 'Project 2',
          status: ProjectStatus.ACTIVE
        },
        user: null
      }
    ];

    beforeEach(() => {
      (Donation.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 2,
        rows: mockDonations
      });
    });

    it('should get donations with pagination', async () => {
      const response = await request(app)
        .get('/api/donations?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.donations).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalItems: 2,
        hasNext: false,
        hasPrev: false
      });
    });

    it('should filter donations by project ID', async () => {
      const response = await request(app)
        .get('/api/donations?projectId=project1');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: 'project1'
          })
        })
      );
    });

    it('should filter donations by user ID', async () => {
      const response = await request(app)
        .get('/api/donations?userId=user1');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user1'
          })
        })
      );
    });

    it('should filter donations by amount range', async () => {
      const response = await request(app)
        .get('/api/donations?minAmount=20000&maxAmount=60000');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            amount: expect.objectContaining({
              [expect.any(Symbol)]: 20000,
              [expect.any(Symbol)]: 60000
            })
          })
        })
      );
    });

    it('should filter donations by anonymous status', async () => {
      const response = await request(app)
        .get('/api/donations?isAnonymous=true');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isAnonymous: true
          })
        })
      );
    });

    it('should sort donations by valid fields', async () => {
      const response = await request(app)
        .get('/api/donations?sortBy=amount&sortOrder=ASC');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['amount', 'ASC']]
        })
      );
    });

    it('should use default sorting for invalid sort fields', async () => {
      const response = await request(app)
        .get('/api/donations?sortBy=invalidField');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['createdAt', 'DESC']]
        })
      );
    });

    it('should limit results to maximum of 50 per page', async () => {
      const response = await request(app)
        .get('/api/donations?limit=100');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50
        })
      );
    });
  });

  describe('GET /api/donations/:id', () => {
    const mockDonation = {
      id: 'donation123',
      amount: 50000,
      isAnonymous: false,
      message: 'Great project!',
      project: {
        id: 'project123',
        title: 'Test Project',
        status: ProjectStatus.ACTIVE,
        fundraiser: {
          id: 'fundraiser123',
          username: 'fundraiser',
          firstName: 'Jane',
          lastName: 'Smith'
        }
      },
      user: {
        id: 'user123',
        username: 'donor',
        firstName: 'John',
        lastName: 'Doe'
      }
    };

    beforeEach(() => {
      (Donation.findByPk as jest.Mock).mockResolvedValue(mockDonation);
    });

    it('should get donation by id successfully', async () => {
      const response = await request(app)
        .get('/api/donations/donation123');

      expect(response.status).toBe(200);
      expect(response.body.donation.id).toBe('donation123');
      expect(response.body.donation.amount).toBe(50000);
      expect(response.body.donation.project).toBeDefined();
      expect(response.body.donation.user).toBeDefined();
    });

    it('should return 404 for non-existent donation', async () => {
      (Donation.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/donations/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Donation not found');
    });
  });

  describe('GET /api/donations/my', () => {
    const mockUserDonations = [
      {
        id: 'donation1',
        amount: 50000,
        isAnonymous: false,
        createdAt: new Date('2025-01-01'),
        project: {
          id: 'project1',
          title: 'My Supported Project 1',
          status: ProjectStatus.ACTIVE,
          targetAmount: 200000,
          currentAmount: 150000,
          fundraiser: {
            id: 'fundraiser1',
            username: 'fundraiser1'
          }
        }
      },
      {
        id: 'donation2',
        amount: 25000,
        isAnonymous: false,
        createdAt: new Date('2025-01-02'),
        project: {
          id: 'project2',
          title: 'My Supported Project 2',
          status: ProjectStatus.COMPLETED,
          targetAmount: 100000,
          currentAmount: 100000,
          fundraiser: {
            id: 'fundraiser2',
            username: 'fundraiser2'
          }
        }
      }
    ];

    beforeEach(() => {
      (Donation.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 2,
        rows: mockUserDonations
      });
      (Donation.sum as jest.Mock).mockResolvedValue(75000);
    });

    it('should get user donations with pagination and total', async () => {
      const response = await request(app)
        .get('/api/donations/my?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.donations).toHaveLength(2);
      expect(response.body.totalDonated).toBe(75000);
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalItems: 2,
        hasNext: false,
        hasPrev: false
      });
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user123' }
        })
      );
    });

    it('should sort user donations correctly', async () => {
      const response = await request(app)
        .get('/api/donations/my?sortBy=amount&sortOrder=ASC');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['amount', 'ASC']]
        })
      );
    });

    it('should handle zero total donated', async () => {
      (Donation.sum as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/donations/my');

      expect(response.status).toBe(200);
      expect(response.body.totalDonated).toBe(0);
    });
  });

  describe('GET /api/donations/project/:projectId', () => {
    const mockProject = {
      id: 'project123',
      title: 'Test Project',
      currentAmount: 150000,
      targetAmount: 200000
    };

    const mockProjectDonations = [
      {
        id: 'donation1',
        amount: 75000,
        isAnonymous: false,
        createdAt: new Date('2025-01-01'),
        user: {
          id: 'user1',
          username: 'donor1',
          firstName: 'John',
          lastName: 'Doe'
        }
      },
      {
        id: 'donation2',
        amount: 75000,
        isAnonymous: true,
        createdAt: new Date('2025-01-02'),
        user: null
      }
    ];

    beforeEach(() => {
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
      (Donation.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 2,
        rows: mockProjectDonations
      });
    });

    it('should get project donations with stats', async () => {
      const response = await request(app)
        .get('/api/donations/project/project123?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.donations).toHaveLength(2);
      expect(response.body.stats).toEqual({
        totalAmount: 150000,
        donationCount: 2,
        averageDonation: 75000
      });
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalItems: 2
      });
    });

    it('should return 404 if project not found', async () => {
      (Project.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/donations/project/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Project not found');
    });

    it('should handle project with no donations', async () => {
      const projectWithNoDonations = { ...mockProject, currentAmount: 0 };
      (Project.findByPk as jest.Mock).mockResolvedValue(projectWithNoDonations);
      (Donation.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 0,
        rows: []
      });

      const response = await request(app)
        .get('/api/donations/project/project123');

      expect(response.status).toBe(200);
      expect(response.body.donations).toHaveLength(0);
      expect(response.body.stats).toEqual({
        totalAmount: 0,
        donationCount: 0,
        averageDonation: 0
      });
    });

    it('should sort project donations correctly', async () => {
      const response = await request(app)
        .get('/api/donations/project/project123?sortBy=amount&sortOrder=ASC');

      expect(response.status).toBe(200);
      expect(Donation.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['amount', 'ASC']]
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (Donation.findAndCountAll as jest.Mock).mockRejectedValue(new Error('Database connection error'));

      const response = await request(app)
        .get('/api/donations');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal server error');
    });

    it('should handle creation errors gracefully', async () => {
      const mockProject = {
        id: 'project123',
        status: ProjectStatus.ACTIVE,
        currentAmount: 0,
        targetAmount: 100000,
        endDate: new Date('2025-12-31')
      };
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
      (Donation.create as jest.Mock).mockRejectedValue(new Error('Creation failed'));

      const response = await request(app)
        .post('/api/donations')
        .send({
          amount: 50000,
          projectId: '01HZAB123456789012345678CD',
          isAnonymous: false
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal server error');
    });

    it('should handle validation errors for invalid data types', async () => {
      const response = await request(app)
        .post('/api/donations')
        .send({
          amount: 'not-a-number',
          projectId: '01HZAB123456789012345678CD',
          isAnonymous: 'not-a-boolean'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be a number');
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should handle anonymous donations without authentication', async () => {
      // Mock unauthenticated request
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = null; // No authenticated user
        next();
      });

      const mockProject = {
        id: 'project123',
        status: ProjectStatus.ACTIVE,
        currentAmount: 0,
        targetAmount: 100000,
        endDate: new Date('2025-12-31')
      };
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
      (Donation.create as jest.Mock).mockResolvedValue({ id: 'donation123' });
      (Donation.findByPk as jest.Mock).mockResolvedValue({
        id: 'donation123',
        amount: 50000,
        isAnonymous: true,
        donorName: 'Anonymous Supporter'
      });

      const response = await request(app)
        .post('/api/donations')
        .send({
          amount: 50000,
          projectId: '01HZAB123456789012345678CD',
          isAnonymous: true,
          donorName: 'Anonymous Supporter'
        });

      expect(response.status).toBe(201);
      expect(Donation.create).toHaveBeenCalledWith({
        amount: 50000,
        isAnonymous: true,
        projectId: '01HZAB123456789012345678CD',
        donorName: 'Anonymous Supporter'
      });
    });
  });
});