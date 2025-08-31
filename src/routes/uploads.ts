import { Router } from 'express';
import {
  uploadAvatar,
  uploadProjectImages,
  uploadSingleProjectImage,
  handleUploadError,
  processAvatar,
  processProjectImage,
  generateFilename,
  validateImageDimensions,
} from '../utils/imageUpload';
import { authenticateToken } from '../middleware/auth';
import { User, Project } from '../models';
import { createChildLogger } from '../config/logger';
import fs from 'fs';
import path from 'path';

const router = Router();
const logger = createChildLogger('UploadsController');

/**
 * @swagger
 * /api/uploads/check-folders:
 *   get:
 *     summary: Check upload folders existence and write permissions
 *     tags: [Uploads]
 *     responses:
 *       200:
 *         description: Folder status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 avatars:
 *                   type: object
 *                   properties:
 *                     exists:
 *                       type: boolean
 *                     writable:
 *                       type: boolean
 *                 projects:
 *                   type: object
 *                   properties:
 *                     exists:
 *                       type: boolean
 *                     writable:
 *                       type: boolean
 *       500:
 *         description: Server error
 */
router.get('/check-folders', (req, res) => {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const avatarsDir = path.join(uploadsDir, 'avatars');
    const projectsDir = path.join(uploadsDir, 'projects');

    function checkFolder(folderPath: string) {
      let exists = false;
      let writable = false;
      try {
        exists = fs.existsSync(folderPath);
        if (exists) {
          fs.accessSync(folderPath, fs.constants.W_OK);
          writable = true;
        }
      } catch (e) {
        writable = false;
      }
      return { exists, writable };
    }

    const avatars = checkFolder(avatarsDir);
    const projects = checkFolder(projectsDir);

    res.json({ avatars, projects });
  } catch (error) {
    logger.error({ err: error }, 'Error checking upload folders');
    res.status(500).json({ message: 'Failed to check upload folders' });
  }
});

/**
 * @swagger
 * /api/uploads/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Uploads]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Avatar image file (JPEG, PNG, WebP, max 5MB)
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 avatarUrl:
 *                   type: string
 *       400:
 *         description: No avatar file provided or invalid file type/size
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Server error
 */
router.post(
  '/avatar',
  authenticateToken,
  uploadAvatar,
  validateImageDimensions(100, 100),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No avatar file provided' });
      }

      if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const filename = generateFilename(req.file.originalname);
      const avatarUrl = await processAvatar(req.file.buffer, filename);

      await User.update({ avatar: avatarUrl }, { where: { id: req.user.id } });

      logger.info(`Avatar uploaded for user ${req.user.id}: ${avatarUrl}`);

      res.json({
        message: 'Avatar uploaded successfully',
        avatarUrl,
      });
    } catch (error: any) {
      logger.error(
        { err: error, userId: req.user?.id },
        'Error uploading avatar'
      );
      res.status(500).json({ message: 'Failed to upload avatar' });
    }
  }
);

/**
 * @swagger
 * /api/uploads/project/{projectId}/images:
 *   post:
 *     summary: Upload multiple project images
 *     tags: [Uploads]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID (ULID format)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Project image files (JPEG, PNG, WebP, max 5MB each, max 10 files)
 *     responses:
 *       200:
 *         description: Images uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 imageUrls:
 *                   type: array
 *                   items:
 *                     type: string
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid files or upload error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to modify this project
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.post(
  '/project/:projectId/images',
  authenticateToken,
  uploadProjectImages,
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const files = (req.files as Express.Multer.File[]) || [];

      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No image files provided' });
      }

      if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      if (project.fundraiserId !== req.user.id && req.user.role !== 'ADMIN') {
        return res
          .status(403)
          .json({ message: 'Not authorized to modify this project' });
      }

      const imageUrls: string[] = [];
      for (const file of files) {
        const filename = generateFilename(file.originalname);
        const imageUrl = await processProjectImage(file.buffer, filename);
        imageUrls.push(imageUrl);
      }

      const existingImages = project.images || [];
      const updatedImages = [...existingImages, ...imageUrls];

      await project.update({ images: updatedImages });
      await project.reload({
        include: [
          {
            model: User,
            as: 'fundraiser',
            attributes: ['id', 'username', 'firstName', 'lastName'],
          },
        ],
      });

      logger.info(
        `${imageUrls.length} images uploaded for project ${projectId}`
      );

      res.json({
        message: 'Images uploaded successfully',
        imageUrls,
        project,
      });
    } catch (error: any) {
      logger.error(
        { err: error, projectId: req.params.projectId, userId: req.user?.id },
        'Error uploading project images'
      );
      res.status(500).json({ message: 'Failed to upload project images' });
    }
  }
);

/**
 * @swagger
 * /api/uploads/project/{projectId}/image:
 *   post:
 *     summary: Upload single project image
 *     tags: [Uploads]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID (ULID format)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Project image file (JPEG, PNG, WebP, max 5MB)
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 imageUrl:
 *                   type: string
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid file or upload error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to modify this project
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.post(
  '/project/:projectId/image',
  authenticateToken,
  uploadSingleProjectImage,
  validateImageDimensions(400, 300),
  async (req, res) => {
    try {
      const { projectId } = req.params;

      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }

      if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      if (project.fundraiserId !== req.user.id && req.user.role !== 'ADMIN') {
        return res
          .status(403)
          .json({ message: 'Not authorized to modify this project' });
      }

      const filename = generateFilename(req.file.originalname);
      const imageUrl = await processProjectImage(req.file.buffer, filename);

      const existingImages = project.images || [];
      const updatedImages = [...existingImages, imageUrl];

      await project.update({ images: updatedImages });
      await project.reload({
        include: [
          {
            model: User,
            as: 'fundraiser',
            attributes: ['id', 'username', 'firstName', 'lastName'],
          },
        ],
      });

      logger.info(`Image uploaded for project ${projectId}: ${imageUrl}`);

      res.json({
        message: 'Image uploaded successfully',
        imageUrl,
        project,
      });
    } catch (error: any) {
      logger.error(
        { err: error, projectId: req.params.projectId, userId: req.user?.id },
        'Error uploading project image'
      );
      res.status(500).json({ message: 'Failed to upload project image' });
    }
  }
);

// Error handling middleware for multer/image upload issues
router.use(handleUploadError);

export default router;
