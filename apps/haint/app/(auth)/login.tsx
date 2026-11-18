import { BodyText, Button, Container, Heading, Input, useTheme, useToast } from "@boneyard/skeleton-ui";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "~/lib/auth-context";

export default function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setEmailError("");
    if (!email || !password) {
      setEmailError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e: unknown) {
      toast.show(e instanceof Error ? e.message : "Login failed.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container scrollable padded>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.sm }}>
          <Heading size="displayLg">Haint</Heading>
          <BodyText color="secondary">Haunted attractions & ghost tours</BodyText>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <Input
            label="Email"
            icon="mail-outline"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            error={emailError}
          />
          <Input
            label="Password"
            icon="lock-closed-outline"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <Button label={loading ? "Signing in…" : "Sign in"} onPress={handleLogin} disabled={loading} />

        <View style={{ flexDirection: "row", gap: theme.spacing.xs, justifyContent: "center" }}>
          <BodyText color="secondary" size="sm">Don't have an account?</BodyText>
          <Link href="/(auth)/signup">
            <BodyText size="sm" weight="semiBold" style={{ color: theme.palette.primary }}>
              Sign up
            </BodyText>
          </Link>
        </View>
      </View>
    </Container>
  );
}
