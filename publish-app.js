#!/usr/bin/env node

/**
 * Script OPTIMISÉ pour remplir TOUTES les métadonnées sur App Store Connect
 * Version 6.0 - Avec IAP et Subscriptions
 * 
 * Le build est déjà uploadé - Ce script remplit tout le reste :
 * - Descriptions, keywords, URLs
 * - Catégories et classification par âge
 * - Prix et disponibilité
 * - Politique de confidentialité
 * - Informations de review
 * - Association du build
 * - IAP et Subscriptions
 * - Screenshots (recommandation d'upload manuel)
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Compatibilité Chalk
let chalk;
try {
  chalk = require('chalk');
} catch (e) {
  chalk = {
    green: (text) => text,
    red: (text) => text,
    yellow: (text) => text,
    blue: (text) => text,
    cyan: (text) => text,
    gray: (text) => text,
    white: (text) => text,
    bold: (text) => text,
    magenta: (text) => text
  };
}

class AppStoreMetadataPublisher {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.tokenExpiry = null;
    this.appId = null;
    this.versionId = null;
    this.appInfoId = null;
    this.subscriptionGroupId = null;
    this.errors = [];
    this.warnings = [];
    this.completedSteps = [];
  }

  // ================= HELPERS =================

  log(message, type = 'info') {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      loading: '⏳',
      money: '💰'
    };
    
    const colors = {
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.blue,
      loading: chalk.cyan,
      money: chalk.magenta
    };

    const icon = icons[type] || '';
    const color = colors[type] || chalk.white;
    
    console.log(color(`${icon}  ${message}`));
    
    if (type === 'error') this.errors.push(message);
    if (type === 'warning') this.warnings.push(message);
    if (type === 'success') this.completedSteps.push(message);
  }

  // JWT avec auto-refresh
  generateJWT() {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
      return this.token;
    }

    const privateKey = fs.readFileSync(this.config.keyPath, 'utf8');
    
    const payload = {
      iss: this.config.issuerId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (20 * 60),
      aud: 'appstoreconnect-v1'
    };

    this.token = jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      keyid: this.config.keyId
    });

    this.tokenExpiry = Date.now() + (19 * 60 * 1000);
    return this.token;
  }

  // API Request avec retry intelligent
  async apiRequest(method, endpoint, data = null, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const headers = {
          'Authorization': `Bearer ${this.generateJWT()}`,
          'Content-Type': 'application/json'
        };

        const response = await axios({
          method,
          url: `https://api.appstoreconnect.apple.com/v1${endpoint}`,
          headers,
          data,
          timeout: 30000
        });
        
        return response.data;
        
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const status = error.response?.status;
        
        if (status === 429 && !isLastAttempt) {
          const delay = Math.pow(2, attempt) * 1000;
          this.log(`Rate limit atteint, attente ${delay/1000}s...`, 'warning');
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        if (status === 401 && !isLastAttempt) {
          this.log('Token expiré, regénération...', 'warning');
          this.token = null;
          this.generateJWT();
          continue;
        }
        
        if (isLastAttempt) {
          const errorMsg = `API ${endpoint}: ${error.response?.data?.errors?.[0]?.detail || error.message}`;
          this.log(errorMsg, 'error');
          throw new Error(errorMsg);
        }
      }
    }
  }

  // ================= ÉTAPE 1: RÉCUPÉRATION IDs =================

  async getAppId() {
    this.log('Recherche de l\'app...', 'loading');
    
    const response = await this.apiRequest('GET', 
      `/apps?filter[bundleId]=${this.config.bundleId}`);
    
    if (response.data.length === 0) {
      throw new Error(`App avec bundle ID ${this.config.bundleId} introuvable`);
    }
    
    this.appId = response.data[0].id;
    const appName = response.data[0].attributes.name;
    this.log(`App trouvée: ${appName} (${this.appId})`, 'success');
    
    return this.appId;
  }

  async getAppInfo() {
    const response = await this.apiRequest('GET', `/apps/${this.appId}/appInfos`);
    
    if (response.data.length > 0) {
      this.appInfoId = response.data[0].id;
      return this.appInfoId;
    }
    
    this.log('AppInfo non trouvée, certaines métadonnées ne pourront pas être mises à jour', 'warning');
    return null;
  }

  async createOrGetAppStoreVersion() {
    this.log(`Création/récupération version ${this.config.versionString}...`, 'loading');
    
    const existingVersions = await this.apiRequest('GET',
      `/apps/${this.appId}/appStoreVersions?filter[versionString]=${this.config.versionString}`);
    
    if (existingVersions.data.length > 0) {
      this.versionId = existingVersions.data[0].id;
      const state = existingVersions.data[0].attributes.appStoreState;
      this.log(`Version existante trouvée (état: ${state})`, 'warning');
      
      if (!['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED'].includes(state)) {
        this.log(`Version dans un état non modifiable: ${state}`, 'warning');
      }
      
      return this.versionId;
    }

    const versionData = {
      data: {
        type: 'appStoreVersions',
        attributes: {
          platform: 'IOS',
          versionString: this.config.versionString,
          copyright: this.config.copyright,
          releaseType: this.config.releaseType || 'MANUAL'
        },
        relationships: {
          app: {
            data: { type: 'apps', id: this.appId }
          }
        }
      }
    };

    const response = await this.apiRequest('POST', '/appStoreVersions', versionData);
    this.versionId = response.data.id;
    this.log(`Version créée: ${this.config.versionString}`, 'success');
    
    return this.versionId;
  }

  // ================= ÉTAPE 2: CATÉGORIES =================

  async setAppCategories() {
    if (!this.config.categories || !this.appInfoId) return;
    
    this.log('Configuration des catégories...', 'loading');
    
    try {
      const categoryData = {
        data: {
          type: 'appInfos',
          id: this.appInfoId,
          relationships: {
            primaryCategory: {
              data: { type: 'appCategories', id: this.config.categories.primary }
            }
          }
        }
      };

      if (this.config.categories.secondary) {
        categoryData.data.relationships.secondaryCategory = {
          data: { type: 'appCategories', id: this.config.categories.secondary }
        };
      }

      await this.apiRequest('PATCH', `/appInfos/${this.appInfoId}`, categoryData);
      this.log(`Catégories configurées: ${this.config.categories.primary} / ${this.config.categories.secondary || 'Aucune'}`, 'success');
      
    } catch (error) {
      this.log(`Erreur catégories: ${error.message}`, 'warning');
    }
  }

  // ================= ÉTAPE 3: CLASSIFICATION PAR ÂGE =================

  async setAgeRating() {
    if (!this.config.ageRating) return;
    
    this.log('Configuration de la classification par âge...', 'loading');
    
    try {
      const existing = await this.apiRequest('GET',
        `/appStoreVersions/${this.versionId}/ageRatingDeclaration`);
      
      const ageRatingData = {
        data: {
          type: 'ageRatingDeclarations',
          attributes: {
            alcoholTobaccoOrDrugUseOrReferences: this.config.ageRating.alcohol || 'NONE',
            gamblingSimulated: this.config.ageRating.gamblingSimulated || 'NONE',
            violenceCartoonOrFantasy: this.config.ageRating.violenceCartoon || 'NONE',
            violenceRealistic: this.config.ageRating.violenceRealistic || 'NONE',
            violenceRealisticProlongedGraphicOrSadistic: 'NONE',
            profanityOrCrudeHumor: this.config.ageRating.profanity || 'NONE',
            matureOrSuggestiveThemes: this.config.ageRating.matureThemes || 'NONE',
            sexualContentOrNudity: this.config.ageRating.sexualContent || 'NONE',
            sexualContentGraphicAndNudity: 'NONE',
            horrorOrFearThemes: this.config.ageRating.horror || 'NONE',
            medicalOrTreatmentInformation: this.config.ageRating.medicalInfo || 'NONE',
            contests: this.config.ageRating.contests || 'NONE',
            gambling: this.config.ageRating.gambling || false,
            unrestrictedWebAccess: this.config.ageRating.unrestrictedWeb || false,
            kidsAgeBand: null
          }
        }
      };

      if (existing.data) {
        ageRatingData.data.id = existing.data.id;
        await this.apiRequest('PATCH', 
          `/ageRatingDeclarations/${existing.data.id}`, 
          ageRatingData);
      } else {
        ageRatingData.data.relationships = {
          appStoreVersion: {
            data: { type: 'appStoreVersions', id: this.versionId }
          }
        };
        await this.apiRequest('POST', '/ageRatingDeclarations', ageRatingData);
      }
      
      this.log('Classification par âge configurée: 4+', 'success');
      
    } catch (error) {
      this.log(`Erreur classification âge: ${error.message}`, 'warning');
    }
  }

  // ================= ÉTAPE 4: LOCALIZATIONS =================

  async addAppStoreVersionLocalizations() {
    this.log('Configuration des descriptions et métadonnées...', 'loading');

    for (const [locale, localization] of Object.entries(this.config.localizations)) {
      try {
        const existing = await this.apiRequest('GET',
          `/appStoreVersions/${this.versionId}/appStoreVersionLocalizations?filter[locale]=${locale}`);
        
        const versionResponse = await this.apiRequest('GET', `/appStoreVersions/${this.versionId}`);
        const versionState = versionResponse.data.attributes.appStoreState;
        
        // États permettant l'édition du What's New (documentation août 2025)
        const editableStates = [
          'PREPARE_FOR_SUBMISSION',
          'DEVELOPER_REJECTED',
          'WAITING_FOR_REVIEW'  // Ajouté selon la doc 2025
        ];
        
        const canEditWhatsNew = editableStates.includes(versionState);
        
        if (!canEditWhatsNew && localization.whatsNew) {
          this.log(`What's New non éditable (état: ${versionState})`, 'info');
        }
        
        const localizationData = {
          data: {
            type: 'appStoreVersionLocalizations',
            attributes: {
              description: localization.description,
              keywords: localization.keywords,
              marketingUrl: localization.marketingUrl,
              supportUrl: localization.supportUrl,
              promotionalText: localization.promotionalText
            }
          }
        };

        if (canEditWhatsNew && localization.whatsNew) {
          localizationData.data.attributes.whatsNew = localization.whatsNew;
        }

        let localizationId;
        
        if (existing.data.length > 0) {
          localizationId = existing.data[0].id;
          localizationData.data.id = localizationId;
          
          try {
            await this.apiRequest('PATCH',
              `/appStoreVersionLocalizations/${localizationId}`,
              localizationData);
            this.log(`Métadonnées mises à jour: ${locale}`, 'success');
          } catch (error) {
            if (error.message.includes('whatsNew')) {
              delete localizationData.data.attributes.whatsNew;
              await this.apiRequest('PATCH',
                `/appStoreVersionLocalizations/${localizationId}`,
                localizationData);
              this.log(`Métadonnées mises à jour: ${locale} (sans whatsNew)`, 'success');
            } else {
              throw error;
            }
          }
        } else {
          localizationData.data.attributes.locale = locale;
          localizationData.data.relationships = {
            appStoreVersion: {
              data: { type: 'appStoreVersions', id: this.versionId }
            }
          };
          const response = await this.apiRequest('POST', 
            '/appStoreVersionLocalizations', 
            localizationData);
          localizationId = response.data.id;
          this.log(`Métadonnées créées: ${locale}`, 'success');
        }
        
        this.log(`Screenshots ${locale}: Upload manuel recommandé dans App Store Connect`, 'info');
        
      } catch (error) {
        this.log(`Erreur localisation ${locale}: ${error.message}`, 'error');
      }
    }
  }

  // ================= ÉTAPE 5: IAP ET SUBSCRIPTIONS =================

  async createSubscriptionGroup() {
    if (!this.config.subscriptionGroup) return null;
    
    this.log('Création du groupe d\'abonnements...', 'money');
    
    try {
      // Vérifier si le groupe existe déjà
      const existingGroups = await this.apiRequest('GET',
        `/apps/${this.appId}/subscriptionGroups`);
      
      const existingGroup = existingGroups.data.find(g => 
        g.attributes.referenceName === this.config.subscriptionGroup.referenceName
      );
      
      if (existingGroup) {
        this.subscriptionGroupId = existingGroup.id;
        this.log(`Groupe d'abonnements existant trouvé: ${this.config.subscriptionGroup.referenceName}`, 'info');
        return this.subscriptionGroupId;
      }
      
      // Créer le groupe
      const groupData = {
        data: {
          type: 'subscriptionGroups',
          attributes: {
            referenceName: this.config.subscriptionGroup.referenceName
          },
          relationships: {
            app: {
              data: { type: 'apps', id: this.appId }
            }
          }
        }
      };
      
      const response = await this.apiRequest('POST', '/subscriptionGroups', groupData);
      this.subscriptionGroupId = response.data.id;
      
      // Ajouter les localisations
      for (const [locale, localization] of Object.entries(this.config.subscriptionGroup.localizations || {})) {
        try {
          const locData = {
            data: {
              type: 'subscriptionGroupLocalizations',
              attributes: {
                locale: locale,
                name: localization.name,
                customAppName: localization.customAppName
              },
              relationships: {
                subscriptionGroup: {
                  data: { type: 'subscriptionGroups', id: this.subscriptionGroupId }
                }
              }
            }
          };
          
          await this.apiRequest('POST', '/subscriptionGroupLocalizations', locData);
        } catch (error) {
          this.log(`Erreur localisation groupe ${locale}: ${error.message}`, 'warning');
        }
      }
      
      this.log(`Groupe d'abonnements créé: ${this.config.subscriptionGroup.referenceName}`, 'success');
      return this.subscriptionGroupId;
      
    } catch (error) {
      this.log(`Erreur création groupe abonnements: ${error.message}`, 'error');
      return null;
    }
  }

  async createSubscriptions() {
    if (!this.config.subscriptions || this.config.subscriptions.length === 0) return;
    
    this.log('Création des abonnements...', 'money');
    
    // S'assurer que le groupe existe
    if (!this.subscriptionGroupId) {
      await this.createSubscriptionGroup();
    }
    
    if (!this.subscriptionGroupId) {
      this.log('Impossible de créer les abonnements sans groupe', 'error');
      return;
    }
    
    for (const sub of this.config.subscriptions) {
      try {
        // Vérifier si l'abonnement existe déjà
        const existingSubs = await this.apiRequest('GET',
          `/subscriptionGroups/${this.subscriptionGroupId}/subscriptions`);
        
        const existingSub = existingSubs.data?.find(s => 
          s.attributes.productId === sub.productId
        );
        
        if (existingSub) {
          this.log(`Abonnement ${sub.productId} existe déjà`, 'info');
          continue;
        }
        
        // Créer l'abonnement
        const subData = {
          data: {
            type: 'subscriptions',
            attributes: {
              name: sub.referenceName,
              productId: sub.productId,
              familySharable: sub.familySharable || false,
              reviewNote: sub.reviewNote || 'Subscription for premium features',
              groupLevel: sub.groupLevel || 1
            },
            relationships: {
              group: {
                data: { type: 'subscriptionGroups', id: this.subscriptionGroupId }
              }
            }
          }
        };
        
        const response = await this.apiRequest('POST', '/subscriptions', subData);
        const subId = response.data.id;
        
        // Ajouter les localisations
        for (const [locale, localization] of Object.entries(sub.localizations || {})) {
          try {
            const locData = {
              data: {
                type: 'subscriptionLocalizations',
                attributes: {
                  locale: locale,
                  name: localization.name,
                  description: localization.description
                },
                relationships: {
                  subscription: {
                    data: { type: 'subscriptions', id: subId }
                  }
                }
              }
            };
            
            await this.apiRequest('POST', '/subscriptionLocalizations', locData);
          } catch (error) {
            this.log(`Erreur localisation abonnement ${locale}: ${error.message}`, 'warning');
          }
        }
        
        // Configurer le prix - À faire manuellement dans App Store Connect
        if (sub.prices && sub.prices.length > 0) {
          this.log(`Prix ${sub.productId}: Configuration manuelle requise dans App Store Connect`, 'info');
          // L'API ne supporte pas les IDs de prix prédéfinis
          // Les prix doivent être configurés manuellement après création
        }
        
        this.log(`Abonnement créé: ${sub.referenceName} (${sub.productId})`, 'success');
        
      } catch (error) {
        this.log(`Erreur création abonnement ${sub.productId}: ${error.message}`, 'error');
      }
    }
  }

  async createInAppPurchases() {
    if (!this.config.inAppPurchases || this.config.inAppPurchases.length === 0) return;
    
    this.log('Création des achats intégrés (IAP)...', 'money');
    
    for (const iap of this.config.inAppPurchases) {
      try {
        // Note: Les IAP doivent être créés manuellement dans App Store Connect
        // L'API v2 est en cours de développement mais pas encore disponible pour tous
        this.log(`IAP ${iap.productId}: Création manuelle requise dans App Store Connect`, 'warning');
        this.log(`   Type: ${iap.type || 'CONSUMABLE'}`, 'info');
        this.log(`   Nom: ${iap.referenceName}`, 'info');
        continue;
        
        /* Code désactivé - en attente de l'API v2
        const response = await this.apiRequest('POST', '/v2/inAppPurchases', iapData);
        // Localisations et configuration seront faites manuellement
        */
        
      } catch (error) {
        this.log(`Erreur création IAP ${iap.productId}: ${error.message}`, 'error');
      }
    }
  }

  // ================= ÉTAPE 6: PRIX ET DISPONIBILITÉ =================

  async setPricingAndAvailability() {
    if (!this.config.pricing) return;
    
    this.log('Configuration des prix et de la disponibilité...', 'loading');
    
    try {
      // Nouveau système de tarification v2.3 (août 2025)
      if (this.config.pricing.schedulePrice !== undefined) {
        await this.setAppPriceSchedule();
      } else {
        this.log('Prix: Gratuit par défaut', 'info');
        this.log('Disponibilité: Mondiale par défaut', 'info');
      }
    } catch (error) {
      this.log(`Erreur configuration prix: ${error.message}`, 'warning');
    }
  }

  async setAppPriceSchedule() {
    this.log('Configuration du planning de prix (API v2.3)...', 'loading');
    
    try {
      // Récupérer les price points disponibles
      const pricePointsResponse = await this.apiRequest('GET',
        `/apps/${this.appId}/appPricePoints?filter[territory]=USA&limit=100`);
      
      // Trouver le price point pour le prix souhaité
      const targetPrice = this.config.pricing.schedulePrice;
      const pricePoint = pricePointsResponse.data.find(point => 
        parseFloat(point.attributes.customerPrice) === targetPrice
      );
      
      if (!pricePoint) {
        this.log(`Price point non trouvé pour ${targetPrice}$`, 'warning');
        return;
      }
      
      const scheduleData = {
        data: {
          type: 'appPriceSchedules',
          relationships: {
            app: {
              data: { type: 'apps', id: this.appId }
            },
            baseTerritory: {
              data: { type: 'territories', id: 'USA' }
            },
            manualPrices: {
              data: [
                { type: 'appPrices', id: 'new-price' }
              ]
            }
          }
        },
        included: [
          {
            id: 'new-price',
            type: 'appPrices',
            attributes: {
              startDate: new Date().toISOString().split('T')[0],
              endDate: null
            },
            relationships: {
              appPricePoint: {
                data: { type: 'appPricePoints', id: pricePoint.id }
              }
            }
          }
        ]
      };
      
      await this.apiRequest('POST', '/appPriceSchedules', scheduleData);
      this.log(`Prix configuré: ${targetPrice}$ (Price Point: ${pricePoint.id})`, 'success');
      
    } catch (error) {
      this.log(`Erreur App Price Schedule: ${error.message}`, 'warning');
    }
  }

  // ================= ÉTAPE 7: BUILD ET REVIEW =================

  async attachBuildToVersion() {
    this.log('Association du build existant...', 'loading');
    
    try {
      const buildsResponse = await this.apiRequest('GET',
        `/builds?filter[app]=${this.appId}&filter[expired]=false&sort=-uploadedDate&limit=10`);
      
      if (buildsResponse.data.length === 0) {
        throw new Error(`Aucun build trouvé. Assurez-vous d'avoir uploadé un build via Xcode`);
      }

      let build = null;
      const targetVersion = this.config.buildVersion || this.config.versionString;
      
      build = buildsResponse.data.find(b => 
        b.attributes.version === targetVersion
      );
      
      if (!build) {
        build = buildsResponse.data[0];
        this.log(`Build exact non trouvé pour version ${targetVersion}, utilisation du plus récent: ${build.attributes.version}`, 'warning');
      }
      
      const buildId = build.id;
      const buildVersion = build.attributes.version;
      const processingState = build.attributes.processingState;
      
      if (processingState === 'PROCESSING') {
        this.log('Build en cours de traitement par Apple (peut prendre 15-30 min)', 'warning');
      } else if (processingState !== 'VALID') {
        this.log(`Build dans un état invalide: ${processingState}`, 'warning');
        return;
      }

      const buildData = {
        data: {
          type: 'appStoreVersions',
          id: this.versionId,
          relationships: {
            build: {
              data: { type: 'builds', id: buildId }
            }
          }
        }
      };

      await this.apiRequest('PATCH', `/appStoreVersions/${this.versionId}`, buildData);
      this.log(`Build ${buildVersion} associé à la version`, 'success');
      
    } catch (error) {
      this.log(`Erreur association build: ${error.message}`, 'error');
    }
  }

  async addReviewDetails() {
    this.log('Ajout des informations de review...', 'loading');
    
    try {
      const existing = await this.apiRequest('GET',
        `/appStoreVersions/${this.versionId}/appStoreReviewDetail`);
      
      const reviewData = {
        data: {
          type: 'appStoreReviewDetails',
          attributes: {
            contactFirstName: this.config.reviewInfo.contactFirstName,
            contactLastName: this.config.reviewInfo.contactLastName,
            contactPhone: this.config.reviewInfo.contactPhone,
            contactEmail: this.config.reviewInfo.contactEmail,
            demoAccountName: this.config.reviewInfo.demoAccountName || null,
            demoAccountPassword: this.config.reviewInfo.demoAccountPassword || null,
            demoAccountRequired: this.config.reviewInfo.demoAccountRequired || false,
            notes: this.config.reviewInfo.notes
          }
        }
      };

      if (existing.data) {
        reviewData.data.id = existing.data.id;
        await this.apiRequest('PATCH', 
          `/appStoreReviewDetails/${existing.data.id}`, 
          reviewData);
      } else {
        reviewData.data.relationships = {
          appStoreVersion: {
            data: { type: 'appStoreVersions', id: this.versionId }
          }
        };
        await this.apiRequest('POST', '/appStoreReviewDetails', reviewData);
      }
      
      this.log('Informations de review configurées', 'success');
      
    } catch (error) {
      this.log(`Erreur infos review: ${error.message}`, 'error');
    }
  }

  async addEncryptionDeclaration() {
    if (!this.config.encryptionDeclaration) return;
    
    this.log('Déclaration de conformité export (chiffrement)...', 'loading');
    
    try {
      const encryptionData = {
        data: {
          type: 'appEncryptionDeclarations',
          attributes: {
            // usesEncryption ne doit pas être dans les attributs selon l'API
            exempt: this.config.encryptionDeclaration.exempt || true,
            containsProprietaryCryptography: this.config.encryptionDeclaration.containsProprietaryCryptography || false,
            containsThirdPartyCryptography: this.config.encryptionDeclaration.containsThirdPartyCryptography || false,
            availableOnFrenchStore: this.config.encryptionDeclaration.availableOnFrenchStore !== false,
            platform: 'IOS',
            appDescription: this.config.encryptionDeclaration.appDescription || 
              "L'app utilise uniquement les API de chiffrement standard (HTTPS)."
          },
          relationships: {
            app: {
              data: { type: 'apps', id: this.appId }
            }
          }
        }
      };

      if (this.versionId) {
        encryptionData.data.relationships.appStoreVersion = {
          data: { type: 'appStoreVersions', id: this.versionId }
        };
      }

      const response = await this.apiRequest('POST', '/appEncryptionDeclarations', encryptionData);
      const declarationId = response.data.id;
      
      // Associer la déclaration au build actuel si disponible
      if (declarationId) {
        const buildsResponse = await this.apiRequest('GET',
          `/appStoreVersions/${this.versionId}/build`);
        
        if (buildsResponse.data) {
          const buildId = buildsResponse.data.id;
          
          await this.apiRequest('POST', 
            `/appEncryptionDeclarations/${declarationId}/relationships/builds`, {
              data: [
                { type: 'builds', id: buildId }
              ]
            });
          
          this.log('Déclaration de chiffrement créée et associée au build', 'success');
        } else {
          this.log('Déclaration de chiffrement créée (à associer au build)', 'success');
        }
      }
      
    } catch (error) {
      // Si la déclaration existe déjà, ce n'est pas une erreur critique
      if (error.message.includes('already exists')) {
        this.log('Déclaration de chiffrement déjà existante', 'info');
      } else {
        this.log(`Erreur déclaration chiffrement: ${error.message}`, 'warning');
      }
    }
  }

  // ================= ÉTAPE 8: SOUMISSION =================

  async submitForReview() {
    if (!this.config.autoSubmit) {
      this.log('Mode test - Soumission manuelle requise', 'warning');
      return;
    }

    this.log('Soumission pour review...', 'loading');
    
    try {
      const versionResponse = await this.apiRequest('GET', `/appStoreVersions/${this.versionId}`);
      const state = versionResponse.data.attributes.appStoreState;
      
      if (state !== 'PREPARE_FOR_SUBMISSION') {
        throw new Error(`La version n'est pas prête pour soumission (état actuel: ${state})`);
      }
      
      const submissionData = {
        data: {
          type: 'appStoreVersionSubmissions',
          relationships: {
            appStoreVersion: {
              data: { type: 'appStoreVersions', id: this.versionId }
            }
          }
        }
      };

      const response = await this.apiRequest('POST', '/appStoreVersionSubmissions', submissionData);
      this.log('🎉 App soumise pour review Apple!', 'success');
      this.log(`ID de soumission: ${response.data.id}`, 'info');
      this.log('Délai de review habituel: 24-72 heures', 'info');
      
    } catch (error) {
      this.log(`Impossible de soumettre: ${error.message}`, 'error');
      this.log('Soumettez manuellement dans App Store Connect', 'warning');
    }
  }

  // ================= FLOW PRINCIPAL =================

  async fillAllMetadata() {
    const startTime = Date.now();
    
    try {
      console.log(chalk.cyan.bold('\n🚀 REMPLISSAGE COMPLET APP STORE CONNECT\n'));
      console.log(chalk.gray('─'.repeat(50)));
      
      // Authentification
      this.generateJWT();
      this.log('Authentification réussie', 'success');

      // Récupération des IDs
      console.log(chalk.yellow('\n📱 IDENTIFICATION APP\n'));
      await this.getAppId();
      await this.getAppInfo();
      await this.createOrGetAppStoreVersion();

      // Métadonnées principales
      console.log(chalk.yellow('\n📝 MÉTADONNÉES\n'));
      await this.setAppCategories();
      await this.setAgeRating();
      await this.addAppStoreVersionLocalizations();

      // Configuration commerciale
      console.log(chalk.yellow('\n💰 CONFIGURATION COMMERCIALE\n'));
      await this.setPricingAndAvailability();
      
      // IAP et Subscriptions
      if (this.config.inAppPurchases || this.config.subscriptions) {
        console.log(chalk.magenta('\n💎 ACHATS INTÉGRÉS ET ABONNEMENTS\n'));
        await this.createSubscriptionGroup();
        await this.createSubscriptions();
        await this.createInAppPurchases();
      }

      // Build et review
      console.log(chalk.yellow('\n🔗 BUILD ET REVIEW\n'));
      await this.attachBuildToVersion();
      await this.addReviewDetails();
      await this.addEncryptionDeclaration();

      // Soumission
      console.log(chalk.yellow('\n📋 SOUMISSION\n'));
      await this.submitForReview();

      // Résumé final
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(chalk.gray('\n' + '─'.repeat(50)));
      console.log(chalk.green.bold('\n✅ REMPLISSAGE TERMINÉ!\n'));
      
      console.log(chalk.white('📊 Résumé:'));
      console.log(chalk.gray(`   • Durée: ${duration}s`));
      console.log(chalk.gray(`   • Version: ${this.config.versionString}`));
      console.log(chalk.gray(`   • Bundle ID: ${this.config.bundleId}`));
      console.log(chalk.gray(`   • Étapes réussies: ${this.completedSteps.length}`));
      
      if (this.completedSteps.length > 0) {
        console.log(chalk.green('\n✅ Complété avec succès:'));
        this.completedSteps.forEach(step => {
          console.log(chalk.gray(`   • ${step}`));
        });
      }

      console.log(chalk.yellow('\n⚠️  Actions manuelles requises:'));
      console.log(chalk.gray('   1. Uploader les screenshots dans App Store Connect'));
      console.log(chalk.gray('   2. Configurer la politique de confidentialité'));
      console.log(chalk.gray('   3. Vérifier les prix des abonnements'));
      
      if (!this.config.autoSubmit) {
        console.log(chalk.gray('   4. Soumettre pour review'));
      }

      if (this.warnings.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Avertissements (${this.warnings.length}):`));
        this.warnings.forEach(w => console.log(chalk.gray(`   • ${w}`)));
      }
      
      if (this.errors.length > 0) {
        console.log(chalk.red(`\n❌ Erreurs non bloquantes (${this.errors.length}):`));
        this.errors.forEach(e => console.log(chalk.gray(`   • ${e}`)));
      }

      console.log(chalk.cyan('\n💡 Prochaines étapes:'));
      console.log(chalk.gray('   1. Allez sur App Store Connect'));
      console.log(chalk.gray('   2. Vérifiez les abonnements dans Monetization > Subscriptions'));
      console.log(chalk.gray('   3. Configurez les prix pour chaque territoire'));
      console.log(chalk.gray('   4. Uploadez les screenshots'));
      console.log(chalk.gray('   5. Soumettez pour review'));
      
    } catch (error) {
      console.log(chalk.red.bold(`\n❌ ERREUR FATALE: ${error.message}\n`));
      process.exit(1);
    }
  }
}

// ================= CONFIGURATION =================

const config = {
  // Authentification
  keyId: 'CJD3P7BNLJ',
  issuerId: '69a6de86-90b2-47e3-e053-5b8c7c11a4d1',
  keyPath: './AuthKey_CJD3P7BNLJ.p8',
  
  // App
  bundleId: 'com.crowdaa.jwl1a63sz71',
  versionString: '0.0.1',
  buildVersion: '1',
  copyright: '© 2025 Crowdaa',
  releaseType: 'MANUAL',
  
  // Catégories
  categories: {
    primary: 'SOCIAL_NETWORKING',
    secondary: 'FINANCE'
  },
  
  // Classification par âge (tout à NONE = 4+)
  ageRating: {
    violenceCartoon: 'NONE',
    violenceRealistic: 'NONE',
    sexualContent: 'NONE',
    profanity: 'NONE',
    alcohol: 'NONE',
    matureThemes: 'NONE',
    horror: 'NONE',
    medicalInfo: 'NONE',
    gamblingSimulated: 'NONE',
    gambling: false,
    unrestrictedWeb: false,
    contests: 'NONE'
  },
  
  // Descriptions et métadonnées
  localizations: {
    'en-US': {
      description: `Crowdaa is the revolutionary crowdfunding platform that makes it simple to bring ideas to life.

KEY FEATURES:

- Create Campaigns: Launch your project in minutes with our intuitive campaign builder
- Support Projects: Discover and back innovative ideas from creators worldwide
- Real-time Tracking: Monitor funding progress with live updates and analytics
- Secure Payments: Industry-leading payment security with multiple payment options
- Community Hub: Connect directly with creators and other backers
- Updates & Milestones: Stay informed with project updates and achievement tracking
- Premium Subscriptions: Unlock advanced features with monthly or yearly plans
- Mobile First: Optimized for the best mobile experience

PREMIUM FEATURES:

- Unlimited campaign creation
- Advanced analytics dashboard
- Priority customer support
- Early access to new features
- Ad-free experience
- Exclusive creator tools

WHY CROWDAA?

We believe in the power of community to transform ideas into reality. Whether you're a creator with a vision or a supporter looking to make a difference, Crowdaa provides the tools and platform to make it happen.

Join thousands of creators and backers who are already part of the Crowdaa revolution!`,
      
      keywords: 'crowdfunding,funding,investment,startup,business,projects,backing,community,innovation,premium',
      
      whatsNew: `Welcome to Crowdaa!

- Brand new crowdfunding platform
- Create and manage campaigns
- Support innovative projects
- Premium subscriptions available
- Monthly and yearly plans
- Exclusive features for subscribers

Thank you for joining the Crowdaa community!`,
      
      marketingUrl: 'https://crowdaa.com',
      supportUrl: 'https://crowdaa.com/support',
      promotionalText: 'Join the crowdfunding revolution! Try our Premium subscription for unlimited features.'
    },
    
    'fr-FR': {
      description: `Crowdaa est la plateforme de financement participatif révolutionnaire qui facilite la concrétisation des idées.

FONCTIONNALITÉS PRINCIPALES :

- Créer des Campagnes : Lancez votre projet en quelques minutes
- Soutenir des Projets : Découvrez et soutenez des idées innovantes
- Suivi en Temps Réel : Surveillez les progrès avec des analyses en direct
- Paiements Sécurisés : Sécurité de pointe avec plusieurs options de paiement
- Hub Communautaire : Connectez-vous avec les créateurs et autres contributeurs
- Abonnements Premium : Débloquez des fonctionnalités avancées
- Mobile First : Optimisé pour la meilleure expérience mobile

FONCTIONNALITÉS PREMIUM :

- Création de campagnes illimitée
- Tableau de bord analytique avancé
- Support client prioritaire
- Accès anticipé aux nouvelles fonctionnalités
- Expérience sans publicité
- Outils créateurs exclusifs

Rejoignez la révolution Crowdaa !`,
      
      keywords: 'financement,participatif,crowdfunding,projet,investissement,startup,communauté,premium,abonnement',
      
      whatsNew: `Bienvenue sur Crowdaa !

- Nouvelle plateforme de financement participatif
- Abonnements Premium disponibles
- Plans mensuels et annuels
- Fonctionnalités exclusives pour les abonnés

Merci de rejoindre la communauté Crowdaa !`,
      
      marketingUrl: 'https://crowdaa.com/fr',
      supportUrl: 'https://crowdaa.com/fr/support',
      promotionalText: 'Rejoignez la révolution du financement participatif ! Essayez notre abonnement Premium.'
    }
  },
  
  // Prix et disponibilité (API v2.3 - août 2025)
  pricing: {
    tier: 0, // Gratuit (legacy)
    schedulePrice: 0.0, // Nouveau système: 0.0 = gratuit, ou 0.99, 1.99, etc.
    availableInAllTerritories: true
  },
  
  // Déclaration de chiffrement (conformité export)
  encryptionDeclaration: {
    usesEncryption: true,  // L'app utilise HTTPS
    exempt: true,  // Exempt car utilise uniquement le chiffrement standard iOS
    containsProprietaryCryptography: false,
    containsThirdPartyCryptography: false,
    availableOnFrenchStore: true,
    appDescription: "L'app utilise uniquement HTTPS et les API de chiffrement standard d'iOS pour sécuriser les communications."
  },
  
  // Informations de review
  reviewInfo: {
    contactFirstName: 'Eric',
    contactLastName: 'Contact',
    contactPhone: '+33612345678',
    contactEmail: 'review@crowdaa.com',
    demoAccountName: null,
    demoAccountPassword: null,
    demoAccountRequired: false,
    notes: `Crowdaa is a crowdfunding platform app with premium subscriptions.

The app allows users to:
- Browse crowdfunding campaigns without login
- Create an account to start or back campaigns
- Subscribe to premium plans for advanced features
- Process payments securely

Premium features include:
- Unlimited campaign creation
- Advanced analytics
- Priority support
- Ad-free experience

No special configuration needed for review.
The app uses standard HTTPS for all communications.
Subscriptions are managed through App Store.`
  },
  
  // ================= GROUPE D'ABONNEMENTS =================
  subscriptionGroup: {
    referenceName: 'Crowdaa Premium',
    localizations: {
      'en-US': {
        name: 'Crowdaa Premium',
        customAppName: 'Crowdaa'
      },
      'fr-FR': {
        name: 'Crowdaa Premium',
        customAppName: 'Crowdaa'
      }
    }
  },
  
  // ================= ABONNEMENTS =================
  subscriptions: [
    {
      productId: 'com.crowdaa.premium_monthly',
      referenceName: 'Premium Monthly',
      type: 'AUTO_RENEWABLE',
      duration: 'ONE_MONTH',
      groupLevel: 1,
      familySharable: false,
      reviewNote: 'Monthly premium subscription with all features unlocked',
      localizations: {
        'en-US': {
          name: 'Premium Monthly',
          description: 'Unlimited campaigns & analytics'
        },
        'fr-FR': {
          name: 'Premium Mensuel',
          description: 'Campagnes illimitées et analyses'
        }
      },
      prices: [
        {
          startDate: null,
          territory: 'USA',
          pointId: 'STANDARD_MONTHLY_4_99' // $4.99
        }
      ]
    },
    {
      productId: 'com.crowdaa.premium_yearly',
      referenceName: 'Premium Yearly',
      type: 'AUTO_RENEWABLE',
      duration: 'ONE_YEAR',
      groupLevel: 1,
      familySharable: false,
      reviewNote: 'Yearly premium subscription with 50% discount',
      localizations: {
        'en-US': {
          name: 'Premium Yearly',
          description: 'Save 50% - All premium features'
        },
        'fr-FR': {
          name: 'Premium Annuel',
          description: '-50% - Toutes fonctionnalités'
        }
      },
      prices: [
        {
          startDate: null,
          territory: 'USA',
          pointId: 'STANDARD_YEARLY_29_99' // $29.99
        }
      ]
    }
  ],
  
  // ================= IAP (Achats Intégrés) =================
  inAppPurchases: [
    {
      productId: 'com.crowdaa.coins_100',
      referenceName: '100 Coins',
      type: 'CONSUMABLE',
      reviewNote: 'Virtual currency for backing projects',
      familySharable: false,
      localizations: {
        'en-US': {
          name: '100 Coins',
          description: 'Get 100 coins to support your favorite projects'
        },
        'fr-FR': {
          name: '100 Pièces',
          description: 'Obtenez 100 pièces pour soutenir vos projets préférés'
        }
      }
    },
    {
      productId: 'com.crowdaa.coins_500',
      referenceName: '500 Coins Bundle',
      type: 'CONSUMABLE',
      reviewNote: 'Virtual currency bundle with bonus',
      familySharable: false,
      localizations: {
        'en-US': {
          name: '500 Coins - Best Value',
          description: 'Get 500 coins with 10% bonus coins included'
        },
        'fr-FR': {
          name: '500 Pièces - Meilleure Offre',
          description: 'Obtenez 500 pièces avec 10% de bonus inclus'
        }
      }
    },
    {
      productId: 'com.crowdaa.remove_ads',
      referenceName: 'Remove Ads',
      type: 'NON_CONSUMABLE',
      reviewNote: 'One-time purchase to remove all advertisements',
      familySharable: true,
      localizations: {
        'en-US': {
          name: 'Remove Ads Forever',
          description: 'Enjoy Crowdaa without any advertisements'
        },
        'fr-FR': {
          name: 'Supprimer les Publicités',
          description: 'Profitez de Crowdaa sans aucune publicité'
        }
      }
    }
  ],
  
  // Soumission automatique
  autoSubmit: false // ⚠️ Mettre TRUE pour soumettre automatiquement pour review !
};

// ================= EXÉCUTION =================

const publisher = new AppStoreMetadataPublisher(config);

// Vérification de la configuration
function validateConfig() {
  const required = ['keyId', 'issuerId', 'keyPath', 'bundleId', 'versionString'];
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    console.log(chalk.red(`❌ Configuration manquante: ${missing.join(', ')}`));
    process.exit(1);
  }
  
  if (!fs.existsSync(config.keyPath)) {
    console.log(chalk.red(`❌ Fichier clé API introuvable: ${config.keyPath}`));
    process.exit(1);
  }
}

// Lancement
validateConfig();
publisher.fillAllMetadata();

// Usage:
// node publish-app.js