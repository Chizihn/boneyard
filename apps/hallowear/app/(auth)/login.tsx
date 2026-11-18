import { BodyText, Button, Heading, Input, Container, useTheme, useToast } from "@boneyard/skeleton-ui";
import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useAuth } from "~/lib/auth-context";
import { useBackHandler } from "~/hooks";

export default function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useBackHandler(() => loading);

  async function handleLogin() {
    if (!email || !password) {
      toast.show("Enter your email and password.", "error");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.show("Welcome back.", "success");
    } catch (e: unknown) {
      toast.show(e instanceof Error ? e.message : "Login failed.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: theme.spacing.lg }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginBottom: theme.spacing.md }}>
            <Heading size="displayLg" style={{ letterSpacing: -0.5 }}>
              Welcome back
            </Heading>
            <BodyText color="secondary" style={{ marginTop: theme.spacing.xs }}>
              Log in to pick up where you left off.
            </BodyText>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Input
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label="Password"
              icon="lock-closed-outline"
              placeholder="Enter your password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <Button label={loading ? "Signing in…" : "Sign in"} onPress={handleLogin} disabled={loading} />

          <View style={{ flexDirection: "row", gap: theme.spacing.sm, justifyContent: "center" }}>
            <BodyText color="secondary" size="sm">
              Don&apos;t have an account?
            </BodyText>
            <Link href="/(auth)/signup">
              <BodyText size="sm" weight="semiBold" style={{ color: theme.palette.primary }}>
                Sign up
              </BodyText>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Container>
  );
}
