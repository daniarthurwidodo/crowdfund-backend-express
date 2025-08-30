'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add payment status to donations
    await queryInterface.addColumn('donations', 'payment_status', {
      type: Sequelize.ENUM('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
      after: 'amount'
    });

    // Add payment method preference
    await queryInterface.addColumn('donations', 'payment_method', {
      type: Sequelize.ENUM('INVOICE', 'VIRTUAL_ACCOUNT', 'EWALLET', 'CARD'),
      allowNull: true,
      after: 'payment_status'
    });

    // Add index for payment status
    await queryInterface.addIndex('donations', ['payment_status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('donations', ['payment_status']);
    await queryInterface.removeColumn('donations', 'payment_method');
    await queryInterface.removeColumn('donations', 'payment_status');
  }
};