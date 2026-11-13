import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesModule } from '../courses/courses.module';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { StorageModule } from '../storage/storage.module';
import { InternalVideosController } from './controllers/internal-videos.controller';
import { VideosController } from './controllers/videos.controller';
import { LessonVideo } from './entities/lesson-video.entity';
import { VideoKey } from './entities/video-key.entity';
import { TranscoderSecretGuard } from './guards/transcoder-secret.guard';
import { VideosRepository } from './repositories/videos.repository';
import { VideosResolver } from './resolvers/videos.resolver';
import { StorageVideoFilesCleaner } from './services/storage-video-files-cleaner';
import { TranscoderClient } from './services/transcoder-client.service';
import { VideoFilesCleaner } from './services/video-files-cleaner';
import { VideosService } from './services/videos.service';

// Videos de clase (SPEC 10, paso 8): firma REST de la subida, `estado_video`, `confirmar_subida_video`, `reintentar_video` y
// `borrar_video` en GraphQL, el webhook interno del transcodificador y el borrado de archivos (`VideoFilesCleaner`).
@Module({
  imports: [SecurityModule, RolesModule, CoursesModule, StorageModule, TypeOrmModule.forFeature([LessonVideo, VideoKey])],
  controllers: [VideosController, InternalVideosController],
  providers: [
    VideosRepository,
    VideosService,
    TranscoderClient,
    TranscoderSecretGuard,
    VideosResolver,
    { provide: VideoFilesCleaner, useClass: StorageVideoFilesCleaner },
  ],
  exports: [TypeOrmModule, VideoFilesCleaner],
})
export class VideosModule {}
