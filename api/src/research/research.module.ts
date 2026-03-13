import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'research' },
      { name: 'critic' },
      { name: 'scorer' },
    ),
  ],
  controllers: [ResearchController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
