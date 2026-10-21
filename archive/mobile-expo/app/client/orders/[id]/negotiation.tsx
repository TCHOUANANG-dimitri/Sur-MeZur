import { useLocalSearchParams } from "expo-router";
import React from "react";
import { NegotiationScreen } from "../../../../src/screens/shared/Negotiation";

export default function ClientNegotiation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <NegotiationScreen orderId={id} />;
}
