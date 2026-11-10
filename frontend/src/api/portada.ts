// Las portadas viven en el bucket público `portadas` de Supabase Storage (se sirve por el proxy /almacen).
export const urlPortada = (ruta: string | null) => (ruta ? `/almacen/object/public/portadas/${ruta}` : null);
