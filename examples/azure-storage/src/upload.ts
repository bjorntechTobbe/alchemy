import { BlobServiceClient } from "@azure/storage-blob";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Example script to upload files to Azure Blob Storage
 * 
 * This demonstrates how to:
 * 1. Connect to Azure Storage using a connection string
 * 2. Upload files to blob containers
 * 3. Set blob metadata and properties
 * 4. Generate SAS tokens for secure access
 * 
 * Prerequisites:
 * - Run `bun alchemy.run.ts` to deploy the infrastructure
 * - Set AZURE_STORAGE_CONNECTION_STRING environment variable
 *   (get it from the deployed storage account)
 */

async function main() {
  // Get connection string from environment
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  
  if (!connectionString) {
    console.error("Error: AZURE_STORAGE_CONNECTION_STRING environment variable not set");
    console.error("\nTo get the connection string:");
    console.error("1. Run: bun alchemy.run.ts");
    console.error("2. Copy the connection string from the output");
    console.error("3. Set: export AZURE_STORAGE_CONNECTION_STRING='<connection-string>'");
    console.error("4. Run: bun run upload");
    process.exit(1);
  }

  console.log("Connecting to Azure Storage...");
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

  // Upload to private container
  console.log("\n📦 Uploading to private container (uploads)...");
  const privateContainer = blobServiceClient.getContainerClient("uploads");
  
  // Create sample content
  const sampleText = `# Azure Storage Example

This file was uploaded using the Azure Storage SDK for JavaScript.

Upload time: ${new Date().toISOString()}

Azure Blob Storage features:
- Scalable object storage
- Multiple access tiers (Hot, Cool, Archive)
- Geo-redundant options
- Built-in encryption
- Soft delete protection
`;

  // Upload text file
  const textBlobClient = privateContainer.getBlockBlobClient("sample.txt");
  await textBlobClient.upload(sampleText, sampleText.length, {
    blobHTTPHeaders: {
      blobContentType: "text/plain",
    },
    metadata: {
      uploadedBy: "azure-storage-example",
      category: "sample",
      timestamp: new Date().toISOString(),
    },
  });

  console.log("✓ Uploaded: sample.txt");
  console.log(`  URL: ${textBlobClient.url}`);
  console.log(`  Size: ${sampleText.length} bytes`);

  // Upload JSON file
  const jsonData = {
    name: "Azure Storage Demo",
    type: "Example Data",
    features: [
      "Blob Storage",
      "File Storage",
      "Queue Storage",
      "Table Storage",
    ],
    metadata: {
      uploadedAt: new Date().toISOString(),
      version: "1.0.0",
    },
  };

  const jsonContent = JSON.stringify(jsonData, null, 2);
  const jsonBlobClient = privateContainer.getBlockBlobClient("data.json");
  await jsonBlobClient.upload(jsonContent, jsonContent.length, {
    blobHTTPHeaders: {
      blobContentType: "application/json",
    },
    metadata: {
      uploadedBy: "azure-storage-example",
      category: "data",
    },
  });

  console.log("✓ Uploaded: data.json");
  console.log(`  URL: ${jsonBlobClient.url}`);
  console.log(`  Size: ${jsonContent.length} bytes`);

  // Upload to public container
  console.log("\n🌐 Uploading to public container (assets)...");
  const publicContainer = blobServiceClient.getContainerClient("assets");

  // Create sample HTML content
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azure Storage Demo</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #0078d4; }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            background: #0078d4;
            color: white;
            border-radius: 4px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 Azure Storage Demo</h1>
        <p class="badge">Public Access</p>
        <p>This HTML file is served directly from Azure Blob Storage with public access.</p>
        <p><strong>Features:</strong></p>
        <ul>
            <li>Static file hosting</li>
            <li>CDN integration</li>
            <li>Custom domain support</li>
            <li>HTTPS by default</li>
        </ul>
        <p><small>Uploaded: ${new Date().toISOString()}</small></p>
    </div>
</body>
</html>`;

  const htmlBlobClient = publicContainer.getBlockBlobClient("demo.html");
  await htmlBlobClient.upload(htmlContent, htmlContent.length, {
    blobHTTPHeaders: {
      blobContentType: "text/html",
      blobCacheControl: "public, max-age=3600",
    },
  });

  console.log("✓ Uploaded: demo.html");
  console.log(`  URL: ${htmlBlobClient.url}`);
  console.log(`  Public Access: Yes (can be accessed in browser)`);

  // List all blobs in private container
  console.log("\n📋 Listing blobs in private container...");
  let blobCount = 0;
  for await (const blob of privateContainer.listBlobsFlat()) {
    blobCount++;
    console.log(`  ${blobCount}. ${blob.name}`);
    console.log(`     Size: ${blob.properties.contentLength} bytes`);
    console.log(`     Type: ${blob.properties.contentType}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Upload Complete!");
  console.log("=".repeat(60));
  console.log(`\nPrivate Container (uploads):`);
  console.log(`  - sample.txt`);
  console.log(`  - data.json`);
  console.log(`  Access: Requires authentication`);
  console.log(`\nPublic Container (assets):`);
  console.log(`  - demo.html`);
  console.log(`  Access: Public (try opening in browser)`);
  console.log(`  URL: ${htmlBlobClient.url}`);
  console.log("=".repeat(60) + "\n");
}

main().catch(error => {
  console.error("Error:", error.message);
  process.exit(1);
});
