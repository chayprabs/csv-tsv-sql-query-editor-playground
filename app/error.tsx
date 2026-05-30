"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted">
        Quarry hit an unexpected error. You can try again or return to the home page.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
        <Link
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink"
          href="/"
        >
          Back to Quarry
        </Link>
      </div>
    </main>
  );
}
