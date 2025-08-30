import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import {
  createDonation,
  getDonations,
  getDonationById,
  getMyDonations,
  getProjectDonations
} from '../controllers/donationController';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Donation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the donation
 *         amount:
 *           type: number
 *           minimum: 1
 *           description: Donation amount
 *         isAnonymous:
 *           type: boolean
 *           description: Whether the donation is anonymous
 *         donorName:
 *           type: string
 *           description: Name of the donor
 *         message:
 *           type: string
 *           maxLength: 500
 *           description: Optional message from donor
 *         projectId:
 *           type: string
 *           description: ID of the project being donated to
 *         userId:
 *           type: string
 *           description: ID of the user making the donation (null for anonymous)
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateDonation:
 *       type: object
 *       required:
 *         - amount
 *         - projectId
 *       properties:
 *         amount:
 *           type: number
 *           minimum: 1
 *         isAnonymous:
 *           type: boolean
 *           default: false
 *         donorName:
 *           type: string
 *           maxLength: 100
 *           description: Required for anonymous donations
 *         message:
 *           type: string
 *           maxLength: 500
 *         projectId:
 *           type: string
 */

/**
 * @swagger
 * /api/donations:
 *   get:
 *     summary: Get all donations with pagination and filters
 *     tags: [Donations]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *       - in: query
 *         name: isAnonymous
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, amount]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *     responses:
 *       200:
 *         description: List of donations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 donations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Donation'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalItems:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 */
router.get('/', getDonations);

/**
 * @swagger
 * /api/donations:
 *   post:
 *     summary: Create a new donation
 *     tags: [Donations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDonation'
 *     responses:
 *       201:
 *         description: Donation created successfully
 *       400:
 *         description: Validation error or project cannot receive donations
 *       404:
 *         description: Project not found
 */
router.post('/', optionalAuth, createDonation);

/**
 * @swagger
 * /api/donations/my:
 *   get:
 *     summary: Get current user's donations
 *     tags: [Donations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, amount]
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *     responses:
 *       200:
 *         description: User's donations
 *       401:
 *         description: Unauthorized
 */
router.get('/my', authenticateToken, getMyDonations);

/**
 * @swagger
 * /api/donations/project/{projectId}:
 *   get:
 *     summary: Get donations for a specific project
 *     tags: [Donations]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, amount]
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *     responses:
 *       200:
 *         description: Project donations with statistics
 *       404:
 *         description: Project not found
 */
router.get('/project/:projectId', getProjectDonations);

/**
 * @swagger
 * /api/donations/{id}:
 *   get:
 *     summary: Get donation by ID
 *     tags: [Donations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Donation details
 *       404:
 *         description: Donation not found
 */
router.get('/:id', getDonationById);

export default router;