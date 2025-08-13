# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Install dependencies
```bash
npm install
```

### Run the App Store publisher script
```bash
node publish-app.js
```

## Architecture

This is an App Store Connect automation tool that publishes iOS app metadata using Apple's API. The main component is `publish-app.js` which handles:

1. **Authentication**: JWT-based authentication with App Store Connect API using ES256 signing
2. **Metadata Management**: Automates filling app descriptions, keywords, categories, age ratings, and localizations (en-US, fr-FR)
3. **In-App Purchases**: Creates consumable and non-consumable IAPs with localizations
4. **Subscriptions**: Sets up auto-renewable subscription groups with monthly/yearly tiers
5. **Build Association**: Links existing uploaded builds to app versions
6. **Review Submission**: Configures review details and optionally submits for Apple review

The script uses a configuration object containing:
- API credentials (keyId, issuerId, key file path)
- App details (bundleId, version, copyright)
- Localizations with descriptions, keywords, and what's new
- IAP and subscription configurations with pricing tiers
- Review contact information

Key dependencies:
- `axios`: HTTP client for App Store Connect API requests
- `jsonwebtoken`: JWT generation for API authentication
- `chalk`: Terminal output formatting (with fallback for compatibility)

The script includes retry logic for rate limiting, automatic token refresh, and comprehensive error handling with colored console output for status tracking.