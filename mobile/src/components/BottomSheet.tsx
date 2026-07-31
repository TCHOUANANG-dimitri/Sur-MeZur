import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radii } from "../theme/tokens";

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          {title && <Text style={styles.title}>{title}</Text>}
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(31,42,68,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 999,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.displaySemi,
    fontSize: 17,
    color: colors.indigoText,
    marginBottom: 12,
  },
});
