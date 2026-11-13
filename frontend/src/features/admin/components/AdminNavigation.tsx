const LINKS = [
  { path: '/admin/roles', text: 'Roles' },
  { path: '/admin/categorias', text: 'Categorías' },
  { path: '/admin/revision', text: 'Revisión' },
];

export default function AdminNavigation({ current }: { current: string }) {
  return (
    <nav aria-label="Administración" className="flex gap-1 border-b border-slate-200 pb-2">
      {LINKS.map(({ path, text }) => (
        <a
          key={path}
          href={path}
          aria-current={path === current ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${path === current ? 'bg-sky-100 text-sky-800' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {text}
        </a>
      ))}
    </nav>
  );
}
