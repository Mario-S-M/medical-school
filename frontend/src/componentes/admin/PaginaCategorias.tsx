import GuardiaRol from '../auth/GuardiaRol';
import GestionCategorias from './GestionCategorias';
import NavegacionAdmin from './NavegacionAdmin';

export default function PaginaCategorias() {
  return (
    <GuardiaRol rol="administrador">
      <div className="flex flex-col gap-6">
        <NavegacionAdmin actual="/admin/categorias" />
        <GestionCategorias />
      </div>
    </GuardiaRol>
  );
}
