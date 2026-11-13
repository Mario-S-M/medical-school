import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/api-error';

// En Astro cada isla de React es un árbol aparte: un singleton de módulo comparte el caché entre todas.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Los errores 4xx son respuestas definitivas de la API: no se reintentan.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
    },
  },
});
