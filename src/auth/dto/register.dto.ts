import { createZodDto } from 'nestjs-zod';

import { createUserSchema } from 'src/users/dto/create-user.dto';

class RegisterDto extends createZodDto(createUserSchema) {}

export { RegisterDto };
