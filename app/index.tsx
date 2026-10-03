import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { hasSeenWelcome } from "../utils/onboarding";

export default function Index() {
  const [checked, setChecked] = useState(false);
  const [seenWelcome, setSeenWelcome] = useState(true);

  useEffect(() => {
    hasSeenWelcome().then((seen) => {
      setSeenWelcome(seen);
      setChecked(true);
    });
  }, []);

  if (!checked) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!seenWelcome) {
    return <Redirect href="/welcome" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" },
});
