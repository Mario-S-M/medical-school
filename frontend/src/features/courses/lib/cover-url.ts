// Las portadas viven en el bucket público `portadas` de Supabase Storage (se sirve por el proxy /almacen).
export const coverUrl = (path: string | null | undefined) => (path ? `/almacen/object/public/portadas/${path}` : null);
