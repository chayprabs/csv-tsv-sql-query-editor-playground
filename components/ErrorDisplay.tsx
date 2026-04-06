interface ErrorDisplayProps {
  message?: string | null;
}

export function ErrorDisplay({ message }: ErrorDisplayProps) {
  if (!message) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-red-300 bg-red-50/90 p-5 shadow-panel">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
        Query Error
      </p>
      <p className="mt-2 text-sm leading-6 text-red-900">{message}</p>
    </section>
  );
}
