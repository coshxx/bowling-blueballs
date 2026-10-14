import { IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { DATE_PATTERN } from '../entries/entries.dto';
import { MAX_CENTS } from '../locations/locations.dto';

export class CreateEveningDto {
  @Matches(DATE_PATTERN, { message: 'Das Datum muss im Format JJJJ-MM-TT sein.' })
  date: string;

  @IsOptional()
  @IsInt()
  locationId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Die Bezeichnung darf höchstens 60 Zeichen lang sein.' })
  label?: string;
}

export class UpdateEveningDto {
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Das Datum muss im Format JJJJ-MM-TT sein.' })
  date?: string;

  /** null entfernt die Location */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  locationId?: number | null;

  /** Leer oder null entfernt die Bezeichnung */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60, { message: 'Die Bezeichnung darf höchstens 60 Zeichen lang sein.' })
  label?: string | null;
}

export class AddConsumptionDto {
  /** Bestehender Spieler … */
  @IsOptional()
  @IsInt()
  playerId?: number;

  /** … oder neuer Spieler mit diesem Namen */
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'Der Spielername muss 1 bis 40 Zeichen lang sein.' })
  newPlayerName?: string;

  /** Name des Artikels; steht er noch nicht auf der Karte, wird er angelegt */
  @IsString()
  @Length(1, 60, { message: 'Der Artikelname muss 1 bis 60 Zeichen lang sein.' })
  itemName: string;

  @IsInt()
  @Min(1, { message: 'Die Menge muss mindestens 1 sein.' })
  @Max(99)
  quantity: number;

  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  unitCents: number;
}

export class UpdateConsumptionDto {
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Die Menge muss mindestens 1 sein.' })
  @Max(99)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  unitCents?: number;
}
