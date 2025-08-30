import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Joi from 'joi';
import { Project, User, Donation } from '../models';
import { ProjectStatus } from '../types';

const donationSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  isAnonymous: Joi.boolean().default(false),
  donorName: Joi.string().min(1).max(100).when('isAnonymous', {
    is: true,
    then: Joi.optional(),
    otherwise: Joi.optional()
  }),
  message: Joi.string().max(500).optional(),
  projectId: Joi.string().uuid().required()
});

export const createDonation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = donationSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    const project = await Project.findByPk(value.projectId);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (project.status !== ProjectStatus.ACTIVE) {
      res.status(400).json({ message: 'Cannot donate to inactive project' });
      return;
    }

    if (new Date() > project.endDate) {
      res.status(400).json({ message: 'Project funding period has ended' });
      return;
    }

    if (project.currentAmount >= project.targetAmount) {
      res.status(400).json({ message: 'Project has already reached its funding goal' });
      return;
    }

    const donationData: any = {
      amount: value.amount,
      isAnonymous: value.isAnonymous,
      message: value.message,
      projectId: value.projectId
    };

    if (value.isAnonymous) {
      donationData.donorName = value.donorName || 'Anonymous';
    } else {
      donationData.userId = req.user?.id;
      donationData.donorName = req.user ? `${req.user.firstName} ${req.user.lastName}` : value.donorName;
    }

    const donation = await Donation.create(donationData);

    const createdDonation = await Donation.findByPk(donation.id, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title', 'targetAmount', 'currentAmount']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ]
    });

    res.status(201).json({
      message: 'Donation created successfully',
      donation: createdDonation
    });
  } catch (error: any) {
    console.error('Error creating donation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getDonations = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const { projectId, userId, minAmount, maxAmount, isAnonymous, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

    const whereClause: any = {};

    if (projectId) {
      whereClause.projectId = projectId;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    if (minAmount) {
      whereClause.amount = { [Op.gte]: minAmount };
    }

    if (maxAmount) {
      whereClause.amount = { ...whereClause.amount, [Op.lte]: maxAmount };
    }

    if (isAnonymous !== undefined) {
      whereClause.isAnonymous = isAnonymous === 'true';
    }

    const validSortFields = ['createdAt', 'amount'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const sortDirection = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows: donations } = await Donation.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title', 'status']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ],
      limit,
      offset,
      order: [[sortField, sortDirection]]
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      donations,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error: any) {
    console.error('Error fetching donations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getDonationById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const donation = await Donation.findByPk(id, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'title', 'status'],
          include: [{
            model: User,
            as: 'fundraiser',
            attributes: ['id', 'username', 'firstName', 'lastName']
          }]
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ]
    });

    if (!donation) {
      res.status(404).json({ message: 'Donation not found' });
      return;
    }

    res.json({ donation });
  } catch (error: any) {
    console.error('Error fetching donation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getMyDonations = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const { sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const whereClause: any = { userId: req.user?.id };

    const validSortFields = ['createdAt', 'amount'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const sortDirection = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows: donations } = await Donation.findAndCountAll({
      where: whereClause,
      include: [{
        model: Project,
        as: 'project',
        attributes: ['id', 'title', 'status', 'targetAmount', 'currentAmount'],
        include: [{
          model: User,
          as: 'fundraiser',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }]
      }],
      limit,
      offset,
      order: [[sortField, sortDirection]]
    });

    const totalPages = Math.ceil(count / limit);

    const totalDonated = await Donation.sum('amount', {
      where: { userId: req.user?.id }
    });

    res.json({
      donations,
      totalDonated: totalDonated || 0,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error: any) {
    console.error('Error fetching user donations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getProjectDonations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const project = await Project.findByPk(projectId);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const { sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const validSortFields = ['createdAt', 'amount'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const sortDirection = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows: donations } = await Donation.findAndCountAll({
      where: { projectId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName']
      }],
      limit,
      offset,
      order: [[sortField, sortDirection]]
    });

    const totalPages = Math.ceil(count / limit);

    const stats = {
      totalAmount: project.currentAmount,
      donationCount: count,
      averageDonation: count > 0 ? parseFloat((project.currentAmount / count).toFixed(2)) : 0
    };

    res.json({
      donations,
      stats,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error: any) {
    console.error('Error fetching project donations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};