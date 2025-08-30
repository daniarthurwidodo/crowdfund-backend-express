import { Sequelize, DataTypes, Model } from 'sequelize';
import { DonationAttributes, DonationCreationAttributes, DonationInstance } from '../types';

export default function(sequelize: Sequelize) {
  class Donation extends Model<DonationAttributes, DonationCreationAttributes> implements DonationInstance {
    public id!: string;
    public amount!: number;
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
    }
  }

  Donation.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    amount: {
      type: DataTypes.DECIMAL(15, 0),
      allowNull: false,
      validate: {
        min: 1000
      }
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
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
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
    hooks: {
      afterCreate: async (donation: Donation) => {
        const { Project } = sequelize.models;
        const project = await Project.findByPk(donation.projectId) as any;
        if (project) {
          await project.increment('currentAmount', { by: donation.amount });
          await project.reload();
          if ((project.get('currentAmount') as number) >= (project.get('targetAmount') as number)) {
            await project.update({ status: 'CLOSED' });
          }
        }
      }
    }
  });

  return Donation;
}