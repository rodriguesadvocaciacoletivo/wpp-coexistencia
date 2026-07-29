import type { UserDto } from './users.js';

export interface TeamDto {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

export interface TeamDetailDto extends TeamDto {
  members: UserDto[];
}

export interface TeamInput {
  name: string;
  description?: string | null;
}
