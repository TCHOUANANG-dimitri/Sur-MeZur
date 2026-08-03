import { useRouter } from "expo-router";
import { Package, Pencil } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { OrdersApi } from "../../api/endpoints";
import type { ChatMessage, Modification, Order } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { formatFcfa, useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { BottomSheet } from "../../components/BottomSheet";
import { ChatBubble } from "../../components/DomainCards";
import { EmptyState, Header, Field, Input, Spinner } from "../../components/Misc";
import { Screen } from "../../components/Screen";
import { useTheme, useThemedStyles } from "../../theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../theme/tokens";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export function ChatScreenBody({ orderId, base }: { orderId: string; base: "client" | "tailor" }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [text, setText] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [delta, setDelta] = useState("0");
  const [justification, setJustification] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const load = async () => {
    const [o, msgs, mods] = await Promise.all([
      OrdersApi.get(orderId),
      OrdersApi.chat(orderId),
      OrdersApi.modifications(orderId),
    ]);
    setOrder(o);
    setMessages(msgs);
    setModifications(mods);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const send = async () => {
    if (!text.trim()) return;
    setText("");
    await OrdersApi.sendChat(orderId, text);
    load();
  };

  const proposeModification = async () => {
    await OrdersApi.proposeModification(orderId, {
      new_garment_price: parseFloat(newPrice) || 0,
      accessory_price_delta: parseFloat(delta) || 0,
      justification,
    });
    setSheetOpen(false);
    setJustification("");
    setNewPrice("");
    load();
  };

  const respond = async (modId: string, accept: boolean) => {
    if (accept) await OrdersApi.acceptModification(modId);
    else await OrdersApi.refuseModification(modId);
    load();
  };

  if (!messages || !order) return <Spinner />;

  const isFinished = order.status === "finished_delivered" || order.status === "finished_not_delivered";
  const modById = new Map(modifications.map((m) => [m.id, m]));
  let lastDay = "";

  return (
    <Screen scroll={false}>
      <Header
        title={t("chat.title")}
        showBack
        right={
          <TouchableOpacity onPress={() => router.push(`/${base}/(tabs)/orders`)} style={styles.ordersBtn} hitSlop={8}>
            <Package size={18} color={colors.indigoText} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && <EmptyState text="Aucun message pour le moment." />}
        {messages.map((m) => {
          const mod = m.modification_id ? modById.get(m.modification_id) : undefined;
          const label = dayLabel(m.created_at);
          const showDaySeparator = label !== lastDay;
          lastDay = label;
          return (
            <View key={m.id}>
              {showDaySeparator && (
                <View style={styles.daySeparator}>
                  <Text style={styles.dayLabel}>{label}</Text>
                </View>
              )}
              {m.type !== "system" && (
                <Text style={[styles.senderLabel, m.sender_id === user?.id ? styles.senderLabelMine : styles.senderLabelTheirs]}>
                  {m.sender_id === user?.id ? "Vous" : t(`role.${base === "client" ? "tailor" : "client"}`)}
                </Text>
              )}
              <ChatBubble mine={m.sender_id === user?.id} body={m.body || ""} kind={m.type} time={m.created_at} />
              {mod && mod.status === "proposed" && mod.proposed_by !== user?.role && !isFinished && (
                <View style={styles.modActions}>
                  <Button variant="secondary" onPress={() => respond(mod.id, false)}>
                    Refuser
                  </Button>
                  <Button onPress={() => respond(mod.id, true)}>Accepter ({formatFcfa(mod.new_garment_price)})</Button>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {isFinished ? (
        <View style={styles.closedBar}>
          <Text style={styles.closedText}>Cette commande est terminée — discussion en lecture seule.</Text>
        </View>
      ) : (
        <View style={styles.inputBar}>
          {user?.role === "tailor" && (
            <TouchableOpacity onPress={() => setSheetOpen(true)} style={styles.editBtn}>
              <Pencil size={16} color={colors.indigoText} />
            </TouchableOpacity>
          )}
          <Input
            style={{ flex: 1 }}
            placeholder={t("chat.placeholder")}
            value={text}
            onChangeText={setText}
            onSubmitEditing={send}
          />
          <Button onPress={send}>{t("common.send")}</Button>
        </View>
      )}

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={t("order.editModel")}>
        <Field label="Nouveau prix du vêtement (FCFA)">
          <Input keyboardType="numeric" value={newPrice} onChangeText={setNewPrice} />
        </Field>
        <Field label="Variation prix accessoire (FCFA)">
          <Input keyboardType="numeric" value={delta} onChangeText={setDelta} />
        </Field>
        <Field label="Justification">
          <Input value={justification} onChangeText={setJustification} multiline style={{ minHeight: 70, textAlignVertical: "top" }} />
        </Field>
        <Button fullWidth onPress={proposeModification}>
          {t("common.send")}
        </Button>
      </BottomSheet>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  modActions: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: -4, marginBottom: 12 },
  ordersBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  daySeparator: { alignItems: "center", marginVertical: 12 },
  dayLabel: {
    fontSize: 10,
    fontFamily: fonts.bodySemiBold,
    color: colors.textSecondary,
    backgroundColor: colors.backgroundAlt,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  senderLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.bodySemiBold, marginBottom: 2 },
  senderLabelMine: { textAlign: "right" },
  senderLabelTheirs: { textAlign: "left" },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  closedBar: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundAlt,
  },
  closedText: { fontSize: 12, color: colors.textSecondary, textAlign: "center", fontFamily: fonts.body },
});
