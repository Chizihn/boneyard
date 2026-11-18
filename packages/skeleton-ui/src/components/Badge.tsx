import { View } from "react-native";
import { useTheme } from "../theme";
import { BodyText } from "./Typography";

export type BadgeVariant = "neutral" | "positive" | "warning" | "negative" | "highlight";

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = "neutral" }: BadgeProps) {
  const theme = useTheme();
  const { bg, fg } = theme.palette.status[variant];

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: theme.radius.pill,
        paddingVertical: 5,
        paddingHorizontal: theme.spacing.md,
        alignSelf: "flex-start",
      }}
    >
      <BodyText weight="semiBold" size="xs" style={{ color: fg }}>
        {label}
      </BodyText>
    </View>
  );
}

/**
 * Deliberately NOT importing RequestStatus from @boneyard/skeleton-core:
 * that package re-exports the whole @prisma/client (native engine
 * binaries, Node built-ins), which would break Metro bundling in an
 * Expo app. This union is kept in sync by hand with the RequestStatus
 * enum in packages/skeleton-core/prisma/schema.prisma.
 */
export type RequestStatusLike =
  | "REQUESTED"
  | "MATCHED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DISPUTED"
  | "RESOLVED"
  | "CANCELLED";

const statusConfig: Record<RequestStatusLike, { label: string; variant: BadgeVariant }> = {
  REQUESTED: { label: "Requested", variant: "neutral" },
  MATCHED: { label: "Matched", variant: "highlight" },
  ACCEPTED: { label: "Accepted", variant: "highlight" },
  IN_PROGRESS: { label: "In progress", variant: "highlight" },
  COMPLETED: { label: "Completed", variant: "positive" },
  DISPUTED: { label: "Disputed", variant: "negative" },
  RESOLVED: { label: "Resolved", variant: "positive" },
  CANCELLED: { label: "Cancelled", variant: "negative" },
};

export function StatusBadge({ status }: { status: RequestStatusLike }) {
  const { label, variant } = statusConfig[status];
  return <Badge label={label} variant={variant} />;
}
