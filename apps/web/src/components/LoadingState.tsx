type LoadingStateProps = {
  label: string;
};

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 text-sm text-muted"
      role="status"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
      {label}
    </div>
  );
}
