import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-neutral-200 bg-white px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 text-sm text-neutral-600 sm:flex-row sm:items-center">
        <p>© {new Date().getFullYear()} Chaitanya Prabuddha</p>
        <nav aria-label="Legal" className="flex gap-6">
          <Link
            className="text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline"
            href="/privacy"
          >
            Privacy Policy
          </Link>
          <Link
            className="text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline"
            href="/terms"
          >
            Terms &amp; Conditions
          </Link>
        </nav>
      </div>
    </footer>
  );
}
