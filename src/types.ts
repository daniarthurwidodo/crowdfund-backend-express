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

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  FUNDRAISER = 'FUNDRAISER'
}

export interface UserAttributes {
  id: string;
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  avatar?: string;
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

export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED'
}

export interface ProjectAttributes {
  id: string;
  title: string;
  description: string;
  images?: string[];
  targetAmount: number;
  currentAmount: number;
  startDate: Date;
  endDate: Date;
  status: ProjectStatus;
  fundraiserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectCreationAttributes extends Omit<ProjectAttributes, 'id' | 'currentAmount' | 'createdAt' | 'updatedAt'> {
  id?: string;
  currentAmount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProjectInstance extends Model<ProjectAttributes, ProjectCreationAttributes>, ProjectAttributes {
  toJSON(): ProjectAttributes;
}

export interface DonationAttributes {
  id: string;
  amount: number;
  isAnonymous: boolean;
  donorName?: string;
  message?: string;
  projectId: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DonationCreationAttributes extends Omit<DonationAttributes, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DonationInstance extends Model<DonationAttributes, DonationCreationAttributes>, DonationAttributes {
  toJSON(): DonationAttributes;
}