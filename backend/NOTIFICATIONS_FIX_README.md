# AIFI — correctif notifications push / compilation

## Modifications
- `backend/tsconfig.json`: explicitation de `module: Node16` et `moduleResolution: Node16`.
  Cela évite la résolution historique `node10` qui déclenche TS5108 avec les versions récentes de TypeScript.
- Le projet conserve TypeScript 5.9.3 dans `backend/package.json` et `backend/package-lock.json`.
- Les routes de réglages sont déjà présentes dans cette archive :
  - `GET /api/account/notification-settings`
  - `PUT /api/account/notification-settings`
  - `PATCH /api/account/notification-settings`
  - `POST /api/account/push-token`
- `backend/src/app.ts` monte déjà `accountRoutes` sur `/api/account`.
- La désactivation met `pushEnabled=false`; le service conserve les notifications dans la boîte AIFI et n'envoie plus de push pour l'utilisateur.

## Important
L'archive fournie n'est pas strictement identique au commit Render `db9761313b7956e6d6f451ead0ef0c2b14e36860`.
Dans ce commit, `tsconfig.json` contient `moduleResolution: node` et `backend/package.json` utilise `typescript: ^5.6.3`.
Il faut appliquer le correctif de configuration au code réellement déployé, puis pousser et vérifier le nouveau déploiement.

## Vérifications non effectuées
L'installation `npm ci` dans cet environnement a expiré. Le build TypeScript et les tests ne sont donc pas déclarés comme réussis. À exécuter après extraction :
1. `cd backend`
2. `npm ci`
3. `npm run build`
4. `npm test`
