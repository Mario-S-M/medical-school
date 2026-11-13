import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { StorageModule } from '../storage/storage.module';
import { PlaybackController } from './controllers/playback.controller';
import { PlaybackTokenGuard } from './guards/playback-token.guard';
import { PlaybackRepository } from './repositories/playback.repository';
import { PlaybackResolver } from './resolvers/playback.resolver';
import { PlaybackAccessService } from './services/playback-access.service';
import { PlaybackTokenService } from './services/playback-token.service';
import { PlaylistService } from './services/playlist.service';

// Reproducción protegida de los videos de clase (SPEC 12, pasos 1 y 2): `autorizar_reproduccion` en GraphQL y, en REST,
// `GET /api/v1/reproducciones/{video_id}/lista.m3u8` y `.../clave`.
@Module({
  imports: [SecurityModule, RolesModule, CoursesModule, StorageModule],
  controllers: [PlaybackController],
  providers: [PlaybackRepository, PlaybackAccessService, PlaybackTokenService, PlaylistService, PlaybackTokenGuard, PlaybackResolver],
})
export class PlaybackModule {}
