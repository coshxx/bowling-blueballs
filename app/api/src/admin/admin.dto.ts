import { IsBoolean, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'Das Passwort muss mindestens 4 Zeichen lang sein.' })
  @MaxLength(200)
  password?: string;
}

export class GroupNameDto {
  @IsString()
  @Length(1, 60, { message: 'Der Gruppenname muss 1 bis 60 Zeichen lang sein.' })
  name: string;
}

export class AddMemberDto {
  @IsString()
  @MaxLength(30)
  username: string;
}

export class UpdateMemberDto {
  @IsBoolean()
  canUpload: boolean;
}
