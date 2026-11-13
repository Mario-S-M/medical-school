import { IntegerField, OptionField, TextField } from '../../../common/validators/field-rules';

export const PROCESS_RESULTS = ['listo', 'error'] as const;

// Cuerpo de `POST /api/v1/interno/video-procesado` (lo llama el transcodificador).
export class VideoProcessedDto {
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  video_id!: number;

  @OptionField(PROCESS_RESULTS)
  resultado!: 'listo' | 'error';

  @IntegerField({ min: 1, max: 86400 })
  duracion_segundos?: number | null;

  @TextField({ max: 500, multiline: true })
  mensaje?: string | null;
}
