import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('ImageUpload');

// Ensure upload directories exist
const uploadsDir = path.join(process.cwd(), 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
const projectsDir = path.join(uploadsDir, 'projects');

[uploadsDir, avatarsDir, projectsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
});

// Image processing configurations
const AVATAR_SIZE = 400;
const PROJECT_IMAGE_WIDTH = 800;
const PROJECT_IMAGE_HEIGHT = 600;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Multer configuration
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10 // Maximum 10 files for project images
  }
});

// Process and save avatar image
export const processAvatar = async (buffer: Buffer, filename: string): Promise<string> => {
  try {
    const outputPath = path.join(avatarsDir, `${filename}.webp`);
    
    await sharp(buffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 85 })
      .toFile(outputPath);

    const relativePath = `/uploads/avatars/${filename}.webp`;
    logger.info(`Avatar processed and saved: ${relativePath}`);
    return relativePath;
  } catch (error) {
    logger.error({ err: error }, 'Error processing avatar');
    throw new Error('Failed to process avatar image');
  }
};

// Process and save project image
export const processProjectImage = async (buffer: Buffer, filename: string): Promise<string> => {
  try {
    const outputPath = path.join(projectsDir, `${filename}.webp`);
    
    await sharp(buffer)
      .resize(PROJECT_IMAGE_WIDTH, PROJECT_IMAGE_HEIGHT, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 85 })
      .toFile(outputPath);

    const relativePath = `/uploads/projects/${filename}.webp`;
    logger.info(`Project image processed and saved: ${relativePath}`);
    return relativePath;
  } catch (error) {
    logger.error({ err: error }, 'Error processing project image');
    throw new Error('Failed to process project image');
  }
};

// Delete image file
export const deleteImage = async (imagePath: string): Promise<void> => {
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      logger.info(`Deleted image: ${imagePath}`);
    }
  } catch (error) {
    logger.error({ err: error, imagePath }, 'Error deleting image');
  }
};

// Middleware for single avatar upload
export const uploadAvatar = upload.single('avatar');

// Middleware for multiple project images upload
export const uploadProjectImages = upload.array('images', 10);

// Middleware for single project image upload
export const uploadSingleProjectImage = upload.single('image');

// Error handling middleware for multer
export const handleUploadError = (error: any, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File too large. Maximum size is 5MB per image.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: 'Too many files. Maximum 10 images allowed.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'Unexpected file field. Please check your form field names.'
      });
    }
  }
  
  if (error.message === 'Only JPEG, PNG, and WebP images are allowed') {
    return res.status(400).json({
      message: error.message
    });
  }

  logger.error({ err: error }, 'Upload error');
  res.status(500).json({ message: 'Image upload failed' });
};

// Utility function to generate unique filename
export const generateFilename = (originalName?: string): string => {
  const timestamp = Date.now();
  const random = uuidv4().split('-')[0];
  const ext = originalName ? path.extname(originalName).toLowerCase() : '';
  return `${timestamp}-${random}${ext}`;
};

// Validate image dimensions (optional middleware)
export const validateImageDimensions = (minWidth = 100, minHeight = 100) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
      const file = req.file as Express.Multer.File;

      const filesToCheck: Express.Multer.File[] = [];
      
      if (file) {
        filesToCheck.push(file);
      } else if (Array.isArray(files)) {
        filesToCheck.push(...files);
      } else if (files && typeof files === 'object') {
        Object.values(files).forEach(fileArray => {
          if (Array.isArray(fileArray)) {
            filesToCheck.push(...fileArray);
          }
        });
      }

      for (const f of filesToCheck) {
        const metadata = await sharp(f.buffer).metadata();
        
        if (!metadata.width || !metadata.height) {
          return res.status(400).json({
            message: 'Unable to determine image dimensions'
          });
        }

        if (metadata.width < minWidth || metadata.height < minHeight) {
          return res.status(400).json({
            message: `Image dimensions must be at least ${minWidth}x${minHeight} pixels`
          });
        }
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Error validating image dimensions');
      res.status(400).json({
        message: 'Invalid image file'
      });
    }
  };
};