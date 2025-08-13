# Script de Publication Google Play Console

## 🚀 Fonctionnalités

Ce script automatise la publication d'applications Android sur Google Play Console :

✅ **Métadonnées** : Titre, descriptions, catégories
✅ **IAP** : Création automatique des achats intégrés
✅ **Abonnements** : Configuration des abonnements récurrents  
✅ **Assets** : Upload des screenshots et icônes
✅ **Releases** : Création et déploiement sur les tracks
✅ **Localisations** : Support multilingue (en-US, fr-FR, etc.)

## 📋 Prérequis

### 1. Service Account Google Cloud

1. Allez sur [Google Cloud Console](https://console.cloud.google.com)
2. Créez un nouveau projet ou sélectionnez un existant
3. Activez l'API Google Play Android Developer
4. Créez un Service Account :
   - IAM & Admin > Service Accounts > Create Service Account
   - Nom : `play-console-publisher`
   - Rôle : `Service Account User`
5. Créez une clé JSON :
   - Actions > Manage Keys > Add Key > JSON
   - Téléchargez le fichier `service-account.json`

### 2. Configuration dans Play Console

1. Allez sur [Google Play Console](https://play.google.com/console)
2. Settings > API access
3. Liez votre projet Google Cloud
4. Ajoutez le service account avec les permissions :
   - `Release manager` (pour publier)
   - `Financial data` (pour les IAP)

### 3. Installation des dépendances

```bash
npm install
```

## 🔧 Configuration

Modifiez le fichier `publish-android.js` :

```javascript
const config = {
  // Authentification
  serviceAccountKeyPath: './service-account.json',
  packageName: 'com.votreapp.android',
  
  // Métadonnées de l'app
  app: {
    title: 'Votre App',
    shortDescription: 'Description courte (80 chars max)',
    fullDescription: 'Description complète...',
    // ...
  },
  
  // IAP
  inAppProducts: [
    {
      sku: 'com.votreapp.produit1',
      productType: 'inapp', // ou 'subs'
      defaultPrice: '990000', // En micros ($0.99 = 990000)
      // ...
    }
  ],
  
  // Version
  release: {
    versionCode: 1,
    versionName: '1.0.0',
    // ...
  }
};
```

## 📦 Structure des fichiers

```
auto_publication_app/
├── service-account.json     # Clé d'authentification Google
├── publish-android.js        # Script principal
├── assets/
│   ├── icon.png             # 512x512 PNG
│   ├── feature-graphic.png  # 1024x500 PNG
│   └── screenshots/
│       ├── android/
│       │   ├── phone/       # Screenshots téléphone
│       │   ├── tablet7/     # Screenshots tablette 7"
│       │   └── tablet10/    # Screenshots tablette 10"
└── app.aab                  # Bundle Android (optionnel)
```

## 🚀 Utilisation

### Publication simple (sans bundle)
```bash
node publish-android.js
```

### Publication avec upload du bundle
```bash
node publish-android.js app.aab
```

### Via npm script
```bash
npm run publish:android
```

## 💰 Configuration des IAP

### Produits consommables
```javascript
{
  sku: 'com.votreapp.coins_100',
  productType: 'inapp',
  defaultPrice: '990000', // $0.99
  listings: {
    'en-US': {
      title: '100 Coins',
      description: 'Get 100 coins'
    },
    'fr-FR': {
      title: '100 Pièces',
      description: 'Obtenez 100 pièces'
    }
  }
}
```

### Abonnements
```javascript
{
  sku: 'com.votreapp.premium_monthly',
  basePlanId: 'monthly',
  defaultPrice: '4990000', // $4.99/mois
  listings: {
    'en-US': {
      title: 'Premium Monthly',
      description: 'All premium features'
    }
  }
}
```

## 📊 Prix en micros

| Prix USD | Valeur en micros |
|----------|------------------|
| $0.99    | 990000          |
| $1.99    | 1990000         |
| $2.99    | 2990000         |
| $3.99    | 3990000         |
| $4.99    | 4990000         |
| $9.99    | 9990000         |
| $19.99   | 19990000        |
| $49.99   | 49990000        |
| $99.99   | 99990000        |

## 🌍 Tracks de déploiement

- `internal` : Test interne (recommandé pour commencer)
- `alpha` : Test alpha fermé
- `beta` : Test beta ouvert
- `production` : Production

## ⚠️ Notes importantes

1. **Première publication** : L'app doit d'abord être créée manuellement dans Play Console
2. **Bundle/APK** : Un premier bundle doit être uploadé manuellement
3. **Questionnaire** : Le questionnaire de contenu doit être complété
4. **Politique** : URL de politique de confidentialité requise
5. **Review** : La première soumission nécessite une review manuelle

## 🐛 Dépannage

### Erreur d'authentification
- Vérifiez que le service account a les bonnes permissions
- Vérifiez que l'API est activée dans Google Cloud

### IAP non créés
- Les IAP doivent d'abord avoir une app publiée
- Vérifiez les SKU (pas d'espaces, lowercase)

### Upload échoué
- Vérifiez la taille des images
- Format PNG requis
- Dimensions exactes requises

## 📚 Ressources

- [Google Play Console API](https://developers.google.com/android-publisher)
- [Service Accounts](https://cloud.google.com/iam/docs/service-accounts)
- [In-app Products](https://developer.android.com/google/play/billing)
- [Upload Bundles](https://developer.android.com/guide/app-bundle)

## 🔄 Workflow complet

1. Configurer le service account ✅
2. Lier à Play Console ✅
3. Configurer le script ✅
4. Préparer les assets ✅
5. Lancer le script ✅
6. Vérifier dans Play Console ✅
7. Compléter manuellement si nécessaire ✅
8. Soumettre pour review ✅

## 💡 Tips

- Testez d'abord sur le track `internal`
- Utilisez un rollout progressif (10% → 50% → 100%)
- Gardez les versions cohérentes entre iOS et Android
- Testez les IAP en mode sandbox avant production