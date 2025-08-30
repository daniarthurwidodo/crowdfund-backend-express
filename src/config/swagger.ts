import swaggerJsdoc from 'swagger-jsdoc';
import { Options } from 'swagger-jsdoc';

const options: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Crowdfund Backend API',
      version: '1.0.0',
      description: 'A comprehensive crowdfunding backend API built with Express.js, TypeScript, Sequelize, PostgreSQL, and Redis',
      contact: {
        name: 'API Support',
        email: 'support@crowdfund.com'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: [
    './src/routes/*.ts',
    './src/models/*.ts'
  ]
};

export const specs = swaggerJsdoc(options);
export default specs;