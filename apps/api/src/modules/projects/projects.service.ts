import { HttpStatus, Injectable } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto } from './projects.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForMember(userId: string) {
    return this.prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        milestones: { orderBy: { targetDate: 'asc' } },
        disbursements: { orderBy: { disbursedAt: 'desc' } },
      },
    });
  }

  async getById(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        milestones: { orderBy: { targetDate: 'asc' } },
        disbursements: { orderBy: { disbursedAt: 'desc' } },
      },
    });
    if (!project || project.userId !== userId) {
      throw new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', 'Projet introuvable.');
    }
    return project;
  }

  async create(dto: CreateProjectDto, userId: string) {
    const project = await this.prisma.project.create({
      data: {
        userId,
        title: dto.title,
        sector: dto.sector,
        city: dto.city,
        locationDetail: dto.locationDetail,
        estimatedBudget: dto.estimatedBudget,
        personalContribution: dto.personalContribution ?? 0,
        grantRequested: dto.grantRequested,
        description: dto.description,
        status: ProjectStatus.SUBMITTED,
      },
    });

    // Créer des jalons prévisionnels par défaut
    const part1 = Math.round(dto.grantRequested * 0.4);
    const part2 = Math.round(dto.grantRequested * 0.4);
    const part3 = dto.grantRequested - part1 - part2;

    await this.prisma.projectMilestone.createMany({
      data: [
        {
          projectId: project.id,
          title: 'Installation, local et autorisations administratives',
          amount: part1,
        },
        {
          projectId: project.id,
          title: 'Achat de l’équipement principal et des stocks initiaux',
          amount: part2,
        },
        {
          projectId: project.id,
          title: 'Démarrage opérationnel et premier bilan d’activité',
          amount: part3,
        },
      ],
    });

    return this.getById(project.id, userId);
  }
}
