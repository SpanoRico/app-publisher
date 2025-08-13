#!/usr/bin/env node

/**
 * Script de publication automatique pour Google Play Console
 * Utilise l'API Google Play Developer pour automatiser la publication d'apps Android
 */

const { google } = require('googleapis');
const androidpublisher = google.androidpublisher('v3');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

// Configuration avec fallback et couleurs
let chalk;
try {
  chalk = require('chalk');
} catch (e) {
  // Fallback si chalk n'est pas installé
  chalk = {
    green: (str) => `✅ ${str}`,
    red: (str) => `❌ ${str}`,
    yellow: (str) => `⚠️  ${str}`,
    blue: (str) => `ℹ️  ${str}`,
    gray: (str) => str,
    bold: (str) => str,
    cyan: (str) => str,
    magenta: (str) => str,
    dim: (str) => str
  };
}

// ==================== CONFIGURATION ====================
const config = {
  // Authentification Google Play Console
  serviceAccountKeyPath: './service-account.json', // Téléchargé depuis Google Cloud Console
  packageName: 'com.crowdaa.android', // Package name de votre app
  
  // Informations de l'app
  app: {
    defaultLanguage: 'en-US',
    title: 'Crowdaa - Crowdfunding Platform',
    shortDescription: 'Support projects, raise funds, make ideas happen',
    fullDescription: `Crowdaa is a revolutionary crowdfunding platform that connects creators with backers worldwide.

Features:
• Create and manage crowdfunding campaigns
• Support innovative projects with secure payments
• Track project progress and updates
• Connect with a global community of creators
• Exclusive rewards for backers

Why Crowdaa?
- Secure payment processing
- Low platform fees
- Real-time project updates
- Social sharing tools
- Multilingual support

Join thousands of creators and backers making dreams come true!`,
    
    // Métadonnées supplémentaires
    video: '', // URL YouTube optionnelle
    contactEmail: 'support@crowdaa.com',
    contactWebsite: 'https://crowdaa.com',
    contactPhone: '+1234567890',
    privacyPolicy: 'https://crowdaa.com/privacy'
  },
  
  // Localisations
  localizations: {
    'fr-FR': {
      title: 'Crowdaa - Plateforme de Financement Participatif',
      shortDescription: 'Soutenez des projets, levez des fonds, réalisez des idées',
      fullDescription: `Crowdaa est une plateforme révolutionnaire de financement participatif qui connecte créateurs et contributeurs dans le monde entier.

Fonctionnalités :
• Créez et gérez des campagnes de crowdfunding
• Soutenez des projets innovants avec des paiements sécurisés
• Suivez l'avancement et les mises à jour des projets
• Connectez-vous avec une communauté mondiale de créateurs
• Récompenses exclusives pour les contributeurs

Pourquoi Crowdaa ?
- Traitement sécurisé des paiements
- Frais de plateforme réduits
- Mises à jour en temps réel
- Outils de partage social
- Support multilingue

Rejoignez des milliers de créateurs et contributeurs qui réalisent leurs rêves !`
    }
  },
  
  // Catégories (Android)
  category: 'FINANCE', // ou SOCIAL
  contentRating: {
    questionnaire: {
      // Réponses au questionnaire de classification
      violence: false,
      sexuality: false,
      language: false,
      controlledSubstance: false,
      // ... autres questions selon votre app
    }
  },
  
  // Prix et distribution
  pricing: {
    free: true, // App gratuite
    countries: 'ALL' // Disponible dans tous les pays
  },
  
  // Achats intégrés (IAP)
  inAppProducts: [
    {
      sku: 'com.crowdaa.coins_100',
      productType: 'inapp', // 'inapp' pour consommable, 'subs' pour abonnement
      defaultPrice: '990000', // En micros (0.99 USD = 990000 micros)
      defaultLanguage: 'en-US',
      listings: {
        'en-US': {
          title: '100 Coins',
          description: 'Get 100 coins to support projects'
        },
        'fr-FR': {
          title: '100 Pièces',
          description: 'Obtenez 100 pièces pour soutenir des projets'
        }
      },
      prices: {
        'US': '990000',  // $0.99
        'FR': '990000',  // €0.99
        'GB': '790000',  // £0.79
        // Ajouter d'autres pays si nécessaire
      }
    },
    {
      sku: 'com.crowdaa.coins_500',
      productType: 'inapp',
      defaultPrice: '3990000', // $3.99
      defaultLanguage: 'en-US',
      listings: {
        'en-US': {
          title: '500 Coins Bundle',
          description: 'Best value! Get 500 coins with bonus'
        },
        'fr-FR': {
          title: 'Pack 500 Pièces',
          description: 'Meilleure valeur ! Obtenez 500 pièces avec bonus'
        }
      }
    },
    {
      sku: 'com.crowdaa.remove_ads',
      productType: 'inapp',
      defaultPrice: '1990000', // $1.99
      defaultLanguage: 'en-US',
      listings: {
        'en-US': {
          title: 'Remove Ads Forever',
          description: 'Enjoy Crowdaa without any advertisements'
        },
        'fr-FR': {
          title: 'Supprimer les Publicités',
          description: 'Profitez de Crowdaa sans aucune publicité'
        }
      }
    }
  ],
  
  // Abonnements
  subscriptions: [
    {
      sku: 'com.crowdaa.premium_monthly',
      basePlanId: 'monthly',
      defaultPrice: '4990000', // $4.99/mois
      defaultLanguage: 'en-US',
      listings: {
        'en-US': {
          title: 'Crowdaa Premium Monthly',
          description: 'Unlimited project creation and premium features'
        },
        'fr-FR': {
          title: 'Crowdaa Premium Mensuel',
          description: 'Création de projets illimitée et fonctionnalités premium'
        }
      }
    },
    {
      sku: 'com.crowdaa.premium_yearly',
      basePlanId: 'yearly',
      defaultPrice: '49990000', // $49.99/an
      defaultLanguage: 'en-US',
      listings: {
        'en-US': {
          title: 'Crowdaa Premium Yearly',
          description: 'Save 20%! Full year of premium features'
        },
        'fr-FR': {
          title: 'Crowdaa Premium Annuel',
          description: 'Économisez 20% ! Une année complète de fonctionnalités premium'
        }
      }
    }
  ],
  
  // Chemins des assets
  assets: {
    icon: './assets/icon.png', // 512x512 PNG
    featureGraphic: './assets/feature-graphic.png', // 1024x500 PNG
    screenshots: {
      phone: [
        './assets/screenshots/android/phone/01.png',
        './assets/screenshots/android/phone/02.png',
        './assets/screenshots/android/phone/03.png',
        './assets/screenshots/android/phone/04.png'
      ],
      tablet7: [
        './assets/screenshots/android/tablet7/01.png',
        './assets/screenshots/android/tablet7/02.png'
      ],
      tablet10: [
        './assets/screenshots/android/tablet10/01.png',
        './assets/screenshots/android/tablet10/02.png'
      ]
    }
  },
  
  // Version et release notes
  release: {
    versionCode: 1, // Doit être incrémenté à chaque release
    versionName: '1.0.0',
    releaseNotes: {
      'en-US': 'Initial release with core crowdfunding features',
      'fr-FR': 'Version initiale avec les fonctionnalités principales de crowdfunding'
    },
    // Stratégie de déploiement
    rollout: {
      userFraction: 0.1, // 10% des utilisateurs (pour test)
      // ou 1.0 pour 100% (release complète)
    }
  },
  
  // Options de publication
  publishOptions: {
    autoPublish: false, // false = review manuel, true = publication auto
    track: 'internal', // 'internal', 'alpha', 'beta', 'production'
  }
};

// ==================== CLASSE PRINCIPALE ====================
class GooglePlayPublisher {
  constructor(config) {
    this.config = config;
    this.auth = null;
    this.androidPublisher = null;
    this.editId = null;
    this.startTime = Date.now();
    this.stats = {
      success: [],
      warnings: [],
      errors: []
    };
  }
  
  // Utilitaire de log avec couleurs
  log(message, type = 'info') {
    const icons = {
      success: '✅ ',
      error: '❌ ',
      warning: '⚠️  ',
      info: 'ℹ️  ',
      header: '\n📱 ',
      money: '💰 ',
      rocket: '🚀 ',
      package: '📦 ',
      time: '⏳ ',
      build: '🔨 ',
      link: '🔗 ',
      note: '📝 ',
      submit: '📤 ',
      check: '✓ ',
      dim: ''
    };
    
    const colors = {
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.blue,
      header: chalk.bold.cyan,
      money: chalk.green,
      rocket: chalk.magenta,
      package: chalk.cyan,
      time: chalk.gray,
      build: chalk.blue,
      link: chalk.cyan,
      note: chalk.yellow,
      submit: chalk.green,
      check: chalk.green,
      dim: chalk.dim
    };
    
    const icon = icons[type] || '';
    const color = colors[type] || ((x) => x);
    const formattedMessage = `${icon}${color(message)}`;
    
    console.log(formattedMessage);
    
    // Collecte des stats
    if (type === 'success') this.stats.success.push(message);
    if (type === 'warning') this.stats.warnings.push(message);
    if (type === 'error') this.stats.errors.push(message);
  }
  
  // ================= AUTHENTIFICATION =================
  async authenticate() {
    try {
      this.log('AUTHENTIFICATION GOOGLE PLAY', 'header');
      this.log('Chargement du service account...', 'time');
      
      // Charger les credentials du service account
      const keyFile = await fs.readFile(this.config.serviceAccountKeyPath, 'utf8');
      const key = JSON.parse(keyFile);
      
      // Créer l'authentification
      this.auth = new google.auth.GoogleAuth({
        credentials: key,
        scopes: ['https://www.googleapis.com/auth/androidpublisher']
      });
      
      // Initialiser le client Android Publisher
      this.androidPublisher = google.androidpublisher({
        version: 'v3',
        auth: this.auth
      });
      
      // Vérifier l'accès en récupérant les infos de l'app
      const app = await this.androidPublisher.edits.insert({
        packageName: this.config.packageName
      });
      
      this.editId = app.data.id;
      
      this.log('Authentification réussie', 'success');
      this.log(`Package: ${this.config.packageName}`, 'info');
      this.log(`Edit ID: ${this.editId}`, 'dim');
      
      return true;
    } catch (error) {
      this.log(`Erreur authentification: ${error.message}`, 'error');
      throw error;
    }
  }
  
  // ================= MÉTADONNÉES APP =================
  async updateAppMetadata() {
    try {
      this.log('MÉTADONNÉES DE L\'APP', 'header');
      
      // Mise à jour pour la langue par défaut
      await this.updateListing(this.config.app.defaultLanguage, {
        title: this.config.app.title,
        shortDescription: this.config.app.shortDescription,
        fullDescription: this.config.app.fullDescription,
        video: this.config.app.video
      });
      
      // Mise à jour des localisations
      for (const [locale, data] of Object.entries(this.config.localizations)) {
        await this.updateListing(locale, data);
      }
      
      // Mise à jour des détails de l'app
      await this.androidPublisher.edits.details.update({
        packageName: this.config.packageName,
        editId: this.editId,
        requestBody: {
          contactEmail: this.config.app.contactEmail,
          contactPhone: this.config.app.contactPhone,
          contactWebsite: this.config.app.contactWebsite,
          defaultLanguage: this.config.app.defaultLanguage
        }
      });
      
      this.log('Métadonnées mises à jour', 'success');
      
    } catch (error) {
      this.log(`Erreur métadonnées: ${error.message}`, 'error');
    }
  }
  
  async updateListing(language, data) {
    try {
      await this.androidPublisher.edits.listings.update({
        packageName: this.config.packageName,
        editId: this.editId,
        language: language,
        requestBody: {
          language: language,
          title: data.title,
          shortDescription: data.shortDescription,
          fullDescription: data.fullDescription,
          video: data.video || ''
        }
      });
      
      this.log(`Listing ${language} mis à jour`, 'success');
    } catch (error) {
      this.log(`Erreur listing ${language}: ${error.message}`, 'warning');
    }
  }
  
  // ================= ACHATS INTÉGRÉS (IAP) =================
  async createInAppProducts() {
    if (!this.config.inAppProducts || this.config.inAppProducts.length === 0) {
      this.log('Aucun IAP à configurer', 'info');
      return;
    }
    
    this.log('ACHATS INTÉGRÉS (IAP)', 'header');
    
    for (const product of this.config.inAppProducts) {
      try {
        this.log(`Création IAP: ${product.sku}`, 'package');
        
        // Créer ou mettre à jour le produit
        const iapData = {
          packageName: this.config.packageName,
          sku: product.sku,
          requestBody: {
            packageName: this.config.packageName,
            sku: product.sku,
            status: 'active',
            purchaseType: product.productType === 'inapp' ? 'managedProduct' : 'subscription',
            defaultLanguage: product.defaultLanguage,
            listings: product.listings,
            defaultPrice: {
              priceMicros: product.defaultPrice,
              currency: 'USD'
            }
          }
        };
        
        try {
          // Essayer de créer le produit
          await this.androidPublisher.inappproducts.insert(iapData);
          this.log(`✅ IAP créé: ${product.sku}`, 'success');
        } catch (error) {
          if (error.message.includes('already exists')) {
            // Si existe déjà, mettre à jour
            await this.androidPublisher.inappproducts.update({
              ...iapData,
              sku: product.sku
            });
            this.log(`✅ IAP mis à jour: ${product.sku}`, 'success');
          } else {
            throw error;
          }
        }
        
        // Configurer les prix par pays si spécifiés
        if (product.prices) {
          for (const [country, price] of Object.entries(product.prices)) {
            this.log(`   Prix ${country}: ${price} micros`, 'dim');
          }
        }
        
      } catch (error) {
        this.log(`Erreur IAP ${product.sku}: ${error.message}`, 'error');
      }
    }
  }
  
  // ================= ABONNEMENTS =================
  async createSubscriptions() {
    if (!this.config.subscriptions || this.config.subscriptions.length === 0) {
      this.log('Aucun abonnement à configurer', 'info');
      return;
    }
    
    this.log('ABONNEMENTS', 'header');
    
    for (const subscription of this.config.subscriptions) {
      try {
        this.log(`Création abonnement: ${subscription.sku}`, 'package');
        
        const subData = {
          packageName: this.config.packageName,
          productId: subscription.sku,
          requestBody: {
            productId: subscription.sku,
            packageName: this.config.packageName,
            listings: subscription.listings,
            basePlans: [{
              basePlanId: subscription.basePlanId,
              autoRenewingBasePlanType: {
                billingPeriodDuration: subscription.basePlanId === 'monthly' ? 'P1M' : 'P1Y',
                gracePeriodDuration: 'P7D', // 7 jours de grâce
                resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE'
              },
              regionalConfigs: [{
                regionCode: 'US',
                newSubscriberAvailability: true,
                price: {
                  priceMicros: subscription.defaultPrice,
                  currency: 'USD'
                }
              }]
            }]
          }
        };
        
        try {
          // API v3 pour les abonnements
          await this.androidPublisher.monetization.subscriptions.create(subData);
          this.log(`✅ Abonnement créé: ${subscription.sku}`, 'success');
        } catch (error) {
          if (error.message.includes('already exists')) {
            this.log(`⚠️ Abonnement existe déjà: ${subscription.sku}`, 'warning');
          } else {
            throw error;
          }
        }
        
      } catch (error) {
        this.log(`Erreur abonnement ${subscription.sku}: ${error.message}`, 'error');
      }
    }
  }
  
  // ================= SCREENSHOTS ET IMAGES =================
  async uploadAssets() {
    this.log('ASSETS ET SCREENSHOTS', 'header');
    
    try {
      // Upload de l'icône si elle existe
      if (this.config.assets.icon && await this.fileExists(this.config.assets.icon)) {
        await this.uploadImage('icon', this.config.assets.icon);
      }
      
      // Upload du feature graphic
      if (this.config.assets.featureGraphic && await this.fileExists(this.config.assets.featureGraphic)) {
        await this.uploadImage('featureGraphic', this.config.assets.featureGraphic);
      }
      
      // Upload des screenshots
      for (const [deviceType, screenshots] of Object.entries(this.config.assets.screenshots)) {
        for (let i = 0; i < screenshots.length; i++) {
          const screenshotPath = screenshots[i];
          if (await this.fileExists(screenshotPath)) {
            await this.uploadScreenshot(deviceType, screenshotPath, i);
          }
        }
      }
      
      this.log('Assets uploadés', 'success');
      
    } catch (error) {
      this.log(`Erreur upload assets: ${error.message}`, 'warning');
      this.log('Les images peuvent être uploadées manuellement dans Play Console', 'info');
    }
  }
  
  async uploadImage(imageType, imagePath) {
    try {
      const imageData = await fs.readFile(imagePath);
      
      await this.androidPublisher.edits.images.upload({
        packageName: this.config.packageName,
        editId: this.editId,
        language: this.config.app.defaultLanguage,
        imageType: imageType,
        media: {
          mimeType: 'image/png',
          body: imageData
        }
      });
      
      this.log(`Image ${imageType} uploadée`, 'success');
    } catch (error) {
      this.log(`Erreur upload ${imageType}: ${error.message}`, 'warning');
    }
  }
  
  async uploadScreenshot(deviceType, screenshotPath, index) {
    try {
      const imageData = await fs.readFile(screenshotPath);
      const imageTypeMap = {
        'phone': 'phoneScreenshots',
        'tablet7': 'sevenInchScreenshots',
        'tablet10': 'tenInchScreenshots'
      };
      
      await this.androidPublisher.edits.images.upload({
        packageName: this.config.packageName,
        editId: this.editId,
        language: this.config.app.defaultLanguage,
        imageType: imageTypeMap[deviceType] || 'phoneScreenshots',
        media: {
          mimeType: 'image/png',
          body: imageData
        }
      });
      
      this.log(`Screenshot ${deviceType} #${index + 1} uploadé`, 'success');
    } catch (error) {
      this.log(`Erreur screenshot ${deviceType}: ${error.message}`, 'warning');
    }
  }
  
  // ================= APK/BUNDLE UPLOAD =================
  async uploadBundle(bundlePath) {
    if (!bundlePath || !await this.fileExists(bundlePath)) {
      this.log('Aucun bundle à uploader', 'info');
      return null;
    }
    
    this.log('UPLOAD DU BUNDLE', 'header');
    
    try {
      const bundleData = await fs.readFile(bundlePath);
      
      const response = await this.androidPublisher.edits.bundles.upload({
        packageName: this.config.packageName,
        editId: this.editId,
        media: {
          mimeType: 'application/octet-stream',
          body: bundleData
        }
      });
      
      this.log(`Bundle uploadé: version ${response.data.versionCode}`, 'success');
      return response.data.versionCode;
      
    } catch (error) {
      this.log(`Erreur upload bundle: ${error.message}`, 'error');
      return null;
    }
  }
  
  // ================= RELEASE =================
  async createRelease(versionCode) {
    this.log('CRÉATION DE LA RELEASE', 'header');
    
    try {
      const track = this.config.publishOptions.track || 'internal';
      
      const releaseData = {
        name: this.config.release.versionName,
        versionCodes: [versionCode || this.config.release.versionCode],
        releaseNotes: Object.entries(this.config.release.releaseNotes).map(([lang, notes]) => ({
          language: lang,
          text: notes
        })),
        status: this.config.publishOptions.autoPublish ? 'completed' : 'draft'
      };
      
      // Ajouter le rollout si configuré
      if (this.config.release.rollout && this.config.release.rollout.userFraction < 1.0) {
        releaseData.userFraction = this.config.release.rollout.userFraction;
        releaseData.status = 'inProgress'; // Rollout progressif
      }
      
      await this.androidPublisher.edits.tracks.update({
        packageName: this.config.packageName,
        editId: this.editId,
        track: track,
        requestBody: {
          track: track,
          releases: [releaseData]
        }
      });
      
      this.log(`Release créée sur le track: ${track}`, 'success');
      if (releaseData.userFraction) {
        this.log(`Rollout: ${releaseData.userFraction * 100}% des utilisateurs`, 'info');
      }
      
    } catch (error) {
      this.log(`Erreur création release: ${error.message}`, 'error');
    }
  }
  
  // ================= COMMIT DES CHANGEMENTS =================
  async commitChanges() {
    this.log('VALIDATION DES CHANGEMENTS', 'header');
    
    try {
      const result = await this.androidPublisher.edits.commit({
        packageName: this.config.packageName,
        editId: this.editId
      });
      
      this.log('Changements validés et envoyés à Google Play', 'success');
      this.log(`Edit ID committed: ${result.data.id}`, 'dim');
      
      return true;
    } catch (error) {
      this.log(`Erreur commit: ${error.message}`, 'error');
      
      // En cas d'erreur, on peut valider les changements
      await this.validateEdit();
      
      return false;
    }
  }
  
  async validateEdit() {
    try {
      const validation = await this.androidPublisher.edits.validate({
        packageName: this.config.packageName,
        editId: this.editId
      });
      
      this.log('Validation des changements...', 'info');
      
      if (validation.data && validation.data.errors) {
        validation.data.errors.forEach(error => {
          this.log(`Erreur validation: ${error}`, 'error');
        });
      }
    } catch (error) {
      this.log(`Erreur validation: ${error.message}`, 'warning');
    }
  }
  
  // ================= UTILITAIRES =================
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  // ================= MÉTHODE PRINCIPALE =================
  async publish() {
    console.log(chalk.bold.magenta('\n🚀 PUBLICATION GOOGLE PLAY CONSOLE\n'));
    console.log(chalk.dim('─'.repeat(50)));
    
    try {
      // 1. Authentification
      await this.authenticate();
      
      // 2. Métadonnées de l'app
      await this.updateAppMetadata();
      
      // 3. Achats intégrés
      await this.createInAppProducts();
      
      // 4. Abonnements
      await this.createSubscriptions();
      
      // 5. Upload des assets
      await this.uploadAssets();
      
      // 6. Upload du bundle (si fourni)
      const bundlePath = process.argv[2]; // Passer en argument: node publish-android.js app.aab
      let versionCode = null;
      if (bundlePath) {
        versionCode = await this.uploadBundle(bundlePath);
      }
      
      // 7. Créer la release
      if (versionCode || this.config.release.versionCode) {
        await this.createRelease(versionCode);
      }
      
      // 8. Commit des changements
      const committed = await this.commitChanges();
      
      // Afficher le résumé
      this.displaySummary();
      
    } catch (error) {
      this.log(`\nErreur fatale: ${error.message}`, 'error');
      console.error(error);
    }
  }
  
  displaySummary() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log(chalk.dim('\n' + '─'.repeat(50)));
    console.log(chalk.bold.green('\n✅ PUBLICATION TERMINÉE!\n'));
    
    console.log(chalk.bold('📊 Résumé:'));
    console.log(`   • Durée: ${duration}s`);
    console.log(`   • Package: ${this.config.packageName}`);
    console.log(`   • Version: ${this.config.release.versionName}`);
    console.log(`   • Track: ${this.config.publishOptions.track}`);
    console.log(`   • IAP créés: ${this.config.inAppProducts.length}`);
    console.log(`   • Abonnements: ${this.config.subscriptions.length}`);
    
    if (this.stats.success.length > 0) {
      console.log(chalk.bold.green('\n✅ Succès:'));
      this.stats.success.slice(0, 10).forEach(msg => {
        console.log(`   • ${msg}`);
      });
    }
    
    if (this.stats.warnings.length > 0) {
      console.log(chalk.bold.yellow('\n⚠️ Avertissements:'));
      this.stats.warnings.forEach(msg => {
        console.log(`   • ${msg}`);
      });
    }
    
    if (this.stats.errors.length > 0) {
      console.log(chalk.bold.red('\n❌ Erreurs:'));
      this.stats.errors.forEach(msg => {
        console.log(`   • ${msg}`);
      });
    }
    
    console.log(chalk.bold.cyan('\n💡 Prochaines étapes:'));
    console.log('   1. Allez sur Google Play Console');
    console.log('   2. Vérifiez les métadonnées et screenshots');
    console.log('   3. Testez les IAP en mode sandbox');
    console.log('   4. Complétez le questionnaire de contenu');
    console.log('   5. Soumettez pour review\n');
  }
}

// ==================== EXÉCUTION ====================
async function main() {
  const publisher = new GooglePlayPublisher(config);
  await publisher.publish();
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Erreur non gérée:'), error);
  process.exit(1);
});

// Lancer le script
main().catch(error => {
  console.error(chalk.red('\n❌ Erreur fatale:'), error);
  process.exit(1);
});