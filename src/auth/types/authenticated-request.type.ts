import { Request } from 'express';

import UserRole from 'src/users/enum';

interface TAuthenticatedUserType {
  id: string;
  username: string;
  role: UserRole;
}
type TAuthenticatedRequestType = Request & {
  user: TAuthenticatedUserType;
};

export type { TAuthenticatedUserType, TAuthenticatedRequestType };
