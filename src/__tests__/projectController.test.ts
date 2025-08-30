import request from 'supertest';
import express from 'express';
import projectRoutes from '../routes/projects';
import { authenticateToken } from '../middleware/auth';
import { Project, User, Donation } from '../models';
import { ProjectStatus, UserRole } from '../types';

// Mock the authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = {
      id: 'fundraiser123',
      email: 'fundraiser@example.com',
      username: 'fundraiser',
      role: UserRole.FUNDRAISER
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

// Mock the image upload utility
jest.mock('../utils/imageUpload', () => ({
  deleteImage: jest.fn().mockResolvedValue(true)
}));

// Mock the models
jest.mock('../models', () => ({
  Project: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    sequelize: {
      fn: jest.fn()
    }
  },
  User: {
    findByPk: jest.fn()
  },
  Donation: {
    findAll: jest.fn()
  }
}));

describe('Project Controller', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/projects', projectRoutes);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /api/projects', () => {
    const validProjectData = {
      title: 'Test Project',
      description: 'This is a test project description that meets minimum length requirements.',
      targetAmount: 100000,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      images: []
    };

    const mockProject = {
      id: 'project123',
      ...validProjectData,
      fundraiserId: 'fundraiser123',
      status: ProjectStatus.DRAFT,
      currentAmount: 0
    };

    beforeEach(() => {
      (Project.create as jest.Mock).mockResolvedValue(mockProject);
      (Project.findByPk as jest.Mock).mockResolvedValue({
        ...mockProject,
        fundraiser: {
          id: 'fundraiser123',
          username: 'fundraiser',
          firstName: 'Test',
          lastName: 'Fundraiser'
        }
      });
    });

    it('should create project successfully for fundraiser', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send(validProjectData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Project created successfully');
      expect(response.body.project.title).toBe('Test Project');
      expect(Project.create).toHaveBeenCalledWith({
        ...validProjectData,
        fundraiserId: 'fundraiser123'
      });
    });

    it('should return 403 for non-fundraiser users', async () => {
      // Mock regular user
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = {
          id: 'user123',
          role: UserRole.USER
        };
        next();
      });

      const response = await request(app)
        .post('/api/projects')
        .send(validProjectData);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only fundraisers can create projects');
    });

    it('should return 400 for validation errors', async () => {
      const invalidData = {
        title: 'Short', // Too short
        description: 'Short desc', // Too short
        targetAmount: 100, // Too low
        startDate: '2025-01-01',
        endDate: '2024-12-31' // Before start date
      };

      const response = await request(app)
        .post('/api/projects')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('length must be at least');
    });

    it('should validate minimum and maximum amounts', async () => {
      const lowAmountData = {
        ...validProjectData,
        targetAmount: 500 // Below minimum
      };

      const response = await request(app)
        .post('/api/projects')
        .send(lowAmountData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be greater than or equal to 1000');
    });

    it('should validate date relationships', async () => {
      const invalidDateData = {
        ...validProjectData,
        startDate: '2025-12-31',
        endDate: '2025-01-01' // End before start
      };

      const response = await request(app)
        .post('/api/projects')
        .send(invalidDateData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be greater than');
    });
  });

  describe('GET /api/projects', () => {
    const mockProjects = [
      {
        id: 'project1',
        title: 'Project 1',
        description: 'Description 1',
        targetAmount: 100000,
        currentAmount: 50000,
        status: ProjectStatus.ACTIVE,
        fundraiser: {
          id: 'fundraiser1',
          username: 'fundraiser1',
          firstName: 'Test',
          lastName: 'User'
        },
        donationCount: 5
      },
      {
        id: 'project2',
        title: 'Project 2',
        description: 'Description 2',
        targetAmount: 200000,
        currentAmount: 75000,
        status: ProjectStatus.ACTIVE,
        fundraiser: {
          id: 'fundraiser2',
          username: 'fundraiser2',
          firstName: 'Another',
          lastName: 'User'
        },
        donationCount: 3
      }
    ];

    beforeEach(() => {
      (Project.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 2,
        rows: mockProjects
      });
    });

    it('should get projects with pagination', async () => {
      const response = await request(app)
        .get('/api/projects?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalItems: 2,
        hasNext: false,
        hasPrev: false
      });
    });

    it('should filter projects by search term', async () => {
      const response = await request(app)
        .get('/api/projects?search=Project 1');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            [expect.any(Symbol)]: expect.arrayContaining([
              { title: expect.objectContaining({ [expect.any(Symbol)]: '%Project 1%' }) },
              { description: expect.objectContaining({ [expect.any(Symbol)]: '%Project 1%' }) }
            ])
          })
        })
      );
    });

    it('should filter projects by status', async () => {
      const response = await request(app)
        .get('/api/projects?status=ACTIVE');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE'
          })
        })
      );
    });

    it('should filter projects by fundraiser', async () => {
      const response = await request(app)
        .get('/api/projects?fundraiser=fundraiser1');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fundraiserId: 'fundraiser1'
          })
        })
      );
    });

    it('should filter projects by amount range', async () => {
      const response = await request(app)
        .get('/api/projects?minAmount=50000&maxAmount=150000');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            targetAmount: expect.objectContaining({
              [expect.any(Symbol)]: 50000,
              [expect.any(Symbol)]: 150000
            })
          })
        })
      );
    });

    it('should sort projects by valid fields', async () => {
      const response = await request(app)
        .get('/api/projects?sortBy=targetAmount&sortOrder=ASC');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['targetAmount', 'ASC']]
        })
      );
    });

    it('should use default sorting for invalid sort fields', async () => {
      const response = await request(app)
        .get('/api/projects?sortBy=invalidField');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['createdAt', 'DESC']]
        })
      );
    });

    it('should limit results to maximum of 50 per page', async () => {
      const response = await request(app)
        .get('/api/projects?limit=100');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50
        })
      );
    });
  });

  describe('GET /api/projects/:id', () => {
    const mockProject = {
      id: 'project123',
      title: 'Test Project',
      description: 'Test Description',
      targetAmount: 100000,
      currentAmount: 50000,
      fundraiser: {
        id: 'fundraiser123',
        username: 'fundraiser',
        firstName: 'Test',
        lastName: 'User'
      },
      donations: [
        {
          id: 'donation1',
          amount: 25000,
          user: {
            id: 'user1',
            username: 'donor1'
          }
        },
        {
          id: 'donation2',
          amount: 25000,
          user: {
            id: 'user2',
            username: 'donor2'
          }
        }
      ]
    };

    beforeEach(() => {
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
    });

    it('should get project by id successfully', async () => {
      const response = await request(app)
        .get('/api/projects/project123');

      expect(response.status).toBe(200);
      expect(response.body.project.id).toBe('project123');
      expect(response.body.project.donations).toHaveLength(2);
      expect(Project.findByPk).toHaveBeenCalledWith('project123', expect.objectContaining({
        include: expect.arrayContaining([
          expect.objectContaining({ model: User, as: 'fundraiser' }),
          expect.objectContaining({ model: Donation, as: 'donations' })
        ])
      }));
    });

    it('should return 404 for non-existent project', async () => {
      (Project.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/projects/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Project not found');
    });
  });

  describe('PUT /api/projects/:id', () => {
    const mockProject = {
      id: 'project123',
      title: 'Original Title',
      description: 'Original Description',
      fundraiserId: 'fundraiser123',
      status: ProjectStatus.ACTIVE,
      images: ['/uploads/projects/old-image.jpg'],
      update: jest.fn().mockResolvedValue(true),
      reload: jest.fn().mockResolvedValue(true)
    };

    beforeEach(() => {
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
    });

    it('should update project successfully', async () => {
      const updateData = {
        title: 'Updated Title',
        description: 'Updated description that meets the minimum length requirement.'
      };

      const response = await request(app)
        .put('/api/projects/project123')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Project updated successfully');
      expect(mockProject.update).toHaveBeenCalledWith(updateData);
      expect(mockProject.reload).toHaveBeenCalled();
    });

    it('should return 404 for non-existent project', async () => {
      (Project.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .put('/api/projects/nonexistent')
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Project not found');
    });

    it('should return 403 for unauthorized user', async () => {
      // Mock different user
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = {
          id: 'other-user',
          role: UserRole.FUNDRAISER
        };
        next();
      });

      const response = await request(app)
        .put('/api/projects/project123')
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to update this project');
    });

    it('should allow admin to update any project', async () => {
      // Mock admin user
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = {
          id: 'admin123',
          role: UserRole.ADMIN
        };
        next();
      });

      const response = await request(app)
        .put('/api/projects/project123')
        .send({ title: 'Admin Updated Title' });

      expect(response.status).toBe(200);
      expect(mockProject.update).toHaveBeenCalled();
    });

    it('should prevent updates to closed projects for non-admins', async () => {
      mockProject.status = ProjectStatus.CLOSED;

      const response = await request(app)
        .put('/api/projects/project123')
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot update closed project');
    });

    it('should validate end date is in the future', async () => {
      const response = await request(app)
        .put('/api/projects/project123')
        .send({ endDate: '2023-01-01' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('End date must be in the future');
    });

    it('should validate image URLs', async () => {
      const response = await request(app)
        .put('/api/projects/project123')
        .send({ 
          images: ['https://external-site.com/image.jpg'] // Invalid URL
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid image URLs');
    });

    it('should accept valid image URLs', async () => {
      const response = await request(app)
        .put('/api/projects/project123')
        .send({ 
          images: ['/uploads/projects/valid-image.jpg']
        });

      expect(response.status).toBe(200);
      expect(mockProject.update).toHaveBeenCalledWith({
        images: ['/uploads/projects/valid-image.jpg']
      });
    });

    it('should return 400 for validation errors', async () => {
      const response = await request(app)
        .put('/api/projects/project123')
        .send({ 
          title: 'ab', // Too short
          targetAmount: 100 // Below minimum
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('length must be at least');
    });
  });

  describe('DELETE /api/projects/:id', () => {
    const mockProject = {
      id: 'project123',
      fundraiserId: 'fundraiser123',
      currentAmount: 0,
      images: ['/uploads/projects/image1.jpg', '/uploads/projects/image2.jpg'],
      destroy: jest.fn().mockResolvedValue(true)
    };

    beforeEach(() => {
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
    });

    it('should delete project successfully', async () => {
      const response = await request(app)
        .delete('/api/projects/project123');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Project deleted successfully');
      expect(mockProject.destroy).toHaveBeenCalled();
    });

    it('should return 404 for non-existent project', async () => {
      (Project.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/projects/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Project not found');
    });

    it('should return 403 for unauthorized user', async () => {
      // Mock different user
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = {
          id: 'other-user',
          role: UserRole.FUNDRAISER
        };
        next();
      });

      const response = await request(app)
        .delete('/api/projects/project123');

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to delete this project');
    });

    it('should prevent deletion of project with donations for non-admins', async () => {
      mockProject.currentAmount = 50000; // Has donations

      const response = await request(app)
        .delete('/api/projects/project123');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot delete project with donations. Contact administrator.');
    });

    it('should allow admin to delete project with donations', async () => {
      mockProject.currentAmount = 50000; // Has donations
      
      // Mock admin user
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = {
          id: 'admin123',
          role: UserRole.ADMIN
        };
        next();
      });

      const response = await request(app)
        .delete('/api/projects/project123');

      expect(response.status).toBe(200);
      expect(mockProject.destroy).toHaveBeenCalled();
    });
  });

  describe('POST /api/projects/:id/remove-image', () => {
    const mockProject = {
      id: 'project123',
      fundraiserId: 'fundraiser123',
      images: ['/uploads/projects/image1.jpg', '/uploads/projects/image2.jpg'],
      update: jest.fn().mockResolvedValue(true),
      reload: jest.fn().mockResolvedValue(true)
    };

    beforeEach(() => {
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
    });

    it('should remove image successfully', async () => {
      const response = await request(app)
        .post('/api/projects/project123/remove-image')
        .send({ imageUrl: '/uploads/projects/image1.jpg' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Image removed successfully');
      expect(mockProject.update).toHaveBeenCalledWith({
        images: ['/uploads/projects/image2.jpg']
      });
    });

    it('should return 400 if image URL not provided', async () => {
      const response = await request(app)
        .post('/api/projects/project123/remove-image')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Image URL is required');
    });

    it('should return 400 if image not found in project', async () => {
      const response = await request(app)
        .post('/api/projects/project123/remove-image')
        .send({ imageUrl: '/uploads/projects/nonexistent.jpg' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Image not found in project');
    });

    it('should return 403 for unauthorized user', async () => {
      // Mock different user
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = {
          id: 'other-user',
          role: UserRole.FUNDRAISER
        };
        next();
      });

      const response = await request(app)
        .post('/api/projects/project123/remove-image')
        .send({ imageUrl: '/uploads/projects/image1.jpg' });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to modify this project');
    });
  });

  describe('GET /api/projects/my', () => {
    const mockProjects = [
      {
        id: 'project1',
        title: 'My Project 1',
        fundraiserId: 'fundraiser123',
        status: ProjectStatus.ACTIVE,
        donationCount: 5,
        totalRaised: 50000
      },
      {
        id: 'project2',
        title: 'My Project 2',
        fundraiserId: 'fundraiser123',
        status: ProjectStatus.DRAFT,
        donationCount: 0,
        totalRaised: 0
      }
    ];

    beforeEach(() => {
      (Project.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 2,
        rows: mockProjects
      });
    });

    it('should get user projects successfully', async () => {
      const response = await request(app)
        .get('/api/projects/my?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalItems: 2,
        hasNext: false,
        hasPrev: false
      });
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fundraiserId: 'fundraiser123' }
        })
      );
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/projects/my?status=ACTIVE');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { 
            fundraiserId: 'fundraiser123',
            status: 'ACTIVE'
          }
        })
      );
    });

    it('should sort projects correctly', async () => {
      const response = await request(app)
        .get('/api/projects/my?sortBy=title&sortOrder=ASC');

      expect(response.status).toBe(200);
      expect(Project.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['title', 'ASC']]
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (Project.findAndCountAll as jest.Mock).mockRejectedValue(new Error('Database connection error'));

      const response = await request(app)
        .get('/api/projects');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal server error');
    });

    it('should handle validation errors for invalid data types', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({
          title: 'Valid Title',
          description: 'Valid description that meets minimum requirements',
          targetAmount: 'not-a-number', // Invalid type
          startDate: '2025-01-01',
          endDate: '2025-12-31'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be a number');
    });
  });
});