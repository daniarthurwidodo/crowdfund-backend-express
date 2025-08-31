import { Sequelize, DataTypes, Model } from 'sequelize';
import {
  ProjectAttributes,
  ProjectCreationAttributes,
  ProjectInstance,
  ProjectStatus,
} from '../types';
import { generateULID } from '../utils/ulid';

export default function (sequelize: Sequelize) {
  class Project
    extends Model<ProjectAttributes, ProjectCreationAttributes>
    implements ProjectInstance
  {
    public id!: string;
    public title!: string;
    public description!: string;
    public images?: string[];
    public targetAmount!: number;
    public currentAmount!: number;
    public startDate!: Date;
    public endDate!: Date;
    public status!: ProjectStatus;
    public fundraiserId!: string;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public toJSON(): ProjectAttributes {
      return { ...this.get() } as ProjectAttributes;
    }

    static associate(models: any) {
      Project.belongsTo(models.User, {
        foreignKey: 'fundraiserId',
        as: 'fundraiser',
      });
      Project.hasMany(models.Donation, {
        foreignKey: 'projectId',
        as: 'donations',
      });
    }
  }

  Project.init(
    {
      id: {
        type: DataTypes.STRING(26),
        defaultValue: generateULID,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          len: [5, 200],
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          len: [20, 5000],
        },
      },
      images: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
      },
      targetAmount: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        validate: {
          min: 1000,
        },
      },
      currentAmount: {
        type: DataTypes.DECIMAL(15, 0),
        defaultValue: 0,
        validate: {
          min: 0,
        },
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isAfterStartDate(value: Date) {
            if (value <= (this as any).startDate) {
              throw new Error('End date must be after start date');
            }
          },
        },
      },
      status: {
        type: DataTypes.ENUM(...Object.values(ProjectStatus)),
        allowNull: false,
        defaultValue: ProjectStatus.ACTIVE,
      },
      fundraiserId: {
        type: DataTypes.STRING(26),
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      timestamps: true,
      tableName: 'projects',
      hooks: {
        beforeUpdate: (project: Project) => {
          if (
            (project.currentAmount as any) >= (project.targetAmount as any) &&
            project.status === ProjectStatus.ACTIVE
          ) {
            project.status = ProjectStatus.CLOSED;
          }
          if (
            new Date() > project.endDate &&
            project.status === ProjectStatus.ACTIVE
          ) {
            project.status = ProjectStatus.CLOSED;
          }
        },
      },
    }
  );

  return Project;
}
