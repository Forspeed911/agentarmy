import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { ResearchService } from './research.service';

@Controller('api/v1/projects/:projectId/research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Post()
  @HttpCode(202)
  startResearch(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.researchService.startResearch(projectId);
  }

  @Get(':caseId/status')
  getStatus(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.researchService.getStatus(projectId, caseId);
  }

  @Get(':caseId/report')
  getReport(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.researchService.getReport(projectId, caseId);
  }

  @Post(':caseId/decision')
  submitDecision(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: { decision: string; comment?: string },
  ) {
    return this.researchService.submitDecision(
      projectId,
      caseId,
      body.decision,
      body.comment,
    );
  }
}
