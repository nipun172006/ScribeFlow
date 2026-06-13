import { AlertTriangle } from "lucide-react";

type ErrorStateProps = {
  title: string;
  message: string;
  requestId?: string | null;
};

export function ErrorState({ title, message, requestId }: ErrorStateProps) {
  return (
    <div
      className="rounded-card border border-danger/35 bg-danger/10 p-5 text-sm shadow-soft backdrop-blur-xl"
      role="alert"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 text-danger" size={18} />
        <div>
          <p className="font-ui font-semibold text-primary">{title}</p>
          <p className="mt-1 leading-6 text-muted">{message}</p>
          {requestId ? (
            <p className="mt-2 font-mono text-xs text-muted">Request ID: {requestId}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
