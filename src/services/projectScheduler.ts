import { Op } from 'sequelize';
import { Project } from '../models';
import { ProjectStatus } from '../types';
import { createChildLogger } from '../config/logger';

export class ProjectScheduler {
  private static instance: ProjectScheduler;
  private intervalId: NodeJS.Timeout | null = null;
  private logger = createChildLogger('ProjectScheduler');

  private constructor() {}

  public static getInstance(): ProjectScheduler {
    if (!ProjectScheduler.instance) {
      ProjectScheduler.instance = new ProjectScheduler();
    }
    return ProjectScheduler.instance;
  }

  public start(): void {
    this.logger.info('Starting project status scheduler...');

    this.intervalId = setInterval(async () => {
      await this.updateProjectStatuses();
    }, 60 * 1000);

    this.updateProjectStatuses();
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Project status scheduler stopped.');
    }
  }

  private async updateProjectStatuses(): Promise<void> {
    try {
      const now = new Date();

      const expiredProjects = await Project.findAll({
        where: {
          status: ProjectStatus.ACTIVE,
          endDate: {
            [Op.lt]: now,
          },
        },
      });

      for (const project of expiredProjects) {
        await project.update({
          status: ProjectStatus.CLOSED,
        });
        this.logger.info(
          `Project ${project.id} closed due to time expiration`,
          { projectId: project.id }
        );
      }

      const fullyFundedProjects = await Project.findAll({
        where: {
          status: ProjectStatus.ACTIVE,
          currentAmount: {
            [Op.gte]: Project.sequelize!.col('targetAmount'),
          },
        },
      });

      for (const project of fullyFundedProjects) {
        await project.update({
          status: ProjectStatus.CLOSED,
        });
        this.logger.info(
          `Project ${project.id} closed due to reaching funding goal`,
          { projectId: project.id }
        );
      }

      if (expiredProjects.length > 0 || fullyFundedProjects.length > 0) {
        this.logger.info(
          `Updated status for ${expiredProjects.length + fullyFundedProjects.length} projects`,
          {
            expiredCount: expiredProjects.length,
            fullyFundedCount: fullyFundedProjects.length,
          }
        );
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Error updating project statuses');
    }
  }

  public async manualUpdate(): Promise<{
    expired: number;
    fullyFunded: number;
  }> {
    try {
      const now = new Date();

      const expiredProjects = await Project.findAll({
        where: {
          status: ProjectStatus.ACTIVE,
          endDate: {
            [Op.lt]: now,
          },
        },
      });

      const fullyFundedProjects = await Project.findAll({
        where: {
          status: ProjectStatus.ACTIVE,
          currentAmount: {
            [Op.gte]: Project.sequelize!.col('targetAmount'),
          },
        },
      });

      await Promise.all([
        ...expiredProjects.map(project =>
          project.update({ status: ProjectStatus.CLOSED })
        ),
        ...fullyFundedProjects.map(project =>
          project.update({ status: ProjectStatus.CLOSED })
        ),
      ]);

      return {
        expired: expiredProjects.length,
        fullyFunded: fullyFundedProjects.length,
      };
    } catch (error) {
      this.logger.error(
        { err: error },
        'Error in manual project status update'
      );
      throw error;
    }
  }

  public async getProjectsNearingExpiration(days: number = 7): Promise<any[]> {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      return await Project.findAll({
        where: {
          status: ProjectStatus.ACTIVE,
          endDate: {
            [Op.between]: [new Date(), futureDate],
          },
        },
        include: ['fundraiser'],
        order: [['endDate', 'ASC']],
      });
    } catch (error) {
      this.logger.error(
        { err: error },
        'Error fetching projects nearing expiration'
      );
      throw error;
    }
  }

  public async getProjectStats(): Promise<{
    active: number;
    closed: number;
    cancelled: number;
    totalFunded: number;
    averageFunding: number;
  }> {
    try {
      const [stats] = await Project.sequelize!.query(`
        SELECT 
          COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed,
          COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled,
          COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN current_amount ELSE 0 END), 0) as total_funded,
          COALESCE(AVG(CASE WHEN status = 'CLOSED' THEN current_amount ELSE NULL END), 0) as average_funding
        FROM projects
      `);

      return stats[0] as any;
    } catch (error) {
      this.logger.error({ err: error }, 'Error fetching project stats');
      throw error;
    }
  }
}
