# Database Seeding Guide

This guide explains how to populate your database with realistic test data for development and testing purposes.

## Available Scripts

### Quick Commands

```bash
# Seed database with dummy data
npm run seed:dummy

# Clear all data from database
npm run db:clear

# Reset database (clear + seed)
npm run db:reset
```

### Detailed Commands

```bash
# Run seeder script directly
ts-node src/scripts/seedDatabase.ts

# Run clear script directly
ts-node src/scripts/clearDatabase.ts
```

## What Gets Created

### 📊 Data Overview
- **40 Users Total**
  - 20 Regular users (role: `USER`)
  - 20 Fundraisers (role: `FUNDRAISER`)
- **20 Projects** with realistic data
- **60-300 Donations** (3-15 per project)

### 👥 Users
- **Realistic Names**: Generated from common first/last name combinations
- **Unique Credentials**: Email and username guaranteed to be unique
- **Password**: All users have password `password123`
- **Roles**: Equal split between USER and FUNDRAISER roles

**Example Users:**
- `john.smith123@example.com` / `johnsmith123` (Regular User)
- `jane.doe456@example.com` / `janedoe456` (Fundraiser)

### 📊 Projects
- **Realistic Titles**: Community-focused project names
- **Detailed Descriptions**: Comprehensive project descriptions
- **Random Images**: Placeholder images from Picsum
- **Varied Funding Goals**: $500 to $50,000 target amounts
- **All Project States**: ACTIVE, CLOSED, CANCELLED
- **Realistic Dates**: Projects span 6 months past to 1 year future

**Project Status Distribution:**
- **ACTIVE**: Ongoing projects accepting donations
- **CLOSED**: Projects that reached funding goal or deadline
- **CANCELLED**: Projects that were discontinued

### 💰 Donations
- **Mixed Donor Types**: 70% authenticated users, 30% anonymous
- **Realistic Amounts**: $5 to $1,000 per donation
- **Personal Messages**: 60% of donations include motivational messages
- **Anonymous Names**: Creative anonymous donor names
- **Smart Distribution**: Projects with CLOSED status have appropriate funding levels

## Project Categories

The seeder creates projects in various categories:

### 🌱 Environmental
- Solar gardens
- Community composting
- Environmental cleanup
- Sustainable farming

### 🎓 Education
- Youth coding programs
- Digital literacy for seniors
- Mobile libraries
- Free computer labs

### 🏘️ Community
- Playground construction
- Neighborhood watch
- Public art installations
- Community gardens

### 🤝 Social Services
- Food banks
- Homeless shelters
- Mental health support
- Senior meal delivery

### 🎨 Arts & Culture
- Local artist support
- Music education
- Mural campaigns
- History documentation

## Database Reset Workflow

1. **Clear Existing Data** (respects foreign key constraints):
   - Donations (deleted first)
   - Projects (deleted second) 
   - Users (deleted last)

2. **Create New Data**:
   - Generate users with unique emails/usernames
   - Create projects with realistic funding goals
   - Generate donations with smart distribution
   - Update project funding amounts

3. **Verify Results**:
   - Display statistics of created data
   - Confirm all relationships are properly established

## Usage Examples

### Development Setup
```bash
# Initial setup after migration
npm run migrate
npm run seed:dummy

# Your database now has realistic test data!
```

### Testing Scenarios
```bash
# Reset for clean testing
npm run db:reset

# Test specific scenarios
npm run seed:dummy
```

### Clean Slate
```bash
# Remove all test data
npm run db:clear

# Confirm database is empty
```

## Safety Features

### Clear Script Protection
- Shows current database statistics before deletion
- Requires explicit "yes" confirmation
- Requires typing "DELETE ALL DATA" for final confirmation
- Cannot be run accidentally

### Data Integrity
- Respects foreign key relationships
- Creates data in correct order
- Updates calculated fields (project funding amounts)
- Maintains data consistency

## Sample Data Quality

### Realistic Scenarios
- **Successful Projects**: Some projects reach 100%+ funding
- **Ongoing Projects**: Active projects with partial funding
- **Failed Projects**: Some cancelled or expired projects
- **Community Engagement**: Realistic donation patterns and amounts

### Data Relationships
- Each donation properly linked to project and user (when not anonymous)
- Project current amounts match sum of their donations
- Project statuses reflect funding levels and dates
- User roles determine project creation permissions

## Testing Login Credentials

All users can log in with:
- **Email**: Any generated email (e.g., `john.smith123@example.com`)
- **Password**: `password123`

### Quick Test Users
After seeding, you can use any of the generated users. Check the console output for specific usernames and emails, or query the database:

```sql
SELECT email, username, role FROM users LIMIT 10;
```

## Troubleshooting

### Common Issues

**Permission Errors**:
```bash
# Make sure you have proper database permissions
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE crowdfund_db TO your_user;"
```

**Connection Errors**:
```bash
# Verify your .env database configuration
# Check that PostgreSQL is running
```

**Foreign Key Errors**:
```bash
# Run migrations first
npm run migrate

# Then seed
npm run seed:dummy
```

### Data Verification

Check seeded data:
```sql
-- Count records
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'projects', COUNT(*) FROM projects  
UNION ALL
SELECT 'donations', COUNT(*) FROM donations;

-- Check project funding
SELECT 
  title, 
  target_amount, 
  current_amount, 
  status,
  (current_amount::float / target_amount * 100)::integer as funded_percent
FROM projects 
ORDER BY funded_percent DESC;
```

## Production Warning

⚠️ **Never run these scripts on production databases!**

These scripts are designed for development and testing only. They will:
- Delete all existing data
- Create fake/dummy data
- Reset all sequences

Always use these scripts only on development or test databases.