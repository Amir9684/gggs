import { Request } from 'express';

import UserRole from 'src/users/enum';

interface IAuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
}
interface AuthenticatedRequest extends Request {
  user: IAuthenticatedUser;
}

export type { IAuthenticatedUser, AuthenticatedRequest };
