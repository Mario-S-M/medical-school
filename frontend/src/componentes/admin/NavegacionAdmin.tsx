const ENLACES = [
  { ruta: '/admin/roles', texto: 'Roles' },
  { ruta: '/admin/categorias', texto: 'Categorías' },
];

export default function NavegacionAdmin({ actual }: { actual: string }) {
  return (
    <nav aria-label="Administración" className="flex gap-1 border-b border-slate-200 pb-2">
      {ENLACES.map(({ ruta, texto }) => (
        <a
          key={ruta}
          href={ruta}
          aria-current={ruta === actual ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${ruta === actual ? 'bg-sky-100 text-sky-800' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {texto}
        </a>
      ))}
    </nav>
  );
}
