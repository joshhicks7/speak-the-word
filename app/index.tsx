import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { hasSeenTutorial } from "../utils/onboarding";

export default function Index() {
  const [checked, setChecked] = useState(false);
  const [seenTutorial, setSeenTutorial] = useState(true);

  useEffect(() => {
    hasSeenTutorial().then((seen) => {
      setSeenTutorial(seen);
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

  if (!seenTutorial) {
    return <Redirect href="/intro" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" },
});
