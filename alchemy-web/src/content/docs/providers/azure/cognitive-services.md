---
title: CognitiveServices
description: Azure Cognitive Services - AI and ML APIs for vision, speech, language, and decision making
---

# CognitiveServices

Azure Cognitive Services provides AI capabilities through REST APIs and SDKs, including computer vision, speech recognition, natural language processing, decision making, and Azure OpenAI Service.

**Unique to Azure**: While AWS has individual AI services (Rekognition, Comprehend, Polly), Azure Cognitive Services provides a unified platform with consistent authentication, billing, and developer experience.

Key features:
- Vision APIs (image analysis, face detection, OCR)
- Speech APIs (speech-to-text, text-to-speech, translation)
- Language APIs (sentiment analysis, entity recognition, translation)
- Decision APIs (anomaly detection, content moderation, personalization)
- Azure OpenAI Service (GPT models, DALL-E, embeddings)
- Multi-service accounts for all APIs or single-service accounts
- Free tier available for development and testing

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the Cognitive Services account. Must be 2-64 characters, alphanumeric, hyphens, and underscores. Defaults to `${app}-${stage}-${id}` |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this Cognitive Services account in |
| `location` | `string` | No | Azure region for the Cognitive Services account. Defaults to the resource group's location |
| `kind` | `string` | No | The kind of Cognitive Services API to create. See API kinds below. Defaults to `CognitiveServices` (multi-service) |
| `sku` | `string` | No | The pricing tier. Options: `F0` (free), `S0`-`S10` (standard tiers). Defaults to `S0`. See SKU details below |
| `publicNetworkAccess` | `boolean` | No | Enable public network access. Defaults to `true` |
| `customSubDomain` | `string` | No | Custom subdomain for the endpoint. Required for some features like custom domains and AAD authentication |
| `networkAcls` | `object` | No | Network ACLs to restrict access. See network restrictions below |
| `tags` | `Record<string, string>` | No | Tags to apply to the Cognitive Services account |
| `adopt` | `boolean` | No | Whether to adopt an existing Cognitive Services account. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the Cognitive Services account when removed from Alchemy. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `cognitiveServicesId` | `string` | The Azure resource ID |
| `endpoint` | `string` | The endpoint URL for the Cognitive Services API |
| `primaryKey` | `Secret` | Primary access key for API authentication |
| `secondaryKey` | `Secret` | Secondary access key for key rotation |
| `provisioningState` | `string` | The provisioning state of the account |
| `type` | `"azure::CognitiveServices"` | Resource type identifier |

## API Kinds

| Kind | Description | Use Cases |
|------|-------------|-----------|
| `CognitiveServices` | Multi-service account with access to all APIs | Development, prototyping, multiple AI features |
| `ComputerVision` | Image analysis and OCR | Object detection, image classification, text extraction |
| `Face` | Face detection and recognition | Identity verification, emotion detection |
| `TextAnalytics` | Sentiment analysis, key phrases, entity recognition | Customer feedback analysis, content categorization |
| `SpeechServices` | Speech-to-text, text-to-speech, translation | Voice assistants, transcription, accessibility |
| `LUIS` | Language Understanding for natural language processing | Chatbots, command parsing |
| `QnAMaker` | Question and answer service | FAQ bots, knowledge bases |
| `CustomVision.Training` | Custom image classification training | Product recognition, quality inspection |
| `CustomVision.Prediction` | Custom image classification prediction | Applying trained models |
| `AnomalyDetector` | Time-series anomaly detection | Monitoring, fraud detection |
| `ContentModerator` | Content moderation for text, images, videos | User-generated content filtering |
| `Personalizer` | Reinforcement learning for personalization | Content recommendations |
| `FormRecognizer` | Extract data from forms and documents | Invoice processing, form automation |
| `TranslatorText` | Text translation | Multi-language support |
| `OpenAI` | Azure OpenAI Service for GPT models | Chatbots, content generation, embeddings |

## SKU Tiers

| SKU | Description | Pricing |
|-----|-------------|---------|
| `F0` | Free tier with limited requests per month | Free (varies by service) |
| `S0` | Standard tier with pay-as-you-go pricing | Most common, flexible |
| `S1`-`S10` | Service-specific standard tiers | Varies by service |

## Usage

### Multi-Service Cognitive Services Account

Create a single account with access to all Cognitive Services APIs:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, CognitiveServices } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("ai", {
  location: "eastus"
});

const cognitive = await CognitiveServices("ai", {
  resourceGroup: rg,
  kind: "CognitiveServices", // All APIs
  sku: "S0" // Standard tier
});

console.log(`Endpoint: ${cognitive.endpoint}`);
console.log(`Primary Key available as Secret`);

await app.finalize();
```

### Computer Vision API

Create a dedicated Computer Vision resource for image analysis:

```typescript
const vision = await CognitiveServices("vision", {
  resourceGroup: rg,
  kind: "ComputerVision",
  sku: "S1",
  customSubDomain: "myapp-vision" // Required for some features
});

// Use in your application
console.log(`Vision Endpoint: ${vision.endpoint}`);
```

### Azure OpenAI Service

Create an OpenAI resource for GPT models:

```typescript
const openai = await CognitiveServices("openai", {
  resourceGroup: rg,
  kind: "OpenAI",
  sku: "S0",
  customSubDomain: "myapp-openai" // Required for OpenAI
});

// Deploy models using Azure OpenAI Studio or SDK
// Access via SDK with endpoint and key
```

### Text Analytics with Free Tier

Use the free tier for development and testing:

```typescript
const textAnalytics = await CognitiveServices("dev-text", {
  resourceGroup: rg,
  kind: "TextAnalytics",
  sku: "F0" // Free tier
});

// Limited to 5,000 transactions per month
```

### Speech Services

Create a Speech Services resource for voice applications:

```typescript
const speech = await CognitiveServices("speech", {
  resourceGroup: rg,
  kind: "SpeechServices",
  sku: "S0",
  customSubDomain: "myapp-speech"
});

// Use for speech-to-text, text-to-speech, translation
```

### Cognitive Services with Network Restrictions

Restrict access to specific IP addresses and virtual networks:

```typescript
const secure = await CognitiveServices("secure-ai", {
  resourceGroup: rg,
  kind: "CognitiveServices",
  networkAcls: {
    defaultAction: "Deny",
    ipRules: ["203.0.113.0/24"], // Your office IP range
    virtualNetworkRules: [
      "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Network/virtualNetworks/{vnet}/subnets/ai-subnet"
    ]
  }
});
```

### Use with Function App

Integrate Cognitive Services with a Function App:

```typescript
import { FunctionApp } from "alchemy/azure";

const vision = await CognitiveServices("vision", {
  resourceGroup: rg,
  kind: "ComputerVision",
  sku: "S1"
});

const api = await FunctionApp("image-api", {
  resourceGroup: rg,
  runtime: "node",
  runtimeVersion: "20",
  environmentVariables: {
    VISION_ENDPOINT: vision.endpoint,
    VISION_KEY: vision.primaryKey
  }
});
```

### Adopt Existing Cognitive Services

Adopt an existing Cognitive Services account:

```typescript
const cognitive = await CognitiveServices("legacy-ai", {
  name: "existing-cognitive-account",
  resourceGroup: rg,
  kind: "CognitiveServices",
  adopt: true // Adopt the existing account
});
```

## Common Patterns

### Image Analysis Pipeline

Process uploaded images with Computer Vision:

```typescript
const vision = await CognitiveServices("vision", {
  resourceGroup: rg,
  kind: "ComputerVision",
  sku: "S1"
});

// 1. User uploads image to Blob Storage
// 2. Function App triggered by blob upload
// 3. Function calls Computer Vision API to analyze image
// 4. Results stored in database
```

### Sentiment Analysis for Customer Feedback

Analyze customer feedback with Text Analytics:

```typescript
const textAnalytics = await CognitiveServices("sentiment", {
  resourceGroup: rg,
  kind: "TextAnalytics",
  sku: "S0"
});

// Analyze customer reviews, support tickets, social media posts
// Extract sentiment scores and key phrases
```

### Chatbot with LUIS and QnA Maker

Build an intelligent chatbot:

```typescript
const luis = await CognitiveServices("bot-luis", {
  resourceGroup: rg,
  kind: "LUIS",
  sku: "S0"
});

const qna = await CognitiveServices("bot-qna", {
  resourceGroup: rg,
  kind: "QnAMaker",
  sku: "S0"
});

// LUIS handles intent recognition
// QnA Maker provides answers to common questions
```

### Voice Assistant

Create a voice-enabled application:

```typescript
const speech = await CognitiveServices("assistant-speech", {
  resourceGroup: rg,
  kind: "SpeechServices",
  sku: "S0"
});

// Speech-to-text for user input
// Text-to-speech for responses
// Intent recognition with LUIS
```

## Important Notes

### Immutable Properties

These properties cannot be changed after creation (requires replacement):
- `name` - The account name
- `location` - The Azure region
- `kind` - The API kind

### Custom Subdomain

- Required for Azure OpenAI Service
- Required for custom domain names
- Required for Azure AD authentication
- Becomes part of the endpoint: `https://{customSubDomain}.cognitiveservices.azure.com`

### API Keys vs Azure AD

- **API Keys**: Simpler, use `primaryKey` and `secondaryKey`
- **Azure AD**: More secure, use managed identities or service principals
- Set `disableLocalAuth: true` to require Azure AD only

### Rate Limits

Each SKU tier has different rate limits:
- **Free (F0)**: Limited transactions per month (varies by service)
- **Standard (S0-S10)**: Pay-per-transaction with higher limits
- Check specific service documentation for exact limits

### Regional Availability

Not all Cognitive Services are available in all regions:
- **Azure OpenAI**: Limited to specific regions (check availability)
- **Most services**: Available in major regions worldwide
- Check [Azure Products by Region](https://azure.microsoft.com/global-infrastructure/services/)

### Pricing

- **Free Tier**: Good for development, limited transactions
- **Standard Tier**: Pay-per-transaction model
- **Premium Features**: Some features (e.g., custom models) have additional costs
- See [Cognitive Services Pricing](https://azure.microsoft.com/pricing/details/cognitive-services/)

### Security Best Practices

1. Use custom subdomains for production workloads
2. Rotate API keys regularly (use `secondaryKey` for rotation)
3. Use Azure AD authentication when possible
4. Apply network restrictions for sensitive workloads
5. Store API keys as Secrets (automatically done by Alchemy)
6. Use managed identities for Azure resources

### Multi-Service vs Single-Service

**Multi-Service Account (`CognitiveServices`)**:
- ✅ Access to all APIs with one key
- ✅ Simplified billing
- ✅ Good for development and prototyping
- ❌ Less granular cost tracking
- ❌ Single security boundary

**Single-Service Accounts**:
- ✅ Granular cost tracking per service
- ✅ Separate security boundaries
- ✅ Service-specific SKUs and features
- ❌ More resources to manage
- ❌ Multiple keys to rotate

## Related Resources

- [ResourceGroup](./resource-group.md) - Required parent resource
- [FunctionApp](./function-app.md) - Process AI workloads with serverless functions
- [StorageAccount](./storage-account.md) - Store images, documents for processing

## Official Documentation

- [Cognitive Services Documentation](https://docs.microsoft.com/azure/cognitive-services/)
- [Computer Vision](https://docs.microsoft.com/azure/cognitive-services/computer-vision/)
- [Speech Services](https://docs.microsoft.com/azure/cognitive-services/speech-service/)
- [Text Analytics](https://docs.microsoft.com/azure/cognitive-services/text-analytics/)
- [Azure OpenAI Service](https://docs.microsoft.com/azure/cognitive-services/openai/)
- [Cognitive Services Pricing](https://azure.microsoft.com/pricing/details/cognitive-services/)
