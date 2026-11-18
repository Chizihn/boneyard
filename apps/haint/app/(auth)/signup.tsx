import { BodyText, Button, Container, Heading, Input, useTheme, useToast } from "@boneyard/skeleton-ui";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useAuth } from "~/lib/auth-context";

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

  async function handleSignup() {
    if (!name || !email || !password) {
      toast.show("All fields are required.", "error");
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim().toLowerCase(), password, name.trim(), role);
    } catch (e: unknown) {
      toast.show(e instanceof Error ? e.message : "Signup failed.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container scrollable padded>
      <View style={{ gap: theme.spacing.lg, paddingVertical: theme.spacing.xl }}>
        <Heading size="display">Create account</Heading>

        <View style={{ gap: theme.spacing.md }}>
          <Input label="Name" icon="person-outline" value={name} onChangeText={setName} />
          <Input label="Email" icon="mail-outline" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Input label="Password" icon="lock-closed-outline" secureTextEntry value={password} onChangeText={setPassword} />
        </View>

        {/* Role selector */}
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {(["requester", "provider"] as SignupRole[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              style={{
                flex: 1,
                borderWidth: 1.5,
                borderColor: role === r ? theme.palette.primary : theme.palette.border,
                borderRadius: theme.radius.md,
                padding: theme.spacing.md,
                alignItems: "center",
                backgroundColor: role === r ? theme.palette.primary + "22" : theme.palette.surface,
              }}
            >
              <BodyText weight="semiBold" style={{ color: role === r ? theme.palette.primary : theme.palette.text }}>
                {r === "requester" ? "I'm visiting" : "I run an attraction"}
              </BodyText>
              <BodyText size="xs" color="secondary">
                {r === "requester" ? "Book haunted experiences" : "List your venue"}
              </BodyText>
            </Pressable>
          ))}
        </View>

        <Button label={loading ? "Creating account…" : "Create account"} onPress={handleSignup} disabled={loading} />

        <View style={{ flexDirection: "row", gap: theme.spacing.xs, justifyContent: "center" }}>
          <BodyText color="secondary" size="sm">Already have an account?</BodyText>
          <Link href="/(auth)/login">
            <BodyText size="sm" weight="semiBold" style={{ color: theme.palette.primary }}>Sign in</BodyText>
          </Link>
        </View>
      </View>
    </Container>
  );
}
