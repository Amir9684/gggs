import UserRole from '../enum';

export class GetUsersQueryDTO {
  username?: string;
  email?: string;
  role?: UserRole;
  pageNumber?: number;
  pageSize?: number;
}
