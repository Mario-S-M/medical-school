import { useState } from 'react';
import { errorMessage } from '../../../shared/api/error-messages';
import Button from '../../../shared/components/ui/Button';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import type { Category } from '../../catalog/schemas/catalog-schema';
import { useDeleteCategory } from '../hooks/use-admin-mutations';
import CategoryForm from './CategoryForm';

export default function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const { mutate, isPending, error } = useDeleteCategory();
  const remove = () => {
    if (window.confirm(`¿Borrar la categoría "${category.nombre}"?`)) mutate(category.id);
  };
  if (editing) {
    return (
      <li className="rounded-lg border border-sky-200 bg-sky-50 p-3">
        <CategoryForm initial={category} suggestedPosition={category.posicion} onSaved={() => setEditing(false)} />
        <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <div className="flex items-center justify-between gap-3">
        <span><strong>{category.nombre}</strong> <span className="text-sm text-slate-500">· posición {category.posicion}</span></span>
        <span className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>
          <Button variant="secondary" disabled={isPending} onClick={remove}>Borrar</Button>
        </span>
      </div>
    </li>
  );
}
