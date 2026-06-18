import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';

const dbConfig: DataSourceOptions = {
  type: process.env.DB_TYPE as 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: true,
};

const DB_ROOT_CONFIG = TypeOrmModule.forRoot(dbConfig);

const CONFIG_MODULE = ConfigModule.forRoot({
  isGlobal: true,
});

export { DB_ROOT_CONFIG, CONFIG_MODULE };
