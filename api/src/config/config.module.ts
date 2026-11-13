import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { readConfig } from './configuration';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => readConfig()],
    }),
  ],
})
export class AppConfigModule {}
