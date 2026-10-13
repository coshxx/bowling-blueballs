import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UploadDto {
  @Matches(DATE_PATTERN, { message: 'Das Spieldatum muss im Format JJJJ-MM-TT sein.' })
  playedOn: string;
}

export class ListEntriesQuery {
  @IsOptional()
  @IsIn(['review'])
  filter?: 'review';
}

export class ApprovePlayerDto {
  @IsString()
  @Length(1, 40, { message: 'Der Anzeigename muss 1 bis 40 Zeichen lang sein.' })
  displayName: string;

  /** [[9, 1], [10], ...] – Regeln prüft der Service */
  @IsArray()
  frames: number[][];

  /** Bestehender Spieler … */
  @IsOptional()
  @IsInt()
  playerId?: number;

  /** … oder neuer Spieler mit diesem Namen */
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'Der Spielername muss 1 bis 40 Zeichen lang sein.' })
  newPlayerName?: string;
}

export class ApproveDto {
  @Matches(DATE_PATTERN, { message: 'Das Spieldatum muss im Format JJJJ-MM-TT sein.' })
  playedOn: string;

  @ValidateNested({ each: true })
  @Type(() => ApprovePlayerDto)
  @ArrayMinSize(1, { message: 'Mindestens ein Spieler ist nötig.' })
  @ArrayMaxSize(12)
  players: ApprovePlayerDto[];
}
