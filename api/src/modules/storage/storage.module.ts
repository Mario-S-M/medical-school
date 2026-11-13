import { Module } from '@nestjs/common';
import { StorageService } from './services/storage.service';

// Cliente de Supabase Storage con la clave de servicio. Lo usan las portadas (paso 6) y los videos (paso 8).
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
