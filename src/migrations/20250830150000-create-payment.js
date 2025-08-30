'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
      id: {
        type: Sequelize.STRING(26),
        primaryKey: true,
        allowNull: false
      },
      donationId: {
        type: Sequelize.STRING(26),
        allowNull: false,
        references: {
          model: 'donations',
          key: 'id'
        },
        onDelete: 'CASCADE',
        field: 'donation_id'
      },
      externalId: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
        field: 'external_id'
      },
      xenditId: {
        type: Sequelize.STRING(255),
        allowNull: true,
        field: 'xendit_id'
      },
      amount: {
        type: Sequelize.DECIMAL(15, 0),
        allowNull: false
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'IDR'
      },
      method: {
        type: Sequelize.ENUM('INVOICE', 'VIRTUAL_ACCOUNT', 'EWALLET', 'CARD'),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      paymentUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
        field: 'payment_url'
      },
      virtualAccount: {
        type: Sequelize.JSONB,
        allowNull: true,
        field: 'virtual_account'
      },
      ewalletType: {
        type: Sequelize.STRING(50),
        allowNull: true,
        field: 'ewallet_type'
      },
      paidAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'paid_at'
      },
      expiredAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'expired_at'
      },
      failureCode: {
        type: Sequelize.STRING(100),
        allowNull: true,
        field: 'failure_code'
      },
      webhookData: {
        type: Sequelize.JSONB,
        allowNull: true,
        field: 'webhook_data'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: 'created_at'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: 'updated_at'
      }
    });

    // Add indexes for better performance
    await queryInterface.addIndex('payments', ['donation_id']);
    await queryInterface.addIndex('payments', ['external_id']);
    await queryInterface.addIndex('payments', ['xendit_id']);
    await queryInterface.addIndex('payments', ['status']);
    await queryInterface.addIndex('payments', ['created_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('payments');
  }
};