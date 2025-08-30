import { Sequelize, DataTypes, Model } from 'sequelize';
import bcrypt from 'bcryptjs';
import { UserAttributes, UserCreationAttributes, UserInstance } from '../types';

export default function(sequelize: Sequelize) {
  class User extends Model<UserAttributes, UserCreationAttributes> implements UserInstance {
    public id!: string;
    public email!: string;
    public username!: string;
    public password!: string;
    public firstName!: string;
    public lastName!: string;
    public isActive!: boolean;
    public lastLoginAt?: Date;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public async validatePassword(password: string): Promise<boolean> {
      return await bcrypt.compare(password, this.password);
    }

    public toJSON(): Omit<UserAttributes, 'password'> {
      const values = { ...this.get() } as UserAttributes;
      delete (values as any).password;
      return values;
    }
  }

  User.init({
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 30]
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [6, 100]
      }
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 50]
      }
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 50]
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    lastLoginAt: {
      type: DataTypes.DATE
    }
  }, {
    sequelize,
    timestamps: true,
    tableName: 'users',
    hooks: {
      beforeCreate: async (user: User) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user: User) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
    }
  });

  return User;
}