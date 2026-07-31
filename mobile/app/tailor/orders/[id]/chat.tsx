import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ChatScreenBody } from "../../../../src/screens/shared/ChatScreen";

export default function TailorChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ChatScreenBody orderId={id} base="tailor" />;
}
