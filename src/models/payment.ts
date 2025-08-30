import { Sequelize, DataTypes, Model } from 'sequelize';
import { PaymentAttributes, PaymentCreationAttributes, PaymentInstance, PaymentStatus, PaymentMethod } from '../types';
import { generateULID } from '../utils/ulid';

export default function(sequelize: Sequelize) {
  class Payment extends Model<PaymentAttributes, PaymentCreationAttributes> implements PaymentInstance {
    public id!: string;
    public donationId!: string;
    public externalId!: string;
    public xenditId?: string;
    public amount!: number;
    public currency!: string;
    public method!: PaymentMethod;
    public status!: PaymentStatus;
    public paymentUrl?: string;
    public virtualAccount?: {
      bankCode: string;
      accountNumber: string;
    };
    public ewalletType?: string;
    public paidAt?: Date;
    public expiredAt?: Date;
    public failureCode?: string;
    public webhookData?: Record<string, any>;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public toJSON(): PaymentAttributes {
      return { ...this.get() } as PaymentAttributes;
    }

    static associate(models: any) {
      Payment.belongsTo(models.Donation, {
        foreignKey: 'donationId',
        as: 'donation'
      });
    }
  }

  Payment.init({
    id: {
      type: DataTypes.STRING(26),
      defaultValue: generateULID,
      primaryKey: true
    },
    donationId: {
      type: DataTypes.STRING(26),
      allowNull: false,
      references: {
        model: 'donations',
        key: 'id'
      }
    },
    externalId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    xenditId: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(15, 0),
      allowNull: false,
      validate: {
        min: 1000 // Minimum 1,000 IDR
      }
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'IDR'
    },
    method: {
      type: DataTypes.ENUM(...Object.values(PaymentMethod)),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM(...Object.values(PaymentStatus)),
      allowNull: false,
      defaultValue: PaymentStatus.PENDING
    },
    paymentUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    virtualAccount: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    ewalletType: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expiredAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    failureCode: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    webhookData: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize,
    timestamps: true,
    tableName: 'payments',
    underscored: true,
    hooks: {
      afterUpdate: async (payment: Payment) => {
        // Update donation status when payment status changes
        if (payment.status === PaymentStatus.PAID) {
          const { Donation } = sequelize.models;
          const donation = await Donation.findByPk(payment.donationId) as any;
          if (donation && donation.paymentStatus !== 'PAID') {
            await donation.update({ paymentStatus: 'PAID' });
          }
        }
      }
    }
  });

  return Payment;
}