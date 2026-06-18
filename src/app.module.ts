import { Module } from '@nestjs/common';
import { DB_ROOT_CONFIG, CONFIG_MODULE } from './app/config';

@Module({
  imports: [CONFIG_MODULE, DB_ROOT_CONFIG],
  controllers: [],
  providers: [],
})
export class AppModule {}
