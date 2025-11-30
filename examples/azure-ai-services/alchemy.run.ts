import { alchemy } from "../../alchemy/src/alchemy.ts";
import { ResourceGroup } from "../../alchemy/src/azure/resource-group.ts";
import { CognitiveServices } from "../../alchemy/src/azure/cognitive-services.ts";

/**
 * Azure AI Services (Cognitive Services) Example
 *
 * This example demonstrates how to provision Azure AI services:
 * - OpenAI (GPT-4, GPT-3.5, DALL-E, Whisper, Embeddings)
 * - Computer Vision (image analysis, OCR, face detection)
 * - Speech Services (speech-to-text, text-to-speech, translation)
 * - Language Services (sentiment analysis, entity recognition, translation)
 * - Content Moderator (text, image moderation)
 *
 * Azure OpenAI Service provides:
 * - GPT-4 and GPT-3.5 Turbo models
 * - DALL-E 3 for image generation
 * - Whisper for speech recognition
 * - Text Embeddings (ada-002)
 * - Enterprise-grade security and compliance
 * - Guaranteed SLA and support
 *
 * Equivalent to:
 * - OpenAI API (but with enterprise features)
 * - Google Cloud AI Platform
 * - AWS Bedrock
 */

const app = await alchemy("azure-ai-services", {
  password: process.env.ALCHEMY_PASSWORD || "change-me-in-production",
});

const rg = await ResourceGroup("ai-rg", {
  location: "eastus",
  tags: {
    project: "azure-ai-services",
    environment: "demo",
  },
});

const openai = await CognitiveServices("my-openai", {
  resourceGroup: rg,
  kind: "OpenAI",
  sku: "S0", // Standard tier

  publicNetworkAccess: true,

  tags: {
    purpose: "openai-api",
    service: "gpt",
  },
});

const vision = await CognitiveServices("my-vision", {
  resourceGroup: rg,
  kind: "ComputerVision",
  sku: "S1", // Standard tier

  tags: {
    purpose: "image-analysis",
  },
});

const speech = await CognitiveServices("my-speech", {
  resourceGroup: rg,
  kind: "SpeechServices",
  sku: "S0", // Standard tier

  tags: {
    purpose: "voice-recognition",
  },
});

const language = await CognitiveServices("my-language", {
  resourceGroup: rg,
  kind: "TextAnalytics",
  sku: "S0", // Standard tier

  tags: {
    purpose: "text-analysis",
  },
});

console.log("\n✅ Azure AI Services Deployed!");
console.log("\n📊 Resource Details:");
console.log(`   Resource Group: ${rg.name}`);
console.log(`   Location: ${rg.location}`);

console.log("\n🤖 Azure OpenAI Service:");
console.log(`   Name: ${openai.name}`);
console.log(`   Endpoint: ${openai.endpoint}`);
console.log(`   Kind: ${openai.kind}`);
console.log(`   SKU: ${openai.sku}`);

console.log("\n👁️  Computer Vision:");
console.log(`   Name: ${vision.name}`);
console.log(`   Endpoint: ${vision.endpoint}`);

console.log("\n🎤 Speech Services:");
console.log(`   Name: ${speech.name}`);
console.log(`   Endpoint: ${speech.endpoint}`);

console.log("\n📝 Language Services:");
console.log(`   Name: ${language.name}`);
console.log(`   Endpoint: ${language.endpoint}`);

console.log("\n🔑 Get API Keys:");
console.log(
  `   az cognitiveservices account keys list --resource-group ${rg.name} --name ${openai.name}`,
);

console.log("\n💻 OpenAI API Usage Examples:");
console.log("\n   Install SDK:");
console.log("   npm install openai");

console.log("\n   Node.js Example (GPT-4):");
console.log(`   import { AzureOpenAI } from 'openai';`);
console.log(`   `);
console.log(`   const client = new AzureOpenAI({`);
console.log(`     endpoint: '${openai.endpoint}',`);
console.log(`     apiKey: process.env.AZURE_OPENAI_API_KEY,`);
console.log(`     apiVersion: '2024-02-01',`);
console.log(`     deployment: 'gpt-4' // Your deployment name`);
console.log(`   });`);
console.log(`   `);
console.log(`   const response = await client.chat.completions.create({`);
console.log(`     model: 'gpt-4',`);
console.log(`     messages: [`);
console.log(
  `       { role: 'system', content: 'You are a helpful assistant.' },`,
);
console.log(`       { role: 'user', content: 'What is Azure OpenAI?' }`);
console.log(`     ]`);
console.log(`   });`);
console.log(`   console.log(response.choices[0].message.content);`);

console.log("\n   Python Example:");
console.log("   pip install openai");
console.log(`   from openai import AzureOpenAI`);
console.log(`   `);
console.log(`   client = AzureOpenAI(`);
console.log(`       azure_endpoint='${openai.endpoint}',`);
console.log(`       api_key=os.getenv("AZURE_OPENAI_API_KEY"),`);
console.log(`       api_version="2024-02-01"`);
console.log(`   )`);

console.log("\n🎨 Available AI Models:");
console.log("   OpenAI:");
console.log("   - GPT-4 Turbo (128k context)");
console.log("   - GPT-4 (8k/32k context)");
console.log("   - GPT-3.5 Turbo (16k context)");
console.log("   - DALL-E 3 (image generation)");
console.log("   - Whisper (speech-to-text)");
console.log("   - text-embedding-ada-002");
console.log("\n   Computer Vision:");
console.log("   - Image analysis and tagging");
console.log("   - OCR and text extraction");
console.log("   - Object detection");
console.log("   - Face detection");
console.log("\n   Speech:");
console.log("   - Speech-to-text");
console.log("   - Text-to-speech (75+ languages)");
console.log("   - Speech translation");
console.log("\n   Language:");
console.log("   - Sentiment analysis");
console.log("   - Entity recognition");
console.log("   - Key phrase extraction");
console.log("   - Language detection");

console.log("\n⚙️  Next Steps to Deploy Models:");
console.log("   1. Go to Azure OpenAI Studio:");
console.log("      https://oai.azure.com");
console.log("\n   2. Create model deployments:");
console.log("      - GPT-4 or GPT-3.5-Turbo for chat");
console.log("      - DALL-E 3 for image generation");
console.log("      - text-embedding-ada-002 for embeddings");
console.log("\n   3. Get your API key:");
console.log(
  `      az cognitiveservices account keys list --resource-group ${rg.name} --name ${openai.name}`,
);
console.log("\n   4. Set environment variable:");
console.log("      export AZURE_OPENAI_API_KEY=<your-key>");
console.log("\n   5. Start building!");

console.log("\n💰 Pricing:");
console.log("   OpenAI Service:");
console.log("   - GPT-4 Turbo: $0.01/1K input tokens, $0.03/1K output tokens");
console.log(
  "   - GPT-3.5 Turbo: $0.0005/1K input tokens, $0.0015/1K output tokens",
);
console.log("   - DALL-E 3: $0.04/image (standard), $0.08/image (HD)");
console.log("   - Embeddings: $0.0001/1K tokens");
console.log("\n   Computer Vision: $1/1000 transactions (S1 tier)");
console.log("   Speech Services: $1/hour audio (S0 tier)");
console.log("   Language Services: $2/1000 text records");

console.log("\n🔒 Security & Compliance:");
console.log("   ✓ Enterprise-grade security");
console.log("   ✓ Data residency controls");
console.log("   ✓ Private endpoints support");
console.log("   ✓ RBAC integration");
console.log("   ✓ Customer-managed keys");
console.log("   ✓ SOC 2, HIPAA, ISO compliant");
console.log("   ✓ Your data is NOT used for training");

console.log("\n📚 Documentation:");
console.log("   OpenAI: https://learn.microsoft.com/azure/ai-services/openai/");
console.log(
  "   Quickstarts: https://learn.microsoft.com/azure/ai-services/openai/quickstart",
);
console.log(
  "   API Reference: https://learn.microsoft.com/azure/ai-services/openai/reference",
);

console.log("\n🛠️  Example Use Cases:");
console.log("   - Chatbots and virtual assistants");
console.log("   - Content generation and summarization");
console.log("   - Code generation and debugging");
console.log("   - Image analysis and generation");
console.log("   - Speech recognition and transcription");
console.log("   - Language translation");
console.log("   - Sentiment analysis");
console.log("   - Document intelligence");

console.log("\n💡 To Destroy Resources:");
console.log("   bun ./alchemy.run --destroy");

await app.finalize();
