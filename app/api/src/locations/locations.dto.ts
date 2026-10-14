import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export const MAX_CENTS = 100_000;

export class CreateLocationDto {
  @IsString()
  @Length(1, 60, { message: 'Der Name der Location muss 1 bis 60 Zeichen lang sein.' })
  name: string;
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 60, { message: 'Der Artikelname muss 1 bis 60 Zeichen lang sein.' })
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}
