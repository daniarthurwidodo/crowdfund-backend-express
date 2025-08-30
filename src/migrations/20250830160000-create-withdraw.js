'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('withdrawals', {
      id: {
        type: Sequelize.STRING(26), // ULID
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: Sequelize.STRING(26),
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        field: 'user_id'
      },
      projectId: {
        type: Sequelize.STRING(26),
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        field: 'project_id'
      },
      amount: {
        type: Sequelize.DECIMAL(15, 0),
        allowNull: false,
        comment: 'Amount requested for withdrawal in smallest currency unit'
      },
      availableAmount: {
        type: Sequelize.DECIMAL(15, 0),
        allowNull: false,
        comment: 'Available amount at time of request',
        field: 'available_amount'
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'IDR'
      },
      method: {
        type: Sequelize.ENUM('BANK_TRANSFER', 'XENDIT_DISBURSEMENT', 'MANUAL'),
        allowNull: false,
        comment: 'Withdrawal method'
      },
      status: {
        type: Sequelize.ENUM(
          'PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 
          'COMPLETED', 'FAILED', 'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      requestedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'requested_at'
      },
      approvedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'approved_at'
      },
      processedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'processed_at'
      },
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'completed_at'
      },
      rejectedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'rejected_at'
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Reason for withdrawal request'
      },
      adminNotes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Admin notes for approval/rejection',
        field: 'admin_notes'
      },
      
      // Bank details
      bankName: {
        type: Sequelize.STRING(100),
        allowNull: true,
        field: 'bank_name'
      },
      bankCode: {
        type: Sequelize.STRING(10),
        allowNull: true,
        field: 'bank_code'
      },
      accountNumber: {
        type: Sequelize.STRING(50),
        allowNull: true,
        field: 'account_number'
      },
      accountHolderName: {
        type: Sequelize.STRING(100),
        allowNull: true,
        field: 'account_holder_name'
      },
      
      // Xendit disbursement details
      xenditDisbursementId: {
        type: Sequelize.STRING(100),
        allowNull: true,
        field: 'xendit_disbursement_id'
      },
      disbursementData: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Xendit disbursement API response data',
        field: 'disbursement_data'
      },
      
      // Fees and processing
      processingFee: {
        type: Sequelize.DECIMAL(15, 0),
        allowNull: false,
        defaultValue: 0,
        comment: 'Processing fee charged for withdrawal',
        field: 'processing_fee'
      },
      netAmount: {
        type: Sequelize.DECIMAL(15, 0),
        allowNull: false,
        defaultValue: 0,
        comment: 'Net amount after deducting fees',
        field: 'net_amount'
      },
      
      // Audit fields
      approvedBy: {
        type: Sequelize.STRING(26),
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'approved_by'
      },
      processedBy: {
        type: Sequelize.STRING(26),
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'processed_by'
      },
      rejectedBy: {
        type: Sequelize.STRING(26),
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'rejected_by'
      },
      
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'created_at'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'updated_at'
      }
    });

    // Create indexes for better query performance
    await queryInterface.addIndex('withdrawals', ['user_id'], {
      name: 'withdrawals_user_id_idx'
    });
    
    await queryInterface.addIndex('withdrawals', ['project_id'], {
      name: 'withdrawals_project_id_idx'
    });
    
    await queryInterface.addIndex('withdrawals', ['status'], {
      name: 'withdrawals_status_idx'
    });
    
    await queryInterface.addIndex('withdrawals', ['requested_at'], {
      name: 'withdrawals_requested_at_idx'
    });
    
    await queryInterface.addIndex('withdrawals', ['status', 'requested_at'], {
      name: 'withdrawals_status_requested_at_idx'
    });
    
    // Composite index for admin queries
    await queryInterface.addIndex('withdrawals', ['status', 'method', 'requested_at'], {
      name: 'withdrawals_admin_queries_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop indexes first
    await queryInterface.removeIndex('withdrawals', 'withdrawals_admin_queries_idx');
    await queryInterface.removeIndex('withdrawals', 'withdrawals_status_requested_at_idx');
    await queryInterface.removeIndex('withdrawals', 'withdrawals_requested_at_idx');
    await queryInterface.removeIndex('withdrawals', 'withdrawals_status_idx');
    await queryInterface.removeIndex('withdrawals', 'withdrawals_project_id_idx');
    await queryInterface.removeIndex('withdrawals', 'withdrawals_user_id_idx');
    
    // Drop the table
    await queryInterface.dropTable('withdrawals');
  }
};