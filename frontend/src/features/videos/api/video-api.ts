import { API_V1, request } from '../../../shared/api/client';
import { parseResponse } from '../../../shared/api/parse';
import { uploadFile } from '../../../shared/api/upload';
import { signedUploadSchema, type UploadRequest } from '../schemas/video-status-schema';

// Firma de subida del video (REST): el archivo sube directo a Storage con la URL firmada.
export const requestVideoUpload = async (body: UploadRequest) =>
  parseResponse(signedUploadSchema, await request<unknown>({ method: 'POST', url: `${API_V1}/videos/firmas`, data: body }));

// El archivo va directo a Storage (nunca pasa por la API), midiendo el progreso.
export const putVideo = uploadFile;
