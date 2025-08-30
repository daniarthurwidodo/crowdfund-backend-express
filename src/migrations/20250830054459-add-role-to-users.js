'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'role', {
      type: Sequelize.ENUM('ADMIN', 'USER', 'FUNDRAISER'),
      allowNull: false,
      defaultValue: 'USER',
      after: 'last_name'
    });

    // Add index for role column for better query performance
    await queryInterface.addIndex('users', ['role']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeIndex('users', ['role']);
    await queryInterface.removeColumn('users', 'role');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
  }
};
