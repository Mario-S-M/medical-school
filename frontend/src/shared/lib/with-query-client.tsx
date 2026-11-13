import { QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { queryClient } from './query-client';

// Envuelve el componente raíz de una isla con el QueryClient compartido.
export function withQueryClient<P extends object>(Component: ComponentType<P>) {
  const Island = (props: P) => (
    <QueryClientProvider client={queryClient}>
      <Component {...props} />
    </QueryClientProvider>
  );
  Island.displayName = `withQueryClient(${Component.displayName ?? Component.name})`;
  return Island;
}
