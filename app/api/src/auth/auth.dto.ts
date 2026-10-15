import { IsOptional, IsString, Length, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]+$/u;

export class RegisterDto {
  @IsString()
  @Length(3, 30, { message: 'Der Benutzername muss 3 bis 30 Zeichen lang sein.' })
  @Matches(USERNAME_PATTERN, { message: 'Der Benutzername darf nur Buchstaben, Ziffern, _ . und - enthalten.' })
  username: string;

  @IsString()
  @MinLength(4, { message: 'Das Passwort muss mindestens 4 Zeichen lang sein.' })
  @MaxLength(200)
  password: string;
}

export class LoginDto {
  @IsString()
  @MaxLength(30)
  username: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

export class UpdateProfileDto {
  /** PayPal.Me-Name ohne "paypal.me/"; null oder leer entfernt ihn */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,20}$/, { message: 'Der PayPal.Me-Name darf nur Buchstaben und Ziffern enthalten (höchstens 20).' })
  paypalMe?: string | null;
}
