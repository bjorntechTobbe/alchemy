# Azure Function App Example

This example demonstrates how to deploy a serverless Azure Function App using Alchemy.

## What This Example Shows

- **Function App**: Serverless compute for event-driven functions
- **Storage Account**: Required backend storage for Azure Functions
- **Consumption Plan**: Pay-per-execution serverless pricing
- **HTTP Trigger**: Function that responds to HTTP requests

## Architecture

```
Internet → Azure Function App (Node.js 20, Consumption Plan)
                ↓
          Storage Account (Function state & logs)
```

## Prerequisites

- Azure CLI installed and logged in (`az login`)
- Node.js or Bun installed
- Azure Functions Core Tools (optional, for code deployment)

## Quick Start

### 1. Deploy Infrastructure

```bash
cd examples/azure-function-app
bun install
bun ./alchemy.run.ts
```

This creates:
- Resource Group
- Storage Account (for function runtime)
- Function App (serverless infrastructure)

### 2. Deploy Function Code

Choose one of these methods:

**Option A: Azure CLI**
```bash
# Package your function
npm install
npm run build
zip -r function.zip .

# Deploy
az functionapp deployment source config-zip \
  --resource-group <resource-group-name> \
  --name <function-app-name> \
  --src function.zip
```

**Option B: Azure Functions Core Tools**
```bash
func azure functionapp publish <function-app-name>
```

**Option C: VS Code**
- Install the Azure Functions extension
- Right-click on your function app
- Select "Deploy to Function App"

### 3. Test Your Function

```bash
# Test with query parameter
curl "https://<your-function-app>.azurewebsites.net/api/httpTrigger?name=Alchemy"

# Test with POST body
curl -X POST "https://<your-function-app>.azurewebsites.net/api/httpTrigger" \
  -H "Content-Type: text/plain" \
  -d "Azure Functions"
```

Expected response:
```json
{
  "message": "Hello, Alchemy!",
  "timestamp": "2025-11-29T12:34:56.789Z",
  "functionName": "httpTrigger",
  "invocationId": "abc-123-def"
}
```

## Function Code

The example includes a simple HTTP-triggered function in `src/index.ts`:

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function httpTrigger(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const name = request.query.get("name") || "World";
  
  return {
    status: 200,
    body: JSON.stringify({
      message: `Hello, ${name}!`,
      timestamp: new Date().toISOString(),
    }),
  };
}

app.http("httpTrigger", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: httpTrigger,
});
```

## View Logs

```bash
# Stream live logs
az functionapp log tail \
  --name <function-app-name> \
  --resource-group <resource-group-name>

# View in Azure Portal
# Navigate to: Function App → Monitor → Log Stream
```

## Pricing

**Consumption Plan (Y1 SKU):**
- **First 1 million executions**: Free
- **After that**: $0.20 per million executions
- **Execution time**: $0.000016/GB-s
- **No charges when idle** (truly serverless!)

Example: 100K requests/day with 200ms average execution
- Requests: 3M/month × $0.20 = $0.60
- Execution time: ~$0.50
- **Total: ~$1.10/month**

## Clean Up

```bash
bun ./alchemy.run.ts --destroy
```

This removes all resources and stops any charges.

## Next Steps

- Add more triggers (Timer, Queue, Blob, etc.)
- Use Durable Functions for workflows
- Add Application Insights for monitoring
- Configure custom domains and SSL
- Set up deployment slots for staging

## Learn More

- [Azure Functions Documentation](https://learn.microsoft.com/azure/azure-functions/)
- [Azure Functions Pricing](https://azure.microsoft.com/pricing/details/functions/)
- [Alchemy Azure Provider](../../alchemy/src/azure/)
