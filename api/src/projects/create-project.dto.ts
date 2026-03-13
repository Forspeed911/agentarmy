import { IsString, IsOptional, IsUrl } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsString()
  source: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
