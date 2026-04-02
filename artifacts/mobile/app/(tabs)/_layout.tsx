import { Tabs } from "expo-router";
import React from "react";
import { Redirect } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";

export default function TabLayout() {
  const { user, loading } = useAuth();

  if (!loading && !user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="dms" />
      <Tabs.Screen name="khurk" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
