import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  initializeUploadDirectories,
  processAvatar,
  processProjectImage,
  deleteImage,
  generateFilename,
  validateImageDimensions,
  handleUploadError,
  uploadAvatar,
  uploadProjectImages,
  uploadSingleProjectImage
} from '../utils/imageUpload';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

// Mock logger
jest.mock('../config/logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  })
}));

// Create test image buffer
const createTestImageBuffer = async (width = 500, height = 500): Promise<Buffer> => {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
    .jpeg()
    .toBuffer();
};

describe('ImageUpload Utils', () => {
  const testUploadsDir = path.join(process.cwd(), 'uploads');
  const testAvatarsDir = path.join(testUploadsDir, 'avatars');
  const testProjectsDir = path.join(testUploadsDir, 'projects');

  beforeAll(() => {
    // Ensure upload directories exist
    [testUploadsDir, testAvatarsDir, testProjectsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  });

  afterEach(async () => {
    // Clean up any existing test files with delay to avoid file locking
    await new Promise(resolve => setTimeout(resolve, 100));
    
    [testAvatarsDir, testProjectsDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          if (file.startsWith('test-')) {
            try {
              fs.unlinkSync(path.join(dir, file));
            } catch (error) {
              // Ignore file locking errors on Windows
            }
          }
        });
      }
    });
  });

  describe('initializeUploadDirectories', () => {
    it('should create upload directories successfully', () => {
      // Remove directories if they exist
      if (fs.existsSync(testUploadsDir)) {
        fs.rmSync(testUploadsDir, { recursive: true });
      }

      expect(() => initializeUploadDirectories()).not.toThrow();
      
      expect(fs.existsSync(testUploadsDir)).toBe(true);
      expect(fs.existsSync(testAvatarsDir)).toBe(true);
      expect(fs.existsSync(testProjectsDir)).toBe(true);
    });

    it('should verify existing directories have write permissions', () => {
      // Directories should already exist from previous test
      expect(() => initializeUploadDirectories()).not.toThrow();
    });
  });

  describe('generateFilename', () => {
    it('should generate unique filenames', () => {
      const filename1 = generateFilename('test.jpg');
      const filename2 = generateFilename('test.jpg');
      
      expect(filename1).not.toBe(filename2);
      expect(filename1).toMatch(/^\d+-[a-f0-9]{8}\.jpg$/);
    });

    it('should handle filename without extension', () => {
      const filename = generateFilename();
      expect(filename).toMatch(/^\d+-[a-f0-9]{8}$/);
    });

    it('should preserve extension case', () => {
      const filename = generateFilename('test.JPG');
      expect(filename).toMatch(/\.jpg$/);
    });
  });

  describe('processAvatar', () => {
    it('should process and save avatar image successfully', async () => {
      const buffer = await createTestImageBuffer();
      const filename = `test-avatar-${Date.now()}`;

      const result = await processAvatar(buffer, filename);
      
      expect(result).toBe(`/uploads/avatars/${filename}.webp`);
      
      const outputPath = path.join(testAvatarsDir, `${filename}.webp`);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify image dimensions
      const metadata = await sharp(outputPath).metadata();
      expect(metadata.width).toBe(400);
      expect(metadata.height).toBe(400);
      expect(metadata.format).toBe('webp');
    });

    it('should handle invalid image buffer', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      const filename = `test-invalid-${Date.now()}`;

      await expect(processAvatar(invalidBuffer, filename))
        .rejects.toThrow('Failed to process avatar image');
    });
  });

  describe('processProjectImage', () => {
    it('should process and save project image successfully', async () => {
      const buffer = await createTestImageBuffer();
      const filename = `test-project-${Date.now()}`;

      const result = await processProjectImage(buffer, filename);
      
      expect(result).toBe(`/uploads/projects/${filename}.webp`);
      
      const outputPath = path.join(testProjectsDir, `${filename}.webp`);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify image dimensions
      const metadata = await sharp(outputPath).metadata();
      expect(metadata.width).toBe(800);
      expect(metadata.height).toBe(600);
      expect(metadata.format).toBe('webp');
    });

    it('should handle invalid image buffer', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      const filename = `test-invalid-project-${Date.now()}`;

      await expect(processProjectImage(invalidBuffer, filename))
        .rejects.toThrow('Failed to process project image');
    });
  });

  describe('deleteImage', () => {
    it('should delete existing image file', async () => {
      const buffer = await createTestImageBuffer();
      const filename = `test-delete-${Date.now()}`;
      const imagePath = await processAvatar(buffer, filename);

      const fullPath = path.join(process.cwd(), imagePath);
      expect(fs.existsSync(fullPath)).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for file to be released
      await deleteImage(imagePath);
      
      expect(fs.existsSync(fullPath)).toBe(false);
    });

    it('should handle non-existent file gracefully', async () => {
      const nonExistentPath = '/uploads/avatars/non-existent.webp';
      
      await expect(deleteImage(nonExistentPath)).resolves.toBeUndefined();
    });
  });

  describe('validateImageDimensions middleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
      req = {};
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      next = jest.fn();
    });

    it('should pass validation for valid dimensions', async () => {
      const buffer = await createTestImageBuffer(500, 500);
      req.file = {
        buffer,
        originalname: 'test.jpg',
        mimetype: 'image/jpeg'
      } as Express.Multer.File;

      const middleware = validateImageDimensions(100, 100);
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject images below minimum dimensions', async () => {
      const buffer = await createTestImageBuffer(50, 50);
      req.file = {
        buffer,
        originalname: 'test.jpg',
        mimetype: 'image/jpeg'
      } as Express.Multer.File;

      const middleware = validateImageDimensions(100, 100);
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Image dimensions must be at least 100x100 pixels'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle array of files', async () => {
      const buffer1 = await createTestImageBuffer(200, 200);
      const buffer2 = await createTestImageBuffer(300, 300);
      
      req.files = [
        { buffer: buffer1, originalname: 'test1.jpg', mimetype: 'image/jpeg' },
        { buffer: buffer2, originalname: 'test2.jpg', mimetype: 'image/jpeg' }
      ] as Express.Multer.File[];

      const middleware = validateImageDimensions(150, 150);
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle invalid image buffer', async () => {
      req.file = {
        buffer: Buffer.from('invalid'),
        originalname: 'test.jpg',
        mimetype: 'image/jpeg'
      } as Express.Multer.File;

      const middleware = validateImageDimensions(100, 100);
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid image file'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('handleUploadError middleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
      req = {};
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      next = jest.fn();
    });

    it('should handle LIMIT_FILE_SIZE error', () => {
      const error = new multer.MulterError('LIMIT_FILE_SIZE');
      
      handleUploadError(error, req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'File too large. Maximum size is 5MB per image.'
      });
    });

    it('should handle LIMIT_FILE_COUNT error', () => {
      const error = new multer.MulterError('LIMIT_FILE_COUNT');
      
      handleUploadError(error, req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Too many files. Maximum 10 images allowed.'
      });
    });

    it('should handle LIMIT_UNEXPECTED_FILE error', () => {
      const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
      
      handleUploadError(error, req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Unexpected file field. Please check your form field names.'
      });
    });

    it('should handle file type validation error', () => {
      const error = new Error('Only JPEG, PNG, and WebP images are allowed');
      
      handleUploadError(error, req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Only JPEG, PNG, and WebP images are allowed'
      });
    });

    it('should handle generic errors', () => {
      const error = new Error('Generic error');
      
      handleUploadError(error, req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Image upload failed'
      });
    });
  });
});