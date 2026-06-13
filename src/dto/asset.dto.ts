import { IsNotEmpty, IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateAssetDto {
  @IsNotEmpty()
  @IsString()
  assetNo!: string;

  @IsNotEmpty()
  @IsString()
  assetName!: string;

  @IsNotEmpty()
  @IsString()
  assetType!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  originalValue!: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  operator?: string;
}
