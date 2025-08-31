import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Joi from 'joi';
import { Project, User, Donation } from '../models';
import { ProjectStatus, UserRole } from '../types';
import { createChildLogger } from '../config/logger';
import { deleteImage } from '../utils/imageUpload';

const logger = createChildLogger('ProjectController');

// Helper function to clean up project images
const cleanupProjectImages = async (images: string[]): Promise<void> => {
  for (const imagePath of images) {
    try {
      await deleteImage(imagePath);
      logger.info(`Cleaned up project image: ${imagePath}`);
    } catch (error) {
      logger.error(
        { err: error, imagePath },
        'Failed to cleanup project image'
      );
    }
  }
};

// Helper function to check project ownership or admin
const checkProjectAuthorization = (
  project: any,
  userId: string,
  userRole: string
): boolean => {
  return userRole === UserRole.ADMIN || project.fundraiserId === userId;
};

// Helper function to validate image URLs
const validateImageUrls = (images: string[]): boolean => {
  const urlRegex =
    /^\/uploads\/(projects|avatars)\/[^/]+\.(webp|jpg|jpeg|png)$/i;
  return images.every(url => urlRegex.test(url));
};

const projectSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().min(20).max(5000).required(),
  images: Joi.array().items(Joi.string().uri()).max(10).optional(),
  targetAmount: Joi.number().integer().min(1000).max(10000000000).required(), // Min 1,000 IDR, Max 10B IDR
  startDate: Joi.date().required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).required(),
});

const updateProjectSchema = Joi.object({
  title: Joi.string().min(5).max(200).optional(),
  description: Joi.string().min(20).max(5000).optional(),
  images: Joi.array().items(Joi.string().uri()).max(10).optional(),
  targetAmount: Joi.number().integer().min(1000).max(10000000000).optional(), // Min 1,000 IDR, Max 10B IDR
  endDate: Joi.date().optional(),
  status: Joi.string()
    .valid(...Object.values(ProjectStatus))
    .optional(),
});

export const createProject = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = projectSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    if (
      req.user?.role !== UserRole.FUNDRAISER &&
      req.user?.role !== UserRole.ADMIN
    ) {
      res.status(403).json({ message: 'Only fundraisers can create projects' });
      return;
    }

    const project = await Project.create({
      ...value,
      fundraiserId: req.user.id,
    });

    const createdProject = await Project.findByPk(project.id, {
      include: [
        {
          model: User,
          as: 'fundraiser',
          attributes: ['id', 'username', 'firstName', 'lastName'],
        },
      ],
    });

    res.status(201).json({
      message: 'Project created successfully',
      project: createdProject,
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error creating project'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getProjects = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const {
      search,
      status,
      fundraiser,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = req.query;

    const whereClause: any = {};
    const having: any = {};

    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (status) {
      whereClause.status = status;
    }

    if (fundraiser) {
      whereClause.fundraiserId = fundraiser;
    }

    if (minAmount) {
      whereClause.targetAmount = { [Op.gte]: minAmount };
    }

    if (maxAmount) {
      whereClause.targetAmount = {
        ...whereClause.targetAmount,
        [Op.lte]: maxAmount,
      };
    }

    const validSortFields = [
      'createdAt',
      'title',
      'targetAmount',
      'currentAmount',
      'endDate',
    ];
    const sortField = validSortFields.includes(sortBy as string)
      ? (sortBy as string)
      : 'createdAt';
    const sortDirection = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows: projects } = await Project.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'fundraiser',
          attributes: ['id', 'username', 'firstName', 'lastName'],
        },
        {
          model: Donation,
          as: 'donations',
          attributes: [],
        },
      ],
      attributes: {
        include: [
          [
            (Project as any).sequelize.fn(
              'COUNT',
              (Project as any).sequelize.col('donations.id')
            ),
            'donationCount',
          ],
        ],
      },
      group: ['Project.id', 'fundraiser.id'],
      having,
      limit,
      offset,
      order: [[sortField, sortDirection]],
      distinct: true,
      subQuery: false,
    });

    const totalItems = Array.isArray(count) ? count.length : count;
    const totalPages = Math.ceil(totalItems / limit);

    res.json({
      projects,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    logger.error({ err: error, query: req.query }, 'Error fetching projects');
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getProjectById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await Project.findByPk(id, {
      include: [
        {
          model: User,
          as: 'fundraiser',
          attributes: ['id', 'username', 'firstName', 'lastName'],
        },
        {
          model: Donation,
          as: 'donations',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'firstName', 'lastName'],
            },
          ],
          order: [['createdAt', 'DESC']],
        },
      ],
    });

    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    res.json({ project });
  } catch (error: any) {
    logger.error(
      { err: error, projectId: req.params.id },
      'Error fetching project'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateProject = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { error, value } = updateProjectSchema.validate(req.body);

    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    const project = await Project.findByPk(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    // Enhanced authorization check
    if (
      !req.user ||
      !checkProjectAuthorization(project, req.user.id, req.user.role)
    ) {
      res
        .status(403)
        .json({ message: 'Not authorized to update this project' });
      return;
    }

    // Prevent updates to closed projects (except by admins)
    if (
      project.status === ProjectStatus.CLOSED &&
      req.user?.role !== UserRole.ADMIN
    ) {
      res.status(400).json({ message: 'Cannot update closed project' });
      return;
    }

    if (value.endDate && value.endDate <= new Date()) {
      res.status(400).json({ message: 'End date must be in the future' });
      return;
    }

    // Validate image URLs if provided
    if (value.images && value.images.length > 0) {
      if (!validateImageUrls(value.images)) {
        res.status(400).json({
          message:
            'Invalid image URLs. Images must be uploaded through the proper upload endpoint.',
        });
        return;
      }
    }

    // Clean up old images if images are being updated
    if (value.images && project.images) {
      const oldImages = project.images || [];
      const newImages = value.images || [];
      const imagesToDelete = oldImages.filter(
        (img: string) => !newImages.includes(img)
      );

      if (imagesToDelete.length > 0) {
        // Clean up old images asynchronously to not block the response
        cleanupProjectImages(imagesToDelete).catch(error => {
          logger.error(
            { err: error, projectId: id },
            'Failed to cleanup old project images'
          );
        });
      }
    }

    await project.update(value);
    await project.reload({
      include: [
        {
          model: User,
          as: 'fundraiser',
          attributes: ['id', 'username', 'firstName', 'lastName'],
        },
      ],
    });

    logger.info(`Project ${id} updated by user ${req.user?.id}`);

    res.json({
      message: 'Project updated successfully',
      project,
    });
  } catch (error: any) {
    logger.error(
      { err: error, projectId: req.params.id, userId: req.user?.id },
      'Error updating project'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteProject = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await Project.findByPk(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    // Enhanced authorization check
    if (
      !req.user ||
      !checkProjectAuthorization(project, req.user.id, req.user.role)
    ) {
      res
        .status(403)
        .json({ message: 'Not authorized to delete this project' });
      return;
    }

    // Only allow deletion of projects with no donations (or allow admins to force delete)
    if (project.currentAmount > 0 && req.user?.role !== UserRole.ADMIN) {
      res.status(400).json({
        message: 'Cannot delete project with donations. Contact administrator.',
      });
      return;
    }

    // Store images to clean up after deletion
    const imagesToCleanup = project.images || [];

    await project.destroy();

    // Clean up project images after successful deletion
    if (imagesToCleanup.length > 0) {
      cleanupProjectImages(imagesToCleanup).catch(error => {
        logger.error(
          { err: error, projectId: id },
          'Failed to cleanup project images after deletion'
        );
      });
    }

    logger.info(`Project ${id} deleted by user ${req.user?.id}`);
    res.json({ message: 'Project deleted successfully' });
  } catch (error: any) {
    logger.error(
      { err: error, projectId: req.params.id, userId: req.user?.id },
      'Error deleting project'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const removeProjectImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
      res.status(400).json({ message: 'Image URL is required' });
      return;
    }

    const project = await Project.findByPk(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    // Enhanced authorization check
    if (
      !req.user ||
      !checkProjectAuthorization(project, req.user.id, req.user.role)
    ) {
      res
        .status(403)
        .json({ message: 'Not authorized to modify this project' });
      return;
    }

    const currentImages = project.images || [];
    if (!currentImages.includes(imageUrl)) {
      res.status(400).json({ message: 'Image not found in project' });
      return;
    }

    // Remove image from project
    const updatedImages = currentImages.filter(
      (img: string) => img !== imageUrl
    );
    await project.update({ images: updatedImages });

    // Clean up the image file
    try {
      await deleteImage(imageUrl);
      logger.info(`Removed image ${imageUrl} from project ${id}`);
    } catch (error) {
      logger.error({ err: error, imageUrl }, 'Failed to delete image file');
    }

    await project.reload({
      include: [
        {
          model: User,
          as: 'fundraiser',
          attributes: ['id', 'username', 'firstName', 'lastName'],
        },
      ],
    });

    res.json({
      message: 'Image removed successfully',
      project,
    });
  } catch (error: any) {
    logger.error(
      { err: error, projectId: req.params.id, userId: req.user?.id },
      'Error removing project image'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getMyProjects = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const { status, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;
    const whereClause: any = { fundraiserId: req.user?.id };

    if (status) {
      whereClause.status = status;
    }

    const validSortFields = [
      'createdAt',
      'title',
      'targetAmount',
      'currentAmount',
      'endDate',
    ];
    const sortField = validSortFields.includes(sortBy as string)
      ? (sortBy as string)
      : 'createdAt';
    const sortDirection = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows: projects } = await Project.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Donation,
          as: 'donations',
          attributes: [],
        },
      ],
      attributes: {
        include: [
          [
            (Project as any).sequelize.fn(
              'COUNT',
              (Project as any).sequelize.col('donations.id')
            ),
            'donationCount',
          ],
          [
            (Project as any).sequelize.fn(
              'SUM',
              (Project as any).sequelize.col('donations.amount')
            ),
            'totalRaised',
          ],
        ],
      },
      group: ['Project.id'],
      limit,
      offset,
      order: [[sortField, sortDirection]],
    });

    const totalItems = Array.isArray(count) ? count.length : count;
    const totalPages = Math.ceil(totalItems / limit);

    res.json({
      projects,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error fetching user projects'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};
