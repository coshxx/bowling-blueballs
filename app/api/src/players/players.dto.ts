import { IsInt, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class CreatePlayerDto {
  @IsString()
  @Length(1, 40, { message: 'Der Spielername muss 1 bis 40 Zeichen lang sein.' })
  name: string;
}

export class UpdatePlayerDto {
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'Der Spielername muss 1 bis 40 Zeichen lang sein.' })
  name?: string;

  /** Benutzerkonto verknüpfen; null hebt die Verknüpfung auf */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  userId?: number | null;
}

export class MergePlayerDto {
  @IsInt()
  intoPlayerId: number;
}
