import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { OrdersApi } from "../../api/endpoints";
import type { ChatMessage, Modification } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { BottomSheet } from "../../components/BottomSheet";
import { ChatBubble } from "../../components/DomainCards";
import { Header, Field, inputStyle, Spinner } from "../../components/Misc";
import { colors } from "../../theme/tokens";

export default function ChatScreen() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [text, setText] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newPrice, setNewPrice] = useState(0);
  const [delta, setDelta] = useState(0);
  const [justification, setJustification] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const [msgs, mods] = await Promise.all([OrdersApi.chat(id), OrdersApi.modifications(id)]);
    setMessages(msgs);
    setModifications(mods);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    setText("");
    await OrdersApi.sendChat(id, text);
    load();
  };

  const proposeModification = async () => {
    await OrdersApi.proposeModification(id, {
      new_garment_price: newPrice,
      accessory_price_delta: delta,
      justification,
    });
    setSheetOpen(false);
    setJustification("");
    load();
  };

  const respond = async (modId: string, accept: boolean) => {
    if (accept) await OrdersApi.acceptModification(modId);
    else await OrdersApi.refuseModification(modId);
    load();
  };

  if (!messages) return <Spinner />;

  const modById = new Map(modifications.map((m) => [m.id, m]));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Header title={t("chat.title")} onBack />
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {messages.map((m) => {
          const mod = m.modification_id ? modById.get(m.modification_id) : undefined;
          return (
            <div key={m.id}>
              <ChatBubble mine={m.sender_id === user?.id} body={m.body || ""} kind={m.type} time={m.created_at} />
              {mod && mod.status === "proposed" && mod.proposed_by !== user?.role && (
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: -4, marginBottom: 12 }}>
                  <Button variant="secondary" onClick={() => respond(mod.id, false)}>
                    Refuser
                  </Button>
                  <Button onClick={() => respond(mod.id, true)}>Accepter ({formatFcfa(mod.new_garment_price)})</Button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${colors.border}`, display: "flex", gap: 8, alignItems: "center" }}>
        {user?.role === "tailor" && (
          <button
            onClick={() => setSheetOpen(true)}
            style={{ border: "none", background: colors.backgroundAlt, borderRadius: "50%", width: 38, height: 38, fontSize: 16, cursor: "pointer" }}
            title={t("order.editModel")}
          >
            ✎
          </button>
        )}
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder={t("chat.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <Button onClick={send}>{t("common.send")}</Button>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("order.editModel")}>
        <Field label="Nouveau prix du vêtement (FCFA)">
          <input type="number" style={inputStyle} value={newPrice} onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Variation prix accessoire (FCFA)">
          <input type="number" style={inputStyle} value={delta} onChange={(e) => setDelta(parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Justification">
          <textarea style={{ ...inputStyle, minHeight: 70 }} value={justification} onChange={(e) => setJustification(e.target.value)} />
        </Field>
        <Button fullWidth onClick={proposeModification}>
          {t("common.send")}
        </Button>
      </BottomSheet>
    </div>
  );
}
