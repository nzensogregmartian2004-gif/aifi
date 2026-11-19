# Correctifs des tests backend AIFI

## Modifications
- `tsconfig.json` utilise `module` et `moduleResolution` en `Node16`, compatibles avec TypeScript 5.9 et le package CommonJS.
- `npm test` charge `test-env.cjs` avant les tests pour fournir une clé JWT strictement réservée aux tests. Cette clé n'est pas utilisée par `npm start` ni par Render.
- Les imports dynamiques des tests notifications et pénalités convertissent les chemins Windows en URL `file://` via `pathToFileURL`, évitant `ERR_UNSUPPORTED_ESM_URL_SCHEME`.

## Exécution
Depuis `backend`, avec Node.js 20 ou 22 (le projet déclare `>=20 <23`) :

```powershell
node -v
npm ci
npm run build
npm test
```

Ne jamais copier la clé de `test-env.cjs` dans les variables Render. Conserver une vraie clé `JWT_SECRET` aléatoire d'au moins 32 caractères en production.

Les tests valident le comportement du service en mémoire ; ils ne remplacent pas le test HTTP authentifié sur Render ni le test sur un téléphone réel.
