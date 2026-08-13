# AIFI — Application client (mobile)

Application Expo / React Native pour les clients de AIFI : compte, plafond, demandes d'aide, remboursements, portefeuille de parrainage.

## Installation

```bash
npm install
```

Édite `src/config.js` pour pointer vers ton backend :

```js
export const API_URL = "http://<IP_LOCALE_DE_TON_ORDI>:4000/api"; // téléphone physique via Expo Go
// ou http://10.0.2.2:4000/api pour l'émulateur Android
// ou http://localhost:4000/api pour le simulateur iOS
```

Puis :

```bash
npx expo start
```

Scanne le QR code avec Expo Go (Android/iOS), ou lance `npx expo start --android` / `--ios`.

## Écrans

- **Connexion / Inscription** — le compte créé reste `PENDING` jusqu'à validation manuelle par l'admin.
- **Accueil** — sceau de confiance (points), plafond autorisé/utilisé/disponible, prochaine échéance, portefeuille, filleuls.
- **Aides** — liste des demandes avec statut et suivi de remboursement, formulaire de nouvelle demande (bloqué au-delà du plafond disponible côté serveur).
- **Portefeuille** — solde, historique des mouvements (bonus/commissions de parrainage), demande de retrait (le backend applique le seuil minimum).
- **Parrainage** — code personnel à copier ou partager, liste des filleuls avec leur statut.

Toutes les actions financières restent déclaratives : rien ne s'exécute automatiquement, tout attend une validation manuelle de l'administrateur côté dashboard web.

## Dépendance ajoutée

`expo-clipboard` a été ajoutée (non présente par défaut) pour la copie du code de parrainage — déjà incluse dans `package.json`.
