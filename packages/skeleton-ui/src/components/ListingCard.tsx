import { Image, Pressable, View } from "react-native";
import { useTheme } from "../theme";
import { Badge, type BadgeVariant } from "./Badge";
import { Card } from "./Card";
import { BodyText, Heading } from "./Typography";

export interface ListingCardProps {
  imageUrl?: string;
  title: string;
  /** Vertical-specific detail line — "Available Oct 24–31 · 2.1 mi away"
   * for Hallowear, "Tonight · 7–10 PM · 3 slots left" for Haint. This is
   * the one line each app's own code actually writes; everything else
   * here is shared structure. */
  subtitle: string;
  price: string;
  badge?: { label: string; variant: BadgeVariant };
  onPress?: () => void;
  /** Fixed width for horizontal-scroll/grid contexts. Omit to stretch to
   * the parent's full width, which is the common case: a single-column
   * list. */
  width?: number;
}

export function ListingCard({
  imageUrl,
  title,
  subtitle,
  price,
  badge,
  onPress,
  width,
}: ListingCardProps) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? "button" : undefined}>
      <Card style={width ? { width } : { width: "100%" }}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ height: 130, borderRadius: theme.radius.md }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              height: 130,
              borderRadius: theme.radius.md,
              backgroundColor: theme.palette.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.85,
            }}
          >
            <BodyText size="xs" style={{ color: theme.palette.onPrimary }}>
              Photo
            </BodyText>
          </View>
        )}

        <Heading size="lg" numberOfLines={1}>
          {title}
        </Heading>
        <BodyText size="sm" color="secondary">
          {subtitle}
        </BodyText>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 2,
          }}
        >
          <BodyText weight="bold" size="lg">
            {price}
          </BodyText>
          {badge ? <Badge label={badge.label} variant={badge.variant} /> : null}
        </View>
      </Card>
    </Pressable>
  );
}
