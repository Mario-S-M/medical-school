import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('PortadaConfirmada', { description: 'Portada guardada en el curso.' })
export class ConfirmedCover {
  @Field(() => String, { name: 'portada_url', description: 'Ruta pública (bajo /almacen) de la portada; se lee sin sesión.' })
  portada_url!: string;
}

// Respuesta de `POST /api/v1/portadas/firmas` (REST).
export interface CoverSignature {
  url_subida: string;
  ruta: string;
}
