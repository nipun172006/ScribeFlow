import { UserRound } from "lucide-react";

type SpeakerBadgeProps = {
  name: string;
};

export function SpeakerBadge({ name }: SpeakerBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-primary">
      <UserRound size={14} aria-hidden="true" />
      {name}
    </span>
  );
}
