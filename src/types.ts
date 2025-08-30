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
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
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

// Payment-related types
export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export enum PaymentMethod {
  INVOICE = 'INVOICE',
  VIRTUAL_ACCOUNT = 'VIRTUAL_ACCOUNT',
  EWALLET = 'EWALLET',
  CARD = 'CARD'
}

export interface PaymentAttributes {
  id: string;
  donationId: string;
  externalId: string; // Xendit external ID
  xenditId?: string; // Xendit internal ID
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paymentUrl?: string;
  virtualAccount?: {
    bankCode: string;
    accountNumber: string;
  };
  ewalletType?: string;
  paidAt?: Date;
  expiredAt?: Date;
  failureCode?: string;
  webhookData?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentCreationAttributes extends Omit<PaymentAttributes, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaymentInstance extends Model<PaymentAttributes, PaymentCreationAttributes>, PaymentAttributes {
  toJSON(): PaymentAttributes;
}

// Xendit API types
export interface XenditInvoiceRequest {
  external_id: string;
  amount: number;
  payer_email?: string;
  description: string;
  invoice_duration?: number;
  callback_virtual_account_id?: string;
  should_send_email?: boolean;
  should_authenticate_credit_card?: boolean;
  currency?: string;
  payment_methods?: string[];
}

export interface XenditVARequest {
  external_id: string;
  bank_code: string;
  name: string;
  expected_amount?: number;
  is_closed?: boolean;
  expiration_date?: string;
  is_single_use?: boolean;
}

export interface XenditEwalletRequest {
  external_id: string;
  amount: number;
  phone?: string;
  ewallet_type: string;
  callback_url?: string;
  redirect_url?: string;
}

export interface XenditWebhookPayload {
  id: string;
  external_id: string;
  user_id: string;
  is_high: boolean;
  payment_method: string;
  status: string;
  merchant_name: string;
  amount: number;
  paid_amount?: number;
  bank_code?: string;
  paid_at?: string;
  payer_email?: string;
  description: string;
  adjusted_received_amount?: number;
  fees_paid_amount?: number;
  updated: string;
  created: string;
  currency: string;
  payment_channel?: string;
  payment_destination?: string;
}