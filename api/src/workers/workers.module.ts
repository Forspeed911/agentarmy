import { Module } from '@nestjs/common';
import { ResearcherProcessor } from './researcher.processor';
import { CriticProcessor } from './critic.processor';
import { ScorerProcessor } from './scorer.processor';
import { ResearchModule } from '../research/research.module';

@Module({
  imports: [ResearchModule],
  providers: [ResearcherProcessor, CriticProcessor, ScorerProcessor],
})
export class WorkersModule {}
