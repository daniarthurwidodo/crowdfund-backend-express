'use strict';

const { ulid } = require('ulid');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create a mapping table to store UUID to ULID conversions
    const uuidToUlidMap = new Map();

    // Step 1: Get all existing UUIDs and generate corresponding ULIDs
    const users = await queryInterface.sequelize.query(
      'SELECT id FROM users ORDER BY "createdAt"',
      { type: Sequelize.QueryTypes.SELECT }
    );
    
    const projects = await queryInterface.sequelize.query(
      'SELECT id FROM projects ORDER BY "createdAt"',
      { type: Sequelize.QueryTypes.SELECT }
    );
    
    const donations = await queryInterface.sequelize.query(
      'SELECT id FROM donations ORDER BY "createdAt"',
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Generate ULIDs for users
    for (const user of users) {
      uuidToUlidMap.set(user.id, ulid());
    }

    // Generate ULIDs for projects
    for (const project of projects) {
      uuidToUlidMap.set(project.id, ulid());
    }

    // Generate ULIDs for donations
    for (const donation of donations) {
      uuidToUlidMap.set(donation.id, ulid());
    }

    // Step 2: Add temporary columns for ULIDs
    await queryInterface.addColumn('users', 'ulid_id', {
      type: Sequelize.STRING(26),
      allowNull: true
    });

    await queryInterface.addColumn('projects', 'ulid_id', {
      type: Sequelize.STRING(26),
      allowNull: true
    });

    await queryInterface.addColumn('projects', 'ulid_fundraiserId', {
      type: Sequelize.STRING(26),
      allowNull: true
    });

    await queryInterface.addColumn('donations', 'ulid_id', {
      type: Sequelize.STRING(26),
      allowNull: true
    });

    await queryInterface.addColumn('donations', 'ulid_projectId', {
      type: Sequelize.STRING(26),
      allowNull: true
    });

    await queryInterface.addColumn('donations', 'ulid_userId', {
      type: Sequelize.STRING(26),
      allowNull: true
    });

    // Step 3: Populate ULID columns
    for (const [uuid, ulidValue] of uuidToUlidMap.entries()) {
      // Update users
      await queryInterface.sequelize.query(
        'UPDATE users SET ulid_id = :ulid WHERE id = :uuid',
        {
          replacements: { ulid: ulidValue, uuid },
          type: Sequelize.QueryTypes.UPDATE
        }
      );

      // Update projects
      await queryInterface.sequelize.query(
        'UPDATE projects SET ulid_id = :ulid WHERE id = :uuid',
        {
          replacements: { ulid: ulidValue, uuid },
          type: Sequelize.QueryTypes.UPDATE
        }
      );

      // Update donations
      await queryInterface.sequelize.query(
        'UPDATE donations SET ulid_id = :ulid WHERE id = :uuid',
        {
          replacements: { ulid: ulidValue, uuid },
          type: Sequelize.QueryTypes.UPDATE
        }
      );
    }

    // Step 4: Update foreign key references
    for (const [uuid, ulidValue] of uuidToUlidMap.entries()) {
      // Update project fundraiser references
      await queryInterface.sequelize.query(
        'UPDATE projects SET ulid_fundraiserId = :ulid WHERE "fundraiserId" = :uuid',
        {
          replacements: { ulid: ulidValue, uuid },
          type: Sequelize.QueryTypes.UPDATE
        }
      );

      // Update donation project references
      await queryInterface.sequelize.query(
        'UPDATE donations SET ulid_projectId = :ulid WHERE "projectId" = :uuid',
        {
          replacements: { ulid: ulidValue, uuid },
          type: Sequelize.QueryTypes.UPDATE
        }
      );

      // Update donation user references (can be null)
      await queryInterface.sequelize.query(
        'UPDATE donations SET ulid_userId = :ulid WHERE "userId" = :uuid',
        {
          replacements: { ulid: ulidValue, uuid },
          type: Sequelize.QueryTypes.UPDATE
        }
      );
    }

    // Step 5: Drop old columns and constraints
    await queryInterface.removeColumn('donations', 'userId');
    await queryInterface.removeColumn('donations', 'projectId');
    await queryInterface.removeColumn('donations', 'id');
    
    await queryInterface.removeColumn('projects', 'fundraiserId');
    await queryInterface.removeColumn('projects', 'id');
    
    await queryInterface.removeColumn('users', 'id');

    // Step 6: Rename ULID columns to original names
    await queryInterface.renameColumn('users', 'ulid_id', 'id');
    await queryInterface.renameColumn('projects', 'ulid_id', 'id');
    await queryInterface.renameColumn('projects', 'ulid_fundraiserId', 'fundraiserId');
    await queryInterface.renameColumn('donations', 'ulid_id', 'id');
    await queryInterface.renameColumn('donations', 'ulid_projectId', 'projectId');
    await queryInterface.renameColumn('donations', 'ulid_userId', 'userId');

    // Step 7: Add primary keys and constraints back
    await queryInterface.addConstraint('users', {
      fields: ['id'],
      type: 'primary key',
      name: 'users_pkey'
    });

    await queryInterface.addConstraint('projects', {
      fields: ['id'],
      type: 'primary key',
      name: 'projects_pkey'
    });

    await queryInterface.addConstraint('donations', {
      fields: ['id'],
      type: 'primary key',
      name: 'donations_pkey'
    });

    // Add foreign key constraints
    await queryInterface.addConstraint('projects', {
      fields: ['fundraiserId'],
      type: 'foreign key',
      name: 'projects_fundraiserId_fkey',
      references: {
        table: 'users',
        field: 'id'
      }
    });

    await queryInterface.addConstraint('donations', {
      fields: ['projectId'],
      type: 'foreign key',
      name: 'donations_projectId_fkey',
      references: {
        table: 'projects',
        field: 'id'
      }
    });

    await queryInterface.addConstraint('donations', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'donations_userId_fkey',
      references: {
        table: 'users',
        field: 'id'
      }
    });

    // Step 8: Make id columns NOT NULL
    await queryInterface.changeColumn('users', 'id', {
      type: Sequelize.STRING(26),
      allowNull: false,
      primaryKey: true
    });

    await queryInterface.changeColumn('projects', 'id', {
      type: Sequelize.STRING(26),
      allowNull: false,
      primaryKey: true
    });

    await queryInterface.changeColumn('projects', 'fundraiserId', {
      type: Sequelize.STRING(26),
      allowNull: false
    });

    await queryInterface.changeColumn('donations', 'id', {
      type: Sequelize.STRING(26),
      allowNull: false,
      primaryKey: true
    });

    await queryInterface.changeColumn('donations', 'projectId', {
      type: Sequelize.STRING(26),
      allowNull: false
    });

    await queryInterface.changeColumn('donations', 'userId', {
      type: Sequelize.STRING(26),
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    // This is a complex migration to reverse, but here's the basic structure
    // In practice, you might want to backup your data before running this migration
    
    // Add temporary UUID columns
    await queryInterface.addColumn('users', 'uuid_id', {
      type: Sequelize.UUID,
      allowNull: true
    });

    await queryInterface.addColumn('projects', 'uuid_id', {
      type: Sequelize.UUID,
      allowNull: true
    });

    await queryInterface.addColumn('projects', 'uuid_fundraiserId', {
      type: Sequelize.UUID,
      allowNull: true
    });

    await queryInterface.addColumn('donations', 'uuid_id', {
      type: Sequelize.UUID,
      allowNull: true
    });

    await queryInterface.addColumn('donations', 'uuid_projectId', {
      type: Sequelize.UUID,
      allowNull: true
    });

    await queryInterface.addColumn('donations', 'uuid_userId', {
      type: Sequelize.UUID,
      allowNull: true
    });

    // Generate new UUIDs for all records
    const { v4: uuidv4 } = require('uuid');
    
    const users = await queryInterface.sequelize.query(
      'SELECT id FROM users',
      { type: Sequelize.QueryTypes.SELECT }
    );

    const ulidToUuidMap = new Map();
    
    for (const user of users) {
      ulidToUuidMap.set(user.id, uuidv4());
    }

    // Continue with similar logic to convert back to UUIDs
    // This is a simplified version - full implementation would be similar to the up migration
  }
};