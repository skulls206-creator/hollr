import React, { useEffect, useRef } from "react";
import { Animated, Image, View } from "react-native";

const KHURK_K_LOGO = require("@/assets/images/khurk-k-logo.jpg");

interface Props {
  size?: number;
}

export function KhurkSupporterBadge({ size = 14 }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        opacity,
        shadowColor: "#7C3AED",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 5,
        borderRadius: size / 2,
      }}
    >
      <Image
        source={KHURK_K_LOGO}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
      />
    </Animated.View>
  );
}
