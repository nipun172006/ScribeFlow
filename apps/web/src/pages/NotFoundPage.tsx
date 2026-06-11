import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { EmptyState } from "../components/EmptyState";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <EmptyState
        icon={<Compass size={20} aria-hidden="true" />}
        title="Page not found"
        message="This route is not part of the ScribeFlow workspace."
        action={
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast hover:bg-accent/90"
          >
            <Home size={17} aria-hidden="true" />
            Dashboard
          </Link>
        }
      />
    </div>
  );
}
