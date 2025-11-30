# Azure AI Services Example

This example demonstrates how to provision Azure AI Services (Cognitive Services) using Alchemy, including Azure OpenAI, Computer Vision, Speech Services, and Language Services.

## What You'll Deploy

- **Resource Group**: Container for all resources
- **Azure OpenAI Service**: GPT-4, GPT-3.5, DALL-E, Whisper, Embeddings
- **Computer Vision**: Image analysis, OCR, object detection
- **Speech Services**: Speech-to-text, text-to-speech, translation
- **Language Services**: Sentiment analysis, entity recognition, translation

## Prerequisites

1. **Azure OpenAI Access**: You need to apply for Azure OpenAI access:
   - Visit: https://aka.ms/oai/access
   - Approval typically takes 1-2 business days
   - Required for OpenAI models (GPT-4, GPT-3.5, DALL-E)

2. Install dependencies:
   ```bash
   bun install
   ```

3. Set up Azure credentials:
   ```bash
   az login
   az account set --subscription "your-subscription-id"
   ```

4. Set Alchemy password:
   ```bash
   export ALCHEMY_PASSWORD="your-secure-password"
   ```

## Deploy

Deploy the AI Services:

```bash
bun deploy
```

## Deploy Models

After infrastructure is created, you need to deploy AI models:

1. **Go to Azure OpenAI Studio**:
   ```
   https://oai.azure.com
   ```

2. **Create Deployments**:
   - Navigate to "Deployments" → "Create new deployment"
   - Deploy models you want to use:
     - `gpt-4` or `gpt-4-turbo` for advanced chat
     - `gpt-35-turbo` for fast, cost-effective chat
     - `dall-e-3` for image generation
     - `text-embedding-ada-002` for embeddings

3. **Get API Key**:
   ```bash
   az cognitiveservices account keys list \
     --resource-group <resource-group-name> \
     --name <openai-service-name>
   ```

4. **Set Environment Variable**:
   ```bash
   export AZURE_OPENAI_API_KEY="<your-key>"
   ```

## Usage Examples

### Node.js with OpenAI SDK

```bash
npm install openai
```

```javascript
import { AzureOpenAI } from 'openai';

const client = new AzureOpenAI({
  endpoint: 'https://<your-resource>.openai.azure.com',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: '2024-02-01',
  deployment: 'gpt-4' // Your deployment name
});

const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain Azure OpenAI in one sentence.' }
  ]
});

console.log(response.choices[0].message.content);
```

### Python with OpenAI SDK

```bash
pip install openai
```

```python
from openai import AzureOpenAI
import os

client = AzureOpenAI(
    azure_endpoint='https://<your-resource>.openai.azure.com',
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version="2024-02-01"
)

response = client.chat.completions.create(
    model="gpt-4",  # Your deployment name
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is Azure OpenAI?"}
    ]
)

print(response.choices[0].message.content)
```

### Computer Vision API

```javascript
import axios from 'axios';

const endpoint = 'https://<your-resource>.cognitiveservices.azure.com';
const apiKey = process.env.AZURE_VISION_API_KEY;

const imageUrl = 'https://example.com/image.jpg';

const response = await axios.post(
  `${endpoint}/vision/v3.2/analyze?visualFeatures=Categories,Description,Tags`,
  { url: imageUrl },
  {
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/json'
    }
  }
);

console.log(response.data.description.captions[0].text);
```

## Available AI Models

### Azure OpenAI
- **GPT-4 Turbo**: 128k context, latest capabilities
- **GPT-4**: 8k/32k context, advanced reasoning
- **GPT-3.5 Turbo**: 16k context, fast and cost-effective
- **DALL-E 3**: High-quality image generation
- **Whisper**: Speech-to-text transcription
- **text-embedding-ada-002**: Text embeddings

### Computer Vision
- Image analysis and tagging
- OCR and text extraction
- Object and brand detection
- Face detection and recognition
- Adult content detection

### Speech Services
- Speech-to-text (90+ languages)
- Text-to-speech (75+ languages, neural voices)
- Speech translation (real-time)
- Speaker recognition

### Language Services
- Sentiment analysis
- Named entity recognition
- Key phrase extraction
- Language detection (120+ languages)
- Text translation

## Cost Estimates

### Azure OpenAI
- **GPT-4 Turbo**: $0.01/1K input tokens, $0.03/1K output tokens
- **GPT-3.5 Turbo**: $0.0005/1K input, $0.0015/1K output tokens
- **DALL-E 3**: $0.04/image (standard), $0.08/image (HD)
- **Embeddings**: $0.0001/1K tokens

### Other Services
- **Computer Vision (S1)**: $1/1,000 transactions
- **Speech Services (S0)**: $1/hour of audio
- **Language Services**: $2/1,000 text records

## Security & Compliance

✅ Enterprise-grade security  
✅ Data residency controls  
✅ Private endpoints support  
✅ RBAC integration  
✅ Customer-managed encryption keys  
✅ SOC 2, HIPAA, ISO 27001 compliant  
✅ **Your data is NOT used for model training**

## Clean Up

Destroy all resources:

```bash
bun destroy
```

## Common Use Cases

- **Chatbots**: Customer service, virtual assistants
- **Content Generation**: Marketing copy, summaries, translations
- **Code Assistant**: Code generation, debugging, documentation
- **Image Analysis**: Product tagging, content moderation
- **Speech**: Transcription, voice assistants, call analytics
- **Document Intelligence**: Contract analysis, form processing

## Documentation

- [Azure OpenAI Docs](https://learn.microsoft.com/azure/ai-services/openai/)
- [Quickstart Guide](https://learn.microsoft.com/azure/ai-services/openai/quickstart)
- [API Reference](https://learn.microsoft.com/azure/ai-services/openai/reference)
- [Azure OpenAI Studio](https://oai.azure.com)

## Important Notes

⚠️ **Azure OpenAI Access Required**: You must apply and be approved for Azure OpenAI access before you can deploy models. Other Cognitive Services (Vision, Speech, Language) are available immediately.

💡 **Rate Limits**: Azure OpenAI has rate limits based on tokens per minute (TPM) and requests per minute (RPM). Monitor your usage in Azure Portal.

🔒 **Security**: For production, use private endpoints and disable public network access. Store API keys in Azure Key Vault.
