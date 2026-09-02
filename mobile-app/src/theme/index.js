import { Platform } from "react-native";

// Nouvelle identité : bleu clair, lumineux et moderne (inspiration Verso),
// à la place de l'ancien bleu marine/or plus terne. Les mêmes clés sont
// gardées pour que tout l'écosystème de composants existant se repeigne
// automatiquement, sans devoir toucher chaque écran un par un.
export const colors = {
  ink: "#0F1B33", // texte principal, fonds sombres (login, bannières)
  ink2: "#1E3A6E", // dégradé / profondeur sur les fonds sombres
  inkSoft: "#64748B", // texte secondaire, gris-bleu doux
  paper: "#F4F8FE", // fond général de l'app, légèrement teinté bleu
  paper2: "#E8F0FD", // fond secondaire (cartes creuses, zones actives)
  card: "#FFFFFF",
  line: "#DCE6F5",
  gold: "#2F7DFB", // ex-accent doré -> bleu vif, couleur d'action principale
  goldSoft: "#E4EEFF", // fond doux assorti à l'accent
  accent2: "#5FC4E8", // bleu ciel clair, pour dégradés / touches secondaires
  success: "#1E9E6B",
  successSoft: "#E1F7EE",
  danger: "#E14B4B",
  dangerSoft: "#FDEAEA",
  warn: "#F2A93C",
  warnSoft: "#FEF3E0",
  white: "#ffffff",

  // AIFI+ : un véritable doré (distinct du "gold" bleu ci-dessus, qui est en
  // fait la couleur d'action principale de l'app) réservé à la marque de
  // l'abonnement premium — badges, bouton "Passer AIFI+", écran dédié.
  premium: "#C9962C",
  premiumLight: "#F0C05C",
  premiumSoft: "#FBF1DC",
  premiumInk: "#4A3200",
};

export const fonts = {
  display: Platform.select({
    ios: "Avenir-Heavy",
    android: "sans-serif-medium",
    default: "System",
  }),
  body: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "System",
  }),
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
};

export const radius = { sm: 10, md: 16, lg: 22, pill: 100 };

export function money(n) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
}

export const STATUS_LABELS = {
  PENDING: "En attente",
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
  DISBURSING: "Envoi en cours…",
  DISBURSED: "Envoyée",
  REPAID: "Remboursée",
  LATE: "En retard",
  APPROVING: "Envoi en cours…",
  APPROVED: "Approuvé",
  CONFIRMED: "Confirmé",
};

export function statusColor(status) {
  switch (status) {
    case "ACTIVE":
    case "ACCEPTED":
    case "APPROVED":
    case "REPAID":
    case "DISBURSED":
    case "CONFIRMED":
      return { bg: colors.successSoft, fg: colors.success };
    case "SUSPENDED":
    case "REJECTED":
    case "LATE":
      return { bg: colors.dangerSoft, fg: colors.danger };
    case "DISBURSING":
    case "APPROVING":
    case "PENDING":
    default:
      return { bg: colors.warnSoft, fg: colors.warn };
  }
}
