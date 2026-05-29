interface ErrorDisplayProps {
  message?: string | null;
}

export function ErrorDisplay({ message }: ErrorDisplayProps) {
  if (!message) {
    return null;
  }

  return (
    <section
      aria-live="assertive"
      className="rounded-xl border border-red-200 bg-red-50 p-4"
      role="alert"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-red-700">
        Query error
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-900">{message}</p>
    </section>
  );
}
