type LoadingStateProps = {
  label: string;
};

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.06] p-4 font-ui text-sm text-muted shadow-soft backdrop-blur-xl"
      role="status"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent shadow-[0_0_20px_rgba(54,211,194,0.28)]" />
      {label}
    </div>
  );
}
