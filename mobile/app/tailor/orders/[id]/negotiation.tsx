import { useLocalSearchParams } from "expo-router";
import React from "react";
import { NegotiationScreen } from "../../../../src/screens/shared/Negotiation";

export default function TailorNegotiation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <NegotiationScreen orderId={id} />;
}
