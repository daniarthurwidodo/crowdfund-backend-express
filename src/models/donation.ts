import { Sequelize, DataTypes, Model } from 'sequelize';
import { DonationAttributes, DonationCreationAttributes, DonationInstance, PaymentStatus, PaymentMethod } from '../types';
import { generateULID } from '../utils/ulid';

export default function(sequelize: Sequelize) {
  class Donation extends Model<DonationAttributes, DonationCreationAttributes> implements DonationInstance {
    public id!: string;
    public amount!: number;
    public paymentStatus!: PaymentStatus;
    public paymentMethod?: PaymentMethod;
    public isAnonymous!: boolean;
    public donorName?: string;
    public message?: string;
    public projectId!: string;
    public userId?: string;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public toJSON(): DonationAttributes {
      const values = { ...this.get() } as DonationAttributes;
      if (this.isAnonymous) {
        delete (values as any).userId;
        values.donorName = 'Anonymous';
      }
      return values;
    }

    static associate(models: any) {
      Donation.belongsTo(models.Project, {
        foreignKey: 'projectId',
        as: 'project'
      });
      Donation.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      });
      Donation.hasMany(models.Payment, {
        foreignKey: 'donationId',
        as: 'payments'
      });
    }
  }

  Donation.init({
    id: {
      type: DataTypes.STRING(26),
      defaultValue: generateULID,
      primaryKey: true
    },
    amount: {
      type: DataTypes.DECIMAL(15, 0),
      allowNull: false,
      validate: {
        min: 1000
      }
    },
    paymentStatus: {
      type: DataTypes.ENUM(...Object.values(PaymentStatus)),
      allowNull: false,
      defaultValue: PaymentStatus.PENDING
    },
    paymentMethod: {
      type: DataTypes.ENUM(...Object.values(PaymentMethod)),
      allowNull: true
    },
    isAnonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    donorName: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [1, 100]
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: [1, 500]
      }
    },
    projectId: {
      type: DataTypes.STRING(26),
      allowNull: false,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.STRING(26),
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
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
    tableName: 'donations',
    underscored: true,
    hooks: {
      afterUpdate: async (donation: Donation) => {
        // Only process project amount updates when payment is confirmed
        if (donation.paymentStatus === PaymentStatus.PAID) {
          const { Project } = sequelize.models;
          const project = await Project.findByPk(donation.projectId) as any;
          if (project) {
            // Check if this is the first time the payment is being marked as paid
            const previousValues = donation.previous() as any;
            if (previousValues?.paymentStatus !== PaymentStatus.PAID) {
              await project.increment('currentAmount', { by: donation.amount });
              await project.reload();
              if ((project.get('currentAmount') as number) >= (project.get('targetAmount') as number)) {
                await project.update({ status: 'CLOSED' });
              }
            }
          }
        }
      }
    }
  });

  return Donation;
}