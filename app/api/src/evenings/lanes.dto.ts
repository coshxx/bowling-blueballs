import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt } from 'class-validator';

export const LANES = ['left', 'right'] as const;
export type Lane = (typeof LANES)[number];

export class RollLanesDto {
  /** Teilnehmer, die mitspielen */
  @IsArray()
  @ArrayMinSize(2, { message: 'Zum Auslosen braucht es mindestens zwei Spieler.' })
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  playerIds: number[];
}

export class AssignLaneDto {
  @IsInt()
  playerId: number;

  @IsIn(LANES)
  lane: Lane;
}
