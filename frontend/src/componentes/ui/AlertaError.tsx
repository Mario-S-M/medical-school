type Props = { mensaje?: string | null };

export default function AlertaError({ mensaje }: Props) {
  return (
    <div role="alert" aria-live="assertive">
      {mensaje && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {mensaje}
        </p>
      )}
    </div>
  );
}
