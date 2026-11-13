import { IntegerField, TextField } from '../../../common/validators/field-rules';

// Cuerpo de `POST /api/v1/portadas/firmas`. Reglas del workflow `url-de-subida-de-portada`.
export class CoverSignatureDto {
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  curso_id!: number;

  @TextField({ required: true, min: 1, max: 100 })
  tipo_contenido!: string;

  @IntegerField({ required: true, min: 1, max: 1000000000 })
  tamano_bytes!: number;
}
