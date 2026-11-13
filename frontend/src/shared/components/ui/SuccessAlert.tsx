type Props = { message?: string | null };

export default function SuccessAlert({ message }: Props) {
  return (
    <div role="status" aria-live="polite">
      {message && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      )}
    </div>
  );
}
