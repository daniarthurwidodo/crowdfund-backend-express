import request from 'supertest';
import express from 'express';
import userRoutes from '../routes/users';
import { authenticateToken } from '../middleware/auth';
import { User, Project, Donation } from '../models';
import { UserRole } from '../types';
import bcrypt from 'bcryptjs';

// Mock the authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = {
      id: 'user123',
      email: 'test@example.com',
      username: 'testuser',
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

// Mock the image upload utility
jest.mock('../utils/imageUpload', () => ({
  deleteImage: jest.fn().mockResolvedValue(true)
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password')
}));

// Mock the models
jest.mock('../models', () => ({
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn()
  },
  Project: {
    findAll: jest.fn(),
    count: jest.fn(),
    sequelize: {
      fn: jest.fn()
    }
  },
  Donation: {
    findAll: jest.fn(),
    count: jest.fn(),
    sequelize: {
      fn: jest.fn(),
      col: jest.fn()
    }
  }
}));

describe('User Controller', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/users', userRoutes);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('GET /api/users/profile', () => {
    const mockUser = {
      id: 'user123',
      email: 'test@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      role: UserRole.USER,
      avatar: null,
      toJSON: jest.fn().mockReturnValue({
        id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      })
    };

    beforeEach(() => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
    });

    it('should get user profile successfully', async () => {
      const response = await request(app)
        .get('/api/users/profile');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe('user123');
      expect(User.findByPk).toHaveBeenCalledWith('user123', {
        attributes: { exclude: ['password'] }
      });
    });

    it('should return 404 if user not found', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/profile');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('PUT /api/users/profile', () => {
    const mockUser = {
      id: 'user123',
      email: 'test@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      update: jest.fn().mockResolvedValue(true),
      reload: jest.fn().mockResolvedValue(true),
      toJSON: jest.fn().mockReturnValue({
        id: 'user123',
        email: 'updated@example.com',
        username: 'testuser',
        firstName: 'Updated',
        lastName: 'User'
      })
    };

    beforeEach(() => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
      (User.findOne as jest.Mock).mockResolvedValue(null);
    });

    it('should update user profile successfully', async () => {
      const updateData = {
        firstName: 'Updated',
        email: 'updated@example.com'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Profile updated successfully');
      expect(response.body.user.firstName).toBe('Updated');
      expect(mockUser.update).toHaveBeenCalledWith(updateData);
    });

    it('should return 400 for validation errors', async () => {
      const invalidData = {
        email: 'invalid-email',
        firstName: ''
      };

      const response = await request(app)
        .put('/api/users/profile')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be a valid email');
    });

    it('should return 400 if email already exists', async () => {
      (User.findOne as jest.Mock).mockResolvedValue({ id: 'other-user', email: 'existing@example.com' });

      const response = await request(app)
        .put('/api/users/profile')
        .send({ email: 'existing@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email already exists');
    });

    it('should return 400 if username already exists', async () => {
      (User.findOne as jest.Mock).mockResolvedValue({ id: 'other-user', username: 'existinguser' });

      const response = await request(app)
        .put('/api/users/profile')
        .send({ username: 'existinguser' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Username already exists');
    });

    it('should allow updating to same email/username', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({ 
          email: 'test@example.com', // Same as current
          username: 'testuser',      // Same as current
          firstName: 'Updated'
        });

      expect(response.status).toBe(200);
      expect(User.findOne).not.toHaveBeenCalled(); // Should not check for existing when same
    });
  });

  describe('PUT /api/users/change-password', () => {
    const mockUser = {
      id: 'user123',
      validatePassword: jest.fn(),
      update: jest.fn().mockResolvedValue(true)
    };

    beforeEach(() => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
      mockUser.validatePassword.mockResolvedValue(true);
    });

    it('should change password successfully', async () => {
      const passwordData = {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123'
      };

      const response = await request(app)
        .put('/api/users/change-password')
        .send(passwordData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password changed successfully');
      expect(mockUser.validatePassword).toHaveBeenCalledWith('oldPassword');
      expect(bcrypt.hash).toHaveBeenCalledWith('newPassword123', 12);
      expect(mockUser.update).toHaveBeenCalledWith({ password: 'hashed_password' });
    });

    it('should return 400 for validation errors', async () => {
      const invalidData = {
        currentPassword: 'old',  // Too short
        newPassword: 'new123',
        confirmPassword: 'different123'  // Doesn't match
      };

      const response = await request(app)
        .put('/api/users/change-password')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('length must be at least 6');
    });

    it('should return 400 if current password is incorrect', async () => {
      mockUser.validatePassword.mockResolvedValue(false);

      const passwordData = {
        currentPassword: 'wrongPassword',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123'
      };

      const response = await request(app)
        .put('/api/users/change-password')
        .send(passwordData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Current password is incorrect');
    });

    it('should return 404 if user not found', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          currentPassword: 'oldPassword',
          newPassword: 'newPassword123',
          confirmPassword: 'newPassword123'
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('DELETE /api/users/avatar', () => {
    const mockUser = {
      id: 'user123',
      avatar: '/uploads/avatars/user123.jpg',
      update: jest.fn().mockResolvedValue(true)
    };

    beforeEach(() => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
    });

    it('should delete avatar successfully', async () => {
      const response = await request(app)
        .delete('/api/users/avatar');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Avatar deleted successfully');
      expect(mockUser.update).toHaveBeenCalledWith({ avatar: null });
    });

    it('should return 400 if no avatar to delete', async () => {
      mockUser.avatar = null;

      const response = await request(app)
        .delete('/api/users/avatar');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('No avatar to delete');
    });

    it('should return 404 if user not found', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/users/avatar');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('GET /api/users/stats', () => {
    beforeEach(() => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: 'user123',
        role: UserRole.USER
      });
      
      // Mock donation stats
      (Donation.findAll as jest.Mock).mockResolvedValue([{
        totalDonations: '5',
        totalDonated: '250000',
        projectsSupported: '3'
      }]);
    });

    it('should get user stats successfully for regular user', async () => {
      const response = await request(app)
        .get('/api/users/stats');

      expect(response.status).toBe(200);
      expect(response.body.stats).toEqual({
        totalDonations: 5,
        totalDonated: 250000,
        projectsSupported: 3
      });
    });

    it('should get user stats with project data for fundraiser', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: 'user123',
        role: UserRole.FUNDRAISER
      });

      (Project.findAll as jest.Mock).mockResolvedValue([{
        totalProjects: '2',
        totalRaised: '500000'
      }]);

      const response = await request(app)
        .get('/api/users/stats');

      expect(response.status).toBe(200);
      expect(response.body.stats).toEqual({
        totalDonations: 5,
        totalDonated: 250000,
        projectsSupported: 3,
        totalProjects: 2,
        totalRaised: 500000
      });
    });

    it('should return zero stats when no data', async () => {
      (Donation.findAll as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/users/stats');

      expect(response.status).toBe(200);
      expect(response.body.stats).toEqual({
        totalDonations: 0,
        totalDonated: 0,
        projectsSupported: 0
      });
    });
  });

  describe('GET /api/users/:id', () => {
    const mockUser = {
      id: 'user123',
      email: 'test@example.com',
      username: 'testuser',
      role: UserRole.USER,
      toJSON: jest.fn().mockReturnValue({
        id: 'user123',
        email: 'test@example.com',
        username: 'testuser'
      })
    };

    beforeEach(() => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
      (Donation.findAll as jest.Mock).mockResolvedValue([{
        totalDonations: '3',
        projectsSupported: '2'
      }]);
    });

    it('should get user by id successfully', async () => {
      const response = await request(app)
        .get('/api/users/user123');

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe('user123');
      expect(response.body.stats).toEqual({
        totalDonations: 3,
        projectsSupported: 2
      });
      expect(User.findByPk).toHaveBeenCalledWith('user123', {
        attributes: { exclude: ['password'] }
      });
    });

    it('should include project stats for fundraiser', async () => {
      mockUser.role = UserRole.FUNDRAISER;
      (Project.count as jest.Mock).mockResolvedValue(2);

      const response = await request(app)
        .get('/api/users/user123');

      expect(response.status).toBe(200);
      expect(response.body.stats.totalProjects).toBe(2);
    });

    it('should return 404 if user not found', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should only count non-anonymous donations for public stats', async () => {
      await request(app).get('/api/users/user123');

      expect(Donation.findAll).toHaveBeenCalledWith({
        where: { 
          userId: 'user123',
          isAnonymous: false
        },
        attributes: expect.any(Array),
        raw: true
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (User.findByPk as jest.Mock).mockRejectedValue(new Error('Database connection error'));

      const response = await request(app)
        .get('/api/users/profile');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal server error');
    });

    it('should handle validation errors for invalid input', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({ username: 'a' }); // Too short

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('length must be at least 3');
    });
  });
});