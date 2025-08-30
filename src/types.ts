import { Model } from 'sequelize';

declare global {
  namespace Express {
    interface Request {
      user?: UserInstance;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export interface UserAttributes {
  id: string;
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreationAttributes extends Omit<UserAttributes, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserInstance extends Model<UserAttributes, UserCreationAttributes>, UserAttributes {
  validatePassword(password: string): Promise<boolean>;
  toJSON(): Omit<UserAttributes, 'password'>;
}