import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, useColorScheme, StatusBar } from "react-native";
import { enableScreens } from "react-native-screens";
import { getTheme } from "../constants/theme";
import { AppVoiceProvider } from "../context/AppVoiceProvider";
import { resetDatabaseClient, setupDatabase } from "../database/setup";

// Avoid "Cannot read property 'default' of undefined" in react-native-screens Animated ref (Fabric/React 19)
enableScreens(false);

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = useColorScheme();
  const colors = getTheme(colorScheme === "dark" ? "dark" : "light");

  useEffect(() => {
    let cancelled = false;

    const initDatabase = async (attempt: number): Promise<void> => {
      try {
        await setupDatabase();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (attempt < 2) {
          await resetDatabaseClient();
          await new Promise((r) => setTimeout(r, 350));
          return initDatabase(attempt + 1);
        }
        if (!cancelled) setError(String(e));
      }
    };

    void initDatabase(0);
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colorScheme === "dark" ? "light-content" : "dark-content"} />
        <Text style={[styles.error, { color: colors.error }]}>Failed to load: {error}</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colorScheme === "dark" ? "light-content" : "dark-content"} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loading, { color: colors.text }]}>Preparing Scripture</Text>
        <Text style={[styles.loadingHint, { color: colors.textMuted }]}>
          This only takes a little while the first time.
        </Text>
      </View>
    );
  }

  return (
    <AppVoiceProvider>
      <StatusBar barStyle={colorScheme === "dark" ? "light-content" : "dark-content"} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="intro" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="contact"
          options={{
            headerShown: true,
            title: "About",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: true,
            title: "Settings",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />
        <Stack.Screen name="open" options={{ headerShown: false }} />
        <Stack.Screen
          name="practice-game"
          options={{
            headerShown: true,
            title: "Practice",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />
        <Stack.Screen
          name="add-to-challenges"
          options={{
            headerShown: true,
            title: "Add a verse",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />
        <Stack.Screen
          name="add-range"
          options={{
            headerShown: true,
            title: "Add a passage",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />
      </Stack>
    </AppVoiceProvider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loading: { marginTop: 12, fontSize: 16, fontWeight: "600" },
  loadingHint: { marginTop: 6, fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  error: { padding: 24 },
});
