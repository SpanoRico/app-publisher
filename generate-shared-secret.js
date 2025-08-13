#!/usr/bin/env node

/**
 * Script pour générer/régénérer le shared secret d'une app iOS
 * Utilisé pour la validation des reçus IAP côté serveur
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Configuration (même que publish-app.js)
const config = {
  keyId: 'YOUR_KEY_ID',
  issuerId: 'YOUR_ISSUER_ID', 
  privateKeyPath: './AuthKey.p8',
  appId: '6745080395' // ID de votre app
};

class SharedSecretManager {
  constructor(config) {
    this.config = config;
    this.baseUrl = 'https://api.appstoreconnect.apple.com/v1';
  }

  // Générer le JWT pour l'authentification
  generateJWT() {
    const privateKey = fs.readFileSync(this.config.privateKeyPath, 'utf8');
    
    const token = jwt.sign({
      iss: this.config.issuerId,
      exp: Math.floor(Date.now() / 1000) + (20 * 60), // 20 minutes
      aud: 'appstoreconnect-v1'
    }, privateKey, {
      algorithm: 'ES256',
      keyid: this.config.keyId
    });
    
    return token;
  }

  // Requête API générique
  async apiRequest(method, endpoint, data = null) {
    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.generateJWT()}`,
          'Content-Type': 'application/json'
        },
        data
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Erreur API: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
      throw error;
    }
  }

  // ================= SHARED SECRET POUR IAP =================
  
  /**
   * Récupérer le shared secret actuel de l'app
   */
  async getAppSharedSecret() {
    try {
      console.log('📱 Récupération du shared secret actuel...\n');
      
      // Récupérer les infos de l'app incluant le shared secret
      const response = await this.apiRequest('GET', `/apps/${this.config.appId}/appStoreVersions`);
      
      // Note: Le shared secret n'est pas directement accessible via l'API GET
      // Il faut le générer/régénérer pour l'obtenir
      
      console.log('ℹ️  Le shared secret actuel ne peut pas être récupéré (sécurité)');
      console.log('💡 Utilisez regenerateSharedSecret() pour en créer un nouveau\n');
      
      return null;
    } catch (error) {
      console.error('Erreur récupération shared secret:', error.message);
    }
  }

  /**
   * Générer/Régénérer le shared secret spécifique à l'app
   * ATTENTION: Cela invalide l'ancien secret !
   */
  async regenerateAppSharedSecret() {
    try {
      console.log('🔐 GÉNÉRATION D\'UN NOUVEAU SHARED SECRET\n');
      console.log('⚠️  ATTENTION: Cela invalidera l\'ancien secret !');
      console.log('   Les serveurs utilisant l\'ancien secret devront être mis à jour.\n');
      
      // L'endpoint exact peut varier selon la version de l'API
      // Option 1: Via l'app directement
      const response = await this.apiRequest('POST', 
        `/apps/${this.config.appId}/appSharedSecret`
      );
      
      if (response.data?.attributes?.sharedSecret) {
        const secret = response.data.attributes.sharedSecret;
        
        console.log('✅ Nouveau shared secret généré avec succès !\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`📱 App ID: ${this.config.appId}`);
        console.log(`🔑 Shared Secret: ${secret}`);
        console.log('═══════════════════════════════════════════════════════\n');
        
        // Sauvegarder dans un fichier sécurisé
        this.saveSecretToFile(secret);
        
        return secret;
      }
      
    } catch (error) {
      // Si l'endpoint ci-dessus ne fonctionne pas, essayer l'alternative
      return await this.regenerateViaInAppPurchase();
    }
  }

  /**
   * Alternative: Générer via les IAP (méthode legacy)
   */
  async regenerateViaInAppPurchase() {
    try {
      console.log('🔄 Tentative via l\'endpoint IAP...\n');
      
      // Certaines versions de l'API utilisent cet endpoint
      const response = await this.apiRequest('POST',
        `/apps/${this.config.appId}/inAppPurchases/appSharedSecret`
      );
      
      if (response.data?.sharedSecret) {
        const secret = response.data.sharedSecret;
        
        console.log('✅ Shared secret généré via IAP !\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`🔑 Shared Secret: ${secret}`);
        console.log('═══════════════════════════════════════════════════════\n');
        
        this.saveSecretToFile(secret);
        return secret;
      }
      
    } catch (error) {
      console.error('❌ Impossible de générer le shared secret');
      console.log('\n📝 Alternative manuelle:');
      console.log('1. Allez dans App Store Connect');
      console.log('2. My Apps > Votre App > App Information');
      console.log('3. Section "App-Specific Shared Secret"');
      console.log('4. Cliquez sur "Generate" ou "Regenerate"\n');
    }
  }

  /**
   * Sauvegarder le secret dans un fichier
   */
  saveSecretToFile(secret) {
    const filename = `shared-secret-${this.config.appId}.txt`;
    const content = `# App Store Connect Shared Secret
# App ID: ${this.config.appId}
# Generated: ${new Date().toISOString()}
# ⚠️  KEEP THIS SECRET SECURE!

SHARED_SECRET=${secret}

# Usage for receipt validation:
# POST https://buy.itunes.apple.com/verifyReceipt
# {
#   "receipt-data": "<base64_receipt>",
#   "password": "${secret}",
#   "exclude-old-transactions": true
# }
`;
    
    fs.writeFileSync(filename, content, 'utf8');
    console.log(`💾 Secret sauvegardé dans: ${filename}`);
    console.log('⚠️  IMPORTANT: Gardez ce fichier sécurisé et ne le commitez pas !\n');
  }

  /**
   * Obtenir le shared secret principal (compte développeur)
   */
  async getMasterSharedSecret() {
    console.log('🏢 SHARED SECRET PRINCIPAL (COMPTE)\n');
    console.log('ℹ️  Le shared secret principal s\'applique à TOUTES vos apps');
    console.log('   Il ne peut être géré que manuellement dans App Store Connect:\n');
    console.log('   1. Users and Access > Shared Secret');
    console.log('   2. Generate or View\n');
    
    // Note: Pas accessible via API pour des raisons de sécurité
    return null;
  }

  /**
   * Vérifier le statut des IAP et abonnements
   */
  async checkIAPStatus() {
    try {
      console.log('💰 VÉRIFICATION DES IAP\n');
      
      // Lister les IAP de l'app
      const response = await this.apiRequest('GET', 
        `/apps/${this.config.appId}/inAppPurchasesV2?limit=200`
      );
      
      if (response.data && response.data.length > 0) {
        console.log(`✅ ${response.data.length} IAP trouvés:\n`);
        
        response.data.forEach(iap => {
          const attrs = iap.attributes;
          console.log(`   • ${attrs.productId}`);
          console.log(`     Type: ${attrs.inAppPurchaseType}`);
          console.log(`     État: ${attrs.state}\n`);
        });
        
        console.log('💡 Le shared secret est nécessaire pour valider les reçus de ces IAP\n');
      } else {
        console.log('⚠️  Aucun IAP trouvé pour cette app\n');
      }
      
    } catch (error) {
      console.log('❌ Impossible de récupérer les IAP');
    }
  }

  /**
   * Guide d'utilisation du shared secret
   */
  showUsageGuide() {
    console.log('\n📚 GUIDE D\'UTILISATION DU SHARED SECRET\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('1️⃣  VALIDATION DES REÇUS (Production):');
    console.log('   POST https://buy.itunes.apple.com/verifyReceipt');
    console.log('   Body: {');
    console.log('     "receipt-data": "<base64_encoded_receipt>",');
    console.log('     "password": "<your_shared_secret>"');
    console.log('   }\n');
    
    console.log('2️⃣  VALIDATION DES REÇUS (Sandbox):');
    console.log('   POST https://sandbox.itunes.apple.com/verifyReceipt');
    console.log('   (Même format que production)\n');
    
    console.log('3️⃣  SERVER NOTIFICATIONS V2:');
    console.log('   Le shared secret est utilisé pour signer les notifications');
    console.log('   JWT envoyées par Apple à votre serveur\n');
    
    console.log('4️⃣  QUAND UTILISER APP-SPECIFIC vs MASTER:');
    console.log('   • App-Specific: Si vous transférez l\'app');
    console.log('   • App-Specific: Isolation de sécurité par app');
    console.log('   • Master: Plus simple si vous gérez plusieurs apps\n');
    
    console.log('5️⃣  SÉCURITÉ:');
    console.log('   ⚠️  Ne jamais exposer le secret côté client');
    console.log('   ⚠️  Toujours valider côté serveur');
    console.log('   ⚠️  Utiliser HTTPS pour les communications');
    console.log('   ⚠️  Stocker en variables d\'environnement\n');
  }
}

// ==================== MENU PRINCIPAL ====================
async function main() {
  const manager = new SharedSecretManager(config);
  
  console.log('\n🔐 GESTIONNAIRE DE SHARED SECRET APP STORE\n');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Vérifier le statut des IAP
  await manager.checkIAPStatus();
  
  // Afficher les options
  console.log('📋 ACTIONS DISPONIBLES:\n');
  console.log('1. regenerateAppSharedSecret() - Générer un nouveau secret');
  console.log('2. getMasterSharedSecret() - Info sur le secret principal');
  console.log('3. showUsageGuide() - Guide d\'utilisation\n');
  
  // Par défaut, générer un nouveau secret si demandé
  const action = process.argv[2];
  
  if (action === 'generate' || action === 'regenerate') {
    await manager.regenerateAppSharedSecret();
  } else if (action === 'guide') {
    manager.showUsageGuide();
  } else {
    console.log('💡 Usage:');
    console.log('   node generate-shared-secret.js generate   # Générer un nouveau secret');
    console.log('   node generate-shared-secret.js guide      # Afficher le guide\n');
  }
}

// Lancer le script
main().catch(error => {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
});