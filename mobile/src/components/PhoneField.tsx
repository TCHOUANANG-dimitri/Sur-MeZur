import { ChevronDown } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Field, Input } from "./Misc";
import { COUNTRIES, splitPhone, type Country } from "../constants/countries";
import { useI18n } from "../i18n/I18nProvider";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../theme/tokens";

/**
 * Champ téléphone avec sélecteur d'indicatif pays (drapeau + code), partagé
 * entre login/register/forgot-password. `value`/`onChangeText` portent le
 * numéro complet (ex. "+237600000000") pour rester compatible avec l'API —
 * le découpage indicatif/numéro local n'est qu'un détail d'affichage.
 */
export function PhoneField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (phone: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { country, local } = splitPhone(value);

  const selectCountry = (c: Country) => {
    onChangeText(`${c.dial}${local}`);
    setPickerOpen(false);
  };
  const setLocal = (v: string) => {
    onChangeText(`${country.dial}${v.replace(/[^0-9]/g, "")}`);
  };

  return (
    <>
      <Field label={label}>
        <View style={styles.phoneRow}>
          <TouchableOpacity style={styles.countryButton} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
            <Text style={styles.countryFlag}>{country.flag}</Text>
            <Text style={styles.countryDial}>{country.dial}</Text>
            <ChevronDown size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <Input
            value={local}
            onChangeText={setLocal}
            keyboardType="phone-pad"
            placeholder={t("auth.phone.placeholder")}
            style={styles.phoneInput}
            maxLength={12}
          />
        </View>
      </Field>

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title={t("phone.countryCode")}>
        {COUNTRIES.map((c) => (
          <TouchableOpacity key={c.code} style={styles.countryRow} activeOpacity={0.7} onPress={() => selectCountry(c)}>
            <Text style={styles.countryFlag}>{c.flag}</Text>
            <Text style={styles.countryName}>{c.name}</Text>
            <Text style={styles.countryRowDial}>{c.dial}</Text>
          </TouchableOpacity>
        ))}
      </BottomSheet>
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    phoneRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    countryButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.button,
      backgroundColor: colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    countryFlag: { fontSize: 18 },
    countryDial: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.indigoText },
    phoneInput: { flex: 1 },
    countryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    countryName: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.indigoText },
    countryRowDial: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  });
