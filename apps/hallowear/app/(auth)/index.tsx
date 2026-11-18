import { BodyText, Button, Heading, Container, useTheme } from "@boneyard/skeleton-ui";
import { Link, useRouter } from "expo-router";
import { useEffect } from "react";
import { Image, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const heroProgress = useSharedValue(0);
  const ctaProgress = useSharedValue(0);

  useEffect(() => {
    heroProgress.value = withTiming(1, { duration: 500 });
    ctaProgress.value = withDelay(200, withTiming(1, { duration: 450 }));
  }, [ctaProgress, heroProgress]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroProgress.value,
    transform: [{ translateY: (1 - heroProgress.value) * 16 }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaProgress.value,
    transform: [{ translateY: (1 - ctaProgress.value) * 12 }],
  }));

  return (
    <Container>
      <View style={{ flex: 1, justifyContent: "space-between", paddingVertical: theme.spacing.xl }}>
        <View />

        <Animated.View style={[{ alignItems: "center", gap: theme.spacing.lg }, heroStyle]}>
          <Image
            source={require("../../assets/splash-icon.png")}
            style={{ width: 120, height: 120 }}
            resizeMode="contain"
          />
          <View style={{ alignItems: "center", gap: theme.spacing.xs }}>
            <Heading size="displayLg">Hallowear</Heading>
            <BodyText color="secondary" style={{ textAlign: "center", maxWidth: 280 }}>
              Costumes, props, and disguises — rented from people near you.
            </BodyText>
          </View>
        </Animated.View>

        <Animated.View style={[{ gap: theme.spacing.md }, ctaStyle]}>
          <Button label="Get started" onPress={() => router.push("/(auth)/signup")} />
          <View style={{ flexDirection: "row", justifyContent: "center", gap: theme.spacing.sm }}>
            <BodyText color="secondary" size="sm">
              Already have an account?
            </BodyText>
            <Link href="/(auth)/login">
              <BodyText size="sm" weight="semiBold" style={{ color: theme.palette.primary }}>
                Log in
              </BodyText>
            </Link>
          </View>
        </Animated.View>
      </View>
    </Container>
  );
}
