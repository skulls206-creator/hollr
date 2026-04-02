import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#09090f" }}>
        <ActivityIndicator color="#8b5cf6" size="large" />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/dms" />;
  }

  return <Redirect href="/login" />;
}
