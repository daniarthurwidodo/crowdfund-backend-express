'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('donations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      isAnonymous: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      donorName: {
        type: Sequelize.STRING,
        allowNull: true
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      projectId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('donations', ['projectId']);
    await queryInterface.addIndex('donations', ['userId']);
    await queryInterface.addIndex('donations', ['createdAt']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('donations');
  }
};