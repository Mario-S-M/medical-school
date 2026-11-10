import GuardiaRol from '../auth/GuardiaRol';
import ListaRevision from './ListaRevision';
import NavegacionAdmin from './NavegacionAdmin';

export default function PaginaRevision() {
  return (
    <GuardiaRol rol="administrador">
      <div className="flex flex-col gap-6">
        <NavegacionAdmin actual="/admin/revision" />
        <ListaRevision />
      </div>
    </GuardiaRol>
  );
}
