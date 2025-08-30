import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { 
  WithdrawAttributes, 
  WithdrawCreationAttributes, 
  WithdrawInstance,
  WithdrawStatus,
  WithdrawMethod
} from '../types';
import { generateULID } from '../utils/ulid';

class Withdraw extends Model<WithdrawAttributes, WithdrawCreationAttributes> implements WithdrawInstance {
  public id!: string;
  public userId!: string;
  public projectId!: string;
  public amount!: number;
  public availableAmount!: number;
  public currency!: string;
  public method!: WithdrawMethod;
  public status!: WithdrawStatus;
  public requestedAt!: Date;
  public approvedAt?: Date;
  public processedAt?: Date;
  public completedAt?: Date;
  public rejectedAt?: Date;
  public reason?: string;
  public adminNotes?: string;
  
  // Bank details
  public bankName?: string;
  public bankCode?: string;
  public accountNumber?: string;
  public accountHolderName?: string;
  
  // Xendit disbursement details
  public xenditDisbursementId?: string;
  public disbursementData?: any;
  
  // Fees and processing
  public processingFee!: number;
  public netAmount!: number;
  
  // Audit fields
  public approvedBy?: string;
  public processedBy?: string;
  public rejectedBy?: string;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public user?: any;
  public project?: any;
  public approver?: any;
  public processor?: any;
  public rejecter?: any;

  // Methods
  public async calculateProcessingFee(): Promise<number> {
    // Calculate processing fee based on method and amount
    let feeRate = 0;
    let fixedFee = 0;

    switch (this.method) {
      case WithdrawMethod.BANK_TRANSFER:
        feeRate = 0.005; // 0.5%
        fixedFee = 2500; // IDR 2,500 fixed fee
        break;
      case WithdrawMethod.XENDIT_DISBURSEMENT:
        feeRate = 0.003; // 0.3%
        fixedFee = 5000; // IDR 5,000 fixed fee
        break;
      case WithdrawMethod.MANUAL:
        feeRate = 0.01; // 1% for manual processing
        fixedFee = 0;
        break;
      default:
        feeRate = 0.005;
        fixedFee = 2500;
    }

    const percentageFee = Math.floor(Number(this.amount) * feeRate);
    const totalFee = percentageFee + fixedFee;
    
    // Cap the fee at 2% of the withdrawal amount
    const maxFee = Math.floor(Number(this.amount) * 0.02);
    return Math.min(totalFee, maxFee);
  }

  public async calculateNetAmount(): Promise<number> {
    const fee = await this.calculateProcessingFee();
    return Number(this.amount) - fee;
  }

  public canBeApproved(): boolean {
    return this.status === WithdrawStatus.PENDING;
  }

  public canBeRejected(): boolean {
    return [WithdrawStatus.PENDING, WithdrawStatus.PROCESSING].includes(this.status);
  }

  public canBeCancelled(): boolean {
    return [WithdrawStatus.PENDING, WithdrawStatus.PROCESSING, WithdrawStatus.APPROVED].includes(this.status);
  }

  public canBeProcessed(): boolean {
    return this.status === WithdrawStatus.APPROVED;
  }

  public isCompleted(): boolean {
    return [WithdrawStatus.COMPLETED, WithdrawStatus.REJECTED, WithdrawStatus.CANCELLED].includes(this.status);
  }

  public getDurationInHours(): number {
    const now = new Date();
    const requestTime = this.requestedAt;
    return Math.floor((now.getTime() - requestTime.getTime()) / (1000 * 60 * 60));
  }

  static associate(models: any) {
    Withdraw.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Withdraw.belongsTo(models.Project, { foreignKey: 'projectId', as: 'project' });
    Withdraw.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver' });
    Withdraw.belongsTo(models.User, { foreignKey: 'processedBy', as: 'processor' });
    Withdraw.belongsTo(models.User, { foreignKey: 'rejectedBy', as: 'rejecter' });
  }
}

Withdraw.init(
  {
    id: {
      type: DataTypes.STRING(26),
      primaryKey: true,
      defaultValue: () => generateULID()
    },
    userId: {
      type: DataTypes.STRING(26),
      allowNull: false,
      field: 'user_id'
    },
    projectId: {
      type: DataTypes.STRING(26),
      allowNull: false,
      field: 'project_id'
    },
    amount: {
      type: DataTypes.DECIMAL(15, 0),
      allowNull: false,
      get() {
        const value = this.getDataValue('amount');
        return value ? Number(value) : 0;
      }
    },
    availableAmount: {
      type: DataTypes.DECIMAL(15, 0),
      allowNull: false,
      field: 'available_amount',
      get() {
        const value = this.getDataValue('availableAmount');
        return value ? Number(value) : 0;
      }
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'IDR'
    },
    method: {
      type: DataTypes.ENUM(...Object.values(WithdrawMethod)),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM(...Object.values(WithdrawStatus)),
      allowNull: false,
      defaultValue: WithdrawStatus.PENDING
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'requested_at'
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at'
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_at'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    adminNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'admin_notes'
    },
    bankName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'bank_name'
    },
    bankCode: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'bank_code'
    },
    accountNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'account_number'
    },
    accountHolderName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'account_holder_name'
    },
    xenditDisbursementId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'xendit_disbursement_id'
    },
    disbursementData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'disbursement_data'
    },
    processingFee: {
      type: DataTypes.DECIMAL(15, 0),
      allowNull: false,
      defaultValue: 0,
      field: 'processing_fee',
      get() {
        const value = this.getDataValue('processingFee');
        return value ? Number(value) : 0;
      }
    },
    netAmount: {
      type: DataTypes.DECIMAL(15, 0),
      allowNull: false,
      defaultValue: 0,
      field: 'net_amount',
      get() {
        const value = this.getDataValue('netAmount');
        return value ? Number(value) : 0;
      }
    },
    approvedBy: {
      type: DataTypes.STRING(26),
      allowNull: true,
      field: 'approved_by'
    },
    processedBy: {
      type: DataTypes.STRING(26),
      allowNull: true,
      field: 'processed_by'
    },
    rejectedBy: {
      type: DataTypes.STRING(26),
      allowNull: true,
      field: 'rejected_by'
    }
  },
  {
    sequelize,
    tableName: 'withdrawals',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (withdraw: Withdraw) => {
        // Calculate processing fee and net amount before creation
        const processingFee = await withdraw.calculateProcessingFee();
        const netAmount = await withdraw.calculateNetAmount();
        
        withdraw.processingFee = processingFee;
        withdraw.netAmount = netAmount;
      },
      beforeUpdate: async (withdraw: Withdraw) => {
        // Update timestamps based on status changes
        const now = new Date();
        
        if (withdraw.changed('status')) {
          const newStatus = withdraw.status;
          
          switch (newStatus) {
            case WithdrawStatus.APPROVED:
              if (!withdraw.approvedAt) {
                withdraw.approvedAt = now;
              }
              break;
            case WithdrawStatus.PROCESSING:
              if (!withdraw.processedAt) {
                withdraw.processedAt = now;
              }
              break;
            case WithdrawStatus.COMPLETED:
              if (!withdraw.completedAt) {
                withdraw.completedAt = now;
              }
              break;
            case WithdrawStatus.REJECTED:
              if (!withdraw.rejectedAt) {
                withdraw.rejectedAt = now;
              }
              break;
          }
        }
      }
    }
  }
);

export default Withdraw;