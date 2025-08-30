import { Sequelize } from 'sequelize';
import config from '../config/database';
import UserModel from './user';
import { UserInstance } from '../types';

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

const db = {
  sequelize,
  Sequelize,
  User
};

Object.values(db).forEach((model: any) => {
  if (model.associate) {
    model.associate(db);
  }
});

export { sequelize, Sequelize, User };
export type { UserInstance };
export default db;