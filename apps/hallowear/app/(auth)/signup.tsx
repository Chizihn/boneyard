import { BodyText, Button, Heading, Input, Container, useTheme, useToast } from "@boneyard/skeleton-ui";
import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useAuth } from "~/lib/auth-context";
import { useSingleBack } from "~/hooks";

type SignupRole = "requester" | "provider";

export default function SignupScreen() {
  const { signup } = useAuth();
  const theme = useTheme();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SignupRole>("requester");
  const [loading, setLoading] = useState(false);

  useSingleBack({
    fallback: "/(auth)/login",
    handleHardwareBack: true,
    onBeforeBack: () => !loading,
  });

  async function handleSignup() {
    if (!name || !email || !password) {
      toast.show("All fields are required.", "error");
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim().toLowerCase(), password, name.trim(), role);
      toast.show("Account created — welcome to Hallowear.", "success");
    } catch (e: unknown) {
      toast.show(e instanceof Error ? e.message : "Signup failed.", "error");
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
          <View>
            <Heading size="displayLg" style={{ letterSpacing: -0.5 }}>
              Create account
            </Heading>
            <BodyText color="secondary" style={{ marginTop: theme.spacing.xs }}>
              Takes about a minute.
            </BodyText>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Input label="Name" icon="person-outline" placeholder="Your name" value={name} onChangeText={setName} />
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
              placeholder="At least 8 characters"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <View>
            <BodyText weight="semiBold" size="sm" style={{ marginBottom: theme.spacing.sm }}>
              What are you here to do?
            </BodyText>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              {(["requester", "provider"] as SignupRole[]).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: role === r }}
                  style={{
                    flex: 1,
                    borderWidth: 1.5,
                    borderColor: role === r ? theme.palette.primary : theme.palette.border,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.md,
                    backgroundColor: role === r ? theme.palette.primary + "14" : theme.palette.surface,
                  }}
                >
                  <BodyText weight="semiBold" style={{ color: role === r ? theme.palette.primary : theme.palette.text }}>
                    {r === "requester" ? "I'm renting" : "I'm listing"}
                  </BodyText>
                  <BodyText size="xs" color="secondary">
                    {r === "requester" ? "Browse & book costumes" : "List your items"}
                  </BodyText>
                </Pressable>
              ))}
            </View>
          </View>

          <Button label={loading ? "Creating account…" : "Create account"} onPress={handleSignup} disabled={loading} />

          <View style={{ flexDirection: "row", gap: theme.spacing.sm, justifyContent: "center" }}>
            <BodyText color="secondary" size="sm">
              Already have an account?
            </BodyText>
            <Link href="/(auth)/login">
              <BodyText size="sm" weight="semiBold" style={{ color: theme.palette.primary }}>
                Sign in
              </BodyText>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Container>
  );
}
