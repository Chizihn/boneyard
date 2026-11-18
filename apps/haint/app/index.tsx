import { BodyText, Container, Heading } from "@boneyard/skeleton-ui";
import { Image } from "react-native";

/**
 * Placeholder landing screen — scaffolding only, to confirm the app boots
 * end to end (theme, fonts, navigation). The real screens come from
 * .kiro/specs/haint-spec.md once that's written and run through Kiro.
 */
export default function Home() {
  return (
    <Container style={{ alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Image
        source={require("../assets/splash-icon.png")}
        style={{ width: 120, height: 120 }}
        resizeMode="contain"
      />
      <Heading size="displayLg">Haint</Heading>
      <BodyText color="secondary" style={{ textAlign: "center" }}>
        Haunted attraction & tour booking — scaffolding in progress.
      </BodyText>
    </Container>
  );
}
