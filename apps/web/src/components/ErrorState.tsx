import { AlertTriangle } from "lucide-react";

type ErrorStateProps = {
  title: string;
  message: string;
  requestId?: string | null;
};

export function ErrorState({ title, message, requestId }: ErrorStateProps) {
  return (
    <div
      className="rounded-card border border-danger/40 bg-danger/10 p-4 text-sm"
      role="alert"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 text-danger" size={18} />
        <div>
          <p className="font-semibold text-primary">{title}</p>
          <p className="mt-1 leading-6 text-muted">{message}</p>
          {requestId ? (
            <p className="mt-2 font-mono text-xs text-muted">Request ID: {requestId}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
