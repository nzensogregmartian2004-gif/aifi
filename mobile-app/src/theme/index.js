import { Platform } from "react-native";

export const colors = {
  ink: "#142136",
  ink2: "#1f3253",
  inkSoft: "#5a6a86",
  paper: "#eef0f4",
  paper2: "#e3e7ee",
  card: "#ffffff",
  line: "#dbe0e8",
  gold: "#b8862e",
  goldSoft: "#f3e6cc",
  success: "#2f6f4e",
  successSoft: "#e2f0e8",
  danger: "#9b3b3b",
  dangerSoft: "#f6e4e4",
  warn: "#c97a2b",
  warnSoft: "#f8ead6",
  white: "#ffffff",
};

export const fonts = {
  display: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  body: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};

export const radius = { sm: 8, md: 12, lg: 18, pill: 100 };

export function money(n) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
}

export const STATUS_LABELS = {
  PENDING: "En attente",
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
  DISBURSED: "Envoyée",
  REPAID: "Remboursée",
  LATE: "En retard",
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
    case "PENDING":
    default:
      return { bg: colors.warnSoft, fg: colors.warn };
  }
}
