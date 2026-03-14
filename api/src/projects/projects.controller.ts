import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './create-project.dto';

@Controller('api/v1/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get()
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('archived') archived?: string,
  ) {
    return this.projectsService.findAll(
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
      archived === 'true',
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.archive(id);
  }

  @Patch(':id/unarchive')
  unarchive(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.unarchive(id);
  }
}
