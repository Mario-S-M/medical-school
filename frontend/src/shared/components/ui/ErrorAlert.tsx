type Props = { message?: string | null };

export default function ErrorAlert({ message }: Props) {
  return (
    <div role="alert" aria-live="assertive">
      {message && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {message}
        </p>
      )}
    </div>
  );
}
