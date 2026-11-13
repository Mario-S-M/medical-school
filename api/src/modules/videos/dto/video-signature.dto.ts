import { IntegerField, TextField } from '../../../common/validators/field-rules';

// Cuerpo de `POST /api/v1/videos/firmas`. Reglas del workflow `solicitar-subida-de-video`.
export class VideoSignatureDto {
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  clase_id!: number;

  @TextField({ required: true, min: 1, max: 255 })
  nombre_archivo!: string;

  @TextField({ required: true, min: 1, max: 100 })
  tipo_contenido!: string;

  @IntegerField({ required: true, min: 1, max: 1000000000000 })
  tamano_bytes!: number;
}
