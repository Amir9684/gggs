import { User } from 'src/users/entities/user.entity';

type TJwtPayloadType = {
  id: string;
  username: string;
  role: User['role'];
};
export default TJwtPayloadType;
