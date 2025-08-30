import { Sequelize } from 'sequelize';
import config from '../config/database';
import UserModel from './user';
import ProjectModel from './project';
import DonationModel from './donation';
import { UserInstance, ProjectInstance, DonationInstance } from '../types';

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env as keyof typeof config];

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  port: dbConfig.port,
  dialect: dbConfig.dialect,
  logging: dbConfig.logging,
  pool: dbConfig.pool || {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

const User = UserModel(sequelize);
const Project = ProjectModel(sequelize);
const Donation = DonationModel(sequelize);

const db = {
  sequelize,
  Sequelize,
  User,
  Project,
  Donation
};

Object.values(db).forEach((model: any) => {
  if (model.associate) {
    model.associate(db);
  }
});

export { sequelize, Sequelize, User, Project, Donation };
export type { UserInstance, ProjectInstance, DonationInstance };
export default db;