import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { User, Project, Donation } from '../models';
import { UserRole } from '../types';
import { createChildLogger } from '../config/logger';
import { deleteImage } from '../utils/imageUpload';

const logger = createChildLogger('UserController');

const updateProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  email: Joi.string().email().optional(),
  username: Joi.string().min(3).max(30).alphanum().optional()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(6).required(),
  newPassword: Joi.string().min(6).max(128).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
});

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.id }, 'Error fetching user profile');
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    if (!req.user) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Check if email or username already exists (excluding current user)
    if (value.email && value.email !== user.email) {
      const existingEmailUser = await User.findOne({
        where: {
          email: value.email,
          id: { [Op.ne]: req.user.id }
        }
      });
      if (existingEmailUser) {
        res.status(400).json({ message: 'Email already exists' });
        return;
      }
    }

    if (value.username && value.username !== user.username) {
      const existingUsernameUser = await User.findOne({
        where: {
          username: value.username,
          id: { [Op.ne]: req.user.id }
        }
      });
      if (existingUsernameUser) {
        res.status(400).json({ message: 'Username already exists' });
        return;
      }
    }

    await user.update(value);
    await user.reload();

    const updatedUser = user.toJSON();
    
    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });

    logger.info(`Profile updated for user ${req.user.id}`);
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.id, body: req.body }, 'Error updating profile');
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    if (!req.user) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Verify current password
    const isCurrentPasswordValid = await user.validatePassword(value.currentPassword);
    if (!isCurrentPasswordValid) {
      res.status(400).json({ message: 'Current password is incorrect' });
      return;
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(value.newPassword, saltRounds);

    await user.update({ password: hashedPassword });

    res.json({ message: 'Password changed successfully' });

    logger.info(`Password changed for user ${req.user.id}`);
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.id }, 'Error changing password');
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (!user.avatar) {
      res.status(400).json({ message: 'No avatar to delete' });
      return;
    }

    // Delete the avatar file
    await deleteImage(user.avatar);

    // Update user record to remove avatar
    await user.update({ avatar: null });

    res.json({ message: 'Avatar deleted successfully' });

    logger.info(`Avatar deleted for user ${req.user.id}`);
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.id }, 'Error deleting avatar');
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getUserStats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    let stats: any = {
      totalDonations: 0,
      totalDonated: 0,
      projectsSupported: 0
    };

    // Get donation statistics for all users
    const donationStats = await Donation.findAll({
      where: { userId: req.user.id },
      attributes: [
        [Donation.sequelize?.fn('COUNT', Donation.sequelize?.col('id')), 'totalDonations'],
        [Donation.sequelize?.fn('SUM', Donation.sequelize?.col('amount')), 'totalDonated'],
        [Donation.sequelize?.fn('COUNT', Donation.sequelize?.fn('DISTINCT', Donation.sequelize?.col('projectId'))), 'projectsSupported']
      ],
      raw: true
    });

    if (donationStats.length > 0) {
      stats = {
        totalDonations: parseInt(donationStats[0].totalDonations as string) || 0,
        totalDonated: parseFloat(donationStats[0].totalDonated as string) || 0,
        projectsSupported: parseInt(donationStats[0].projectsSupported as string) || 0
      };
    }

    // If user is a fundraiser, get project statistics
    if (req.user.role === UserRole.FUNDRAISER || req.user.role === UserRole.ADMIN) {
      const projectStats = await Project.findAll({
        where: { fundraiserId: req.user.id },
        attributes: [
          [Project.sequelize?.fn('COUNT', Project.sequelize?.col('id')), 'totalProjects'],
          [Project.sequelize?.fn('SUM', Project.sequelize?.col('currentAmount')), 'totalRaised']
        ],
        raw: true
      });

      if (projectStats.length > 0) {
        stats.totalProjects = parseInt(projectStats[0].totalProjects as string) || 0;
        stats.totalRaised = parseFloat(projectStats[0].totalRaised as string) || 0;
      } else {
        stats.totalProjects = 0;
        stats.totalRaised = 0;
      }
    }

    res.json({ stats });
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.id }, 'Error fetching user stats');
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Get public stats for the user
    let publicStats: any = {
      totalDonations: 0,
      projectsSupported: 0
    };

    const donationStats = await Donation.findAll({
      where: { 
        userId: id,
        isAnonymous: false // Only count non-anonymous donations for public stats
      },
      attributes: [
        [Donation.sequelize?.fn('COUNT', Donation.sequelize?.col('id')), 'totalDonations'],
        [Donation.sequelize?.fn('COUNT', Donation.sequelize?.fn('DISTINCT', Donation.sequelize?.col('projectId'))), 'projectsSupported']
      ],
      raw: true
    });

    if (donationStats.length > 0) {
      publicStats = {
        totalDonations: parseInt(donationStats[0].totalDonations as string) || 0,
        projectsSupported: parseInt(donationStats[0].projectsSupported as string) || 0
      };
    }

    // If user is a fundraiser, get project count
    if (user.role === UserRole.FUNDRAISER || user.role === UserRole.ADMIN) {
      const projectCount = await Project.count({
        where: { fundraiserId: id }
      });
      publicStats.totalProjects = projectCount;
    }

    res.json({ 
      user: user.toJSON(),
      stats: publicStats
    });
  } catch (error: any) {
    logger.error({ err: error, userId: req.params.id }, 'Error fetching user');
    res.status(500).json({ message: 'Internal server error' });
  }
};