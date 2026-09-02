import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, money } from "../theme";

/**
 * `settings` : réponse de GET /client/settings (contient serviceFeePercent,
 * premiumServiceFeePercent, premiumCeilingMultiplier, premiumMaxCeiling).
 * Les libellés restent corrects même si `settings` n'est pas encore chargé
 * (affichage générique en attendant).
 */
export function getPremiumBenefits(settings) {
  return [
    {
      icon: "pricetag",
      title: "Frais réduits",
      text: settings
        ? `${settings.premiumServiceFeePercent}% de frais au lieu de ${settings.serviceFeePercent}% sur chaque aide.`
        : "Des frais de service réduits sur chaque aide.",
    },
    {
      icon: "trending-up",
      title: "Plafond majoré",
      text: settings
        ? `Ton plafond est multiplié par ${settings.premiumCeilingMultiplier} (jusqu'à ${money(settings.premiumMaxCeiling)} FCFA).`
        : "Un plafond d'aide nettement plus élevé.",
    },
    {
      icon: "shield-checkmark",
      title: "Niveau de confiance boosté",
      text: "+20 sur ton niveau de confiance affiché, tout de suite.",
    },
    {
      icon: "people",
      title: "Parrainage rentable",
      text: "Touche une commission sur chaque filleul que tu parraines — réservée aux membres AIFI+.",
    },
    {
      icon: "flash",
      title: "Priorité VIP",
      text: "Tes demandes d'aide et tes messages sont traités en priorité par l'équipe.",
    },
    {
      icon: "time",
      title: "Sursis en cas de retard",
      text: "Quelques jours de sursis supplémentaires avant toute pénalité de retard.",
    },
  ];
}

export default function PremiumBenefitsList({ settings, compact }) {
  const benefits = getPremiumBenefits(settings);
  return (
    <View>
      {benefits.map((b) => (
        <View key={b.title} style={[styles.row, compact && { marginBottom: 12 }]}>
          <View style={styles.iconWrap}>
            <Ionicons name={b.icon} size={18} color={colors.premium} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{b.title}</Text>
            {!compact && <Text style={styles.text}>{b.text}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", marginBottom: 18 },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.premiumSoft,
    alignItems: "center", justifyContent: "center", marginRight: 12, marginTop: 1,
  },
  title: { fontSize: 14.5, fontWeight: "700", color: colors.ink },
  text: { fontSize: 12.5, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
});
