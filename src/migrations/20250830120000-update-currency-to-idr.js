'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Update projects table to handle IDR amounts (remove decimal places, increase size)
    await queryInterface.changeColumn('projects', 'targetAmount', {
      type: Sequelize.DECIMAL(15, 0),
      allowNull: false
    });
    
    await queryInterface.changeColumn('projects', 'currentAmount', {
      type: Sequelize.DECIMAL(15, 0),
      defaultValue: 0
    });
    
    // Update donations table to handle IDR amounts
    await queryInterface.changeColumn('donations', 'amount', {
      type: Sequelize.DECIMAL(15, 0),
      allowNull: false
    });
    
    // Convert existing USD amounts to IDR (multiply by ~15,000)
    // This is approximate conversion rate - adjust as needed
    await queryInterface.sequelize.query(`
      UPDATE projects 
      SET 
        "targetAmount" = ROUND("targetAmount" * 15000),
        "currentAmount" = ROUND("currentAmount" * 15000)
      WHERE "targetAmount" < 100000;
    `);
    
    await queryInterface.sequelize.query(`
      UPDATE donations 
      SET "amount" = ROUND("amount" * 15000)
      WHERE "amount" < 10000;
    `);
  },

  async down(queryInterface, Sequelize) {
    // Convert IDR back to USD (divide by ~15,000)
    await queryInterface.sequelize.query(`
      UPDATE projects 
      SET 
        "targetAmount" = ROUND("targetAmount" / 15000, 2),
        "currentAmount" = ROUND("currentAmount" / 15000, 2)
      WHERE "targetAmount" > 100000;
    `);
    
    await queryInterface.sequelize.query(`
      UPDATE donations 
      SET "amount" = ROUND("amount" / 15000, 2)
      WHERE "amount" > 10000;
    `);
    
    // Revert column types to USD format (with decimals)
    await queryInterface.changeColumn('projects', 'targetAmount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false
    });
    
    await queryInterface.changeColumn('projects', 'currentAmount', {
      type: Sequelize.DECIMAL(12, 2),
      defaultValue: 0
    });
    
    await queryInterface.changeColumn('donations', 'amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false
    });
  }
};