import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateProjectDto) {
    return this.prisma.project.create({ data: dto });
  }

  findAll(limit = 20, offset = 0) {
    return Promise.all([
      this.prisma.project.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          cases: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { scoring: true },
          },
        },
      }),
      this.prisma.project.count(),
    ]).then(([items, total]) => ({ items, total }));
  }

  findOne(id: string) {
    return this.prisma.project.findUniqueOrThrow({
      where: { id },
      include: {
        cases: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { scoring: true },
        },
      },
    });
  }
}
