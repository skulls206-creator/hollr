import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Polygon } from "react-native-svg";

interface Props {
  size?: number;
}

export function KhurkSupporterBadge({ size = 14 }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
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
        width: size,
        height: size,
        shadowColor: "#22d3ee",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 4,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Defs>
          <LinearGradient id="kdb-grad" x1="10%" y1="0%" x2="90%" y2="100%">
            <Stop offset="0%" stopColor="#ffffff" />
            <Stop offset="30%" stopColor="#bae6fd" />
            <Stop offset="65%" stopColor="#22d3ee" />
            <Stop offset="100%" stopColor="#0284c7" />
          </LinearGradient>
        </Defs>

        {/* Outer glow halo */}
        <Polygon
          points="10,1 19,10 10,19 1,10"
          fill="#22d3ee"
          opacity={0.3}
        />

        {/* Main diamond body */}
        <Polygon
          points="10,2 18,10 10,18 2,10"
          fill="url(#kdb-grad)"
        />

        {/* Upper-left facet — brighter */}
        <Polygon
          points="10,2 2,10 8,10 10,4.5"
          fill="white"
          opacity={0.45}
        />

        {/* Upper-right facet — medium */}
        <Polygon
          points="10,2 18,10 12,10 10,4.5"
          fill="white"
          opacity={0.12}
        />

        {/* Crown table highlight */}
        <Polygon
          points="10,3.5 13,7.5 10,9 7,7.5"
          fill="white"
          opacity={0.55}
        />
      </Svg>
    </Animated.View>
  );
}
