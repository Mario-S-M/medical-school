import { API_V1, request } from '../../../shared/api/client';
import { parseResponse } from '../../../shared/api/parse';
import { coverSignatureSchema } from '../schemas/course-schema';

// Firma de subida de la portada (REST): la imagen sube directo a Storage con la URL firmada.
export const requestCoverUpload = async (body: { curso_id: number; tipo_contenido: string; tamano_bytes: number }) =>
  parseResponse(coverSignatureSchema, await request<unknown>({ method: 'POST', url: `${API_V1}/portadas/firmas`, data: body }));
