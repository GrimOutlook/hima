import { PortalHost } from "@rn-primitives/portal";
import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import "@/global.css";
import { NAV_THEME } from "./theme";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  return (
    <ThemeProvider value={NAV_THEME[colorScheme ?? "light"]}>
      <SafeAreaProvider>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <RootNavigator />
        <PortalHost />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  return (
    <Stack>
      <Stack.Screen options={{ headerShown: false }} name="index" />
    </Stack>
  );
}
