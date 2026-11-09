type Props = { mensaje?: string | null };

export default function AlertaExito({ mensaje }: Props) {
  return (
    <div role="status" aria-live="polite">
      {mensaje && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {mensaje}
        </p>
      )}
    </div>
  );
}
