import { OmitType } from '@nestjs/mapped-types';
import { GetUsersQueryDTO } from './get-users-query.dto';

export class GetUserQueryDTO extends OmitType(GetUsersQueryDTO, [
  'pageNumber',
  'pageSize',
] as const) {}
