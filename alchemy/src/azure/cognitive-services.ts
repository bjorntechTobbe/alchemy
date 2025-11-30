import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { Account as AzureAccount } from "@azure/arm-cognitiveservices";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface CognitiveServicesProps extends AzureClientProps {
  /**
   * Name of the Cognitive Services account
   * Must be 2-64 characters, alphanumeric, hyphens, and underscores
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this Cognitive Services account in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this Cognitive Services account
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * The kind of Cognitive Services API to create
   *
   * - **CognitiveServices**: Multi-service resource for all APIs
   * - **ComputerVision**: Image analysis and OCR
   * - **Face**: Face detection and recognition
   * - **TextAnalytics**: Sentiment analysis, key phrases, entity recognition
   * - **SpeechServices**: Speech-to-text, text-to-speech, translation
   * - **LUIS**: Language Understanding for natural language processing
   * - **QnAMaker**: Question and answer service
   * - **CustomVision.Training**: Custom image classification training
   * - **CustomVision.Prediction**: Custom image classification prediction
   * - **AnomalyDetector**: Time-series anomaly detection
   * - **ContentModerator**: Content moderation for text, images, videos
   * - **Personalizer**: Reinforcement learning for personalization
   * - **FormRecognizer**: Extract data from forms and documents
   * - **TranslatorText**: Text translation
   * - **OpenAI**: Azure OpenAI Service for GPT models
   *
   * @default "CognitiveServices" (multi-service)
   */
  kind?:
    | "CognitiveServices"
    | "ComputerVision"
    | "Face"
    | "TextAnalytics"
    | "SpeechServices"
    | "LUIS"
    | "QnAMaker"
    | "CustomVision.Training"
    | "CustomVision.Prediction"
    | "AnomalyDetector"
    | "ContentModerator"
    | "Personalizer"
    | "FormRecognizer"
    | "TranslatorText"
    | "OpenAI";

  /**
   * The pricing tier for this Cognitive Services account
   *
   * - **F0**: Free tier with limited requests per month (most services)
   * - **S0**: Standard paid tier with pay-as-you-go pricing
   * - **S1-S10**: Service-specific standard tiers
   *
   * @default "S0" (Standard)
   */
  sku?:
    | "F0"
    | "S0"
    | "S1"
    | "S2"
    | "S3"
    | "S4"
    | "S5"
    | "S6"
    | "S7"
    | "S8"
    | "S9"
    | "S10";

  /**
   * Enable public network access
   * @default true
   */
  publicNetworkAccess?: boolean;

  /**
   * Custom subdomain for the endpoint
   * If not specified, a default subdomain based on the resource name is used
   * Required for some features like custom domains and AAD authentication
   */
  customSubDomain?: string;

  /**
   * Network ACLs to restrict access to the account
   */
  networkAcls?: {
    /**
     * Default action when no rules match
     * @default "Allow"
     */
    defaultAction?: "Allow" | "Deny";

    /**
     * IP rules for allowed IP addresses or CIDR ranges
     */
    ipRules?: string[];

    /**
     * Virtual network rules for allowed subnets
     */
    virtualNetworkRules?: string[];
  };

  /**
   * Tags to apply to the Cognitive Services account
   * @example { environment: "production", purpose: "ai-vision" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing Cognitive Services account
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the Cognitive Services account when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal Cognitive Services account ID for lifecycle management
   * @internal
   */
  cognitiveServicesId?: string;
}

export type CognitiveServices = Omit<
  CognitiveServicesProps,
  "delete" | "adopt"
> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The Cognitive Services account name (required in output)
   */
  name: string;

  /**
   * The resource group name (required in output)
   */
  resourceGroup: string;

  /**
   * Azure region (required in output)
   */
  location: string;

  /**
   * The Cognitive Services account ID
   * Format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.CognitiveServices/accounts/{accountName}
   */
  cognitiveServicesId: string;

  /**
   * The kind of Cognitive Services API
   */
  kind: string;

  /**
   * The pricing tier (SKU name)
   */
  sku: string;

  /**
   * The endpoint URL for the Cognitive Services API
   * Format: https://{location}.api.cognitive.microsoft.com (default)
   * Format: https://{customSubDomain}.cognitiveservices.azure.com (with custom subdomain)
   */
  endpoint: string;

  /**
   * The primary access key
   * Used for API authentication
   */
  primaryKey: Secret;

  /**
   * The secondary access key
   * Used for API authentication and key rotation
   */
  secondaryKey: Secret;

  /**
   * Provisioning state of the account
   */
  provisioningState?: string;

  /**
   * Resource type identifier for binding
   * @internal
   */
  type: "azure::CognitiveServices";
};

/**
 * Type guard to check if a resource is a CognitiveServices account
 */
export function isCognitiveServices(
  resource: unknown,
): resource is CognitiveServices {
  if (typeof resource !== "object" || resource === null) {
    return false;
  }
  if (!(ResourceKind in resource)) {
    return false;
  }
  const resourceWithKind = resource as Record<symbol, unknown>;
  return resourceWithKind[ResourceKind] === "azure::CognitiveServices";
}

/**
 * Azure Cognitive Services - AI and ML APIs
 *
 * Azure Cognitive Services provides AI capabilities through REST APIs and SDKs.
 * Services include vision, speech, language, decision, and OpenAI capabilities.
 *
 * **Unique to Azure**: While AWS has individual AI services (Rekognition, Comprehend, Polly),
 * Azure Cognitive Services provides a unified platform with consistent authentication and billing.
 *
 * @example
 * ## Multi-Service Cognitive Services Account
 *
 * Create a single account with access to all Cognitive Services APIs:
 *
 * ```ts
 * const rg = await ResourceGroup("ai-rg", {
 *   location: "eastus"
 * });
 *
 * const cognitive = await CognitiveServices("ai", {
 *   resourceGroup: rg,
 *   kind: "CognitiveServices", // All APIs
 *   sku: "S0" // Standard tier
 * });
 *
 * console.log(cognitive.endpoint);
 * console.log(Secret.unwrap(cognitive.primaryKey)); // Use for API calls
 * ```
 *
 * @example
 * ## Computer Vision API
 *
 * Create a dedicated Computer Vision resource for image analysis:
 *
 * ```ts
 * const vision = await CognitiveServices("vision", {
 *   resourceGroup: rg,
 *   kind: "ComputerVision",
 *   sku: "S1",
 *   customSubDomain: "myapp-vision" // Required for some features
 * });
 * ```
 *
 * @example
 * ## Azure OpenAI Service
 *
 * Create an OpenAI resource for GPT models:
 *
 * ```ts
 * const openai = await CognitiveServices("openai", {
 *   resourceGroup: rg,
 *   kind: "OpenAI",
 *   sku: "S0",
 *   customSubDomain: "myapp-openai" // Required for OpenAI
 * });
 * ```
 *
 * @example
 * ## Cognitive Services with Network Restrictions
 *
 * Restrict access to specific IP addresses and virtual networks:
 *
 * ```ts
 * const secure = await CognitiveServices("secure-ai", {
 *   resourceGroup: rg,
 *   kind: "CognitiveServices",
 *   networkAcls: {
 *     defaultAction: "Deny",
 *     ipRules: ["203.0.113.0/24"],
 *     virtualNetworkRules: ["/subscriptions/.../subnets/ai-subnet"]
 *   }
 * });
 * ```
 *
 * @example
 * ## Free Tier Cognitive Services
 *
 * Use the free tier for development and testing:
 *
 * ```ts
 * const dev = await CognitiveServices("dev-ai", {
 *   resourceGroup: rg,
 *   kind: "TextAnalytics",
 *   sku: "F0" // Free tier
 * });
 * ```
 */
export const CognitiveServices = Resource(
  "azure::CognitiveServices",
  async function (
    this: Context<CognitiveServices>,
    id: string,
    props: CognitiveServicesProps,
  ): Promise<CognitiveServices> {
    const cognitiveServicesId =
      props.cognitiveServicesId || this.output?.cognitiveServicesId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    const location =
      props.location ||
      this.output?.location ||
      (typeof props.resourceGroup === "string"
        ? undefined
        : props.resourceGroup.location);

    if (!location) {
      throw new Error(
        "Location must be specified either directly or via ResourceGroup object",
      );
    }

    const kind = props.kind ?? this.output?.kind ?? "CognitiveServices";
    const sku = props.sku ?? this.output?.sku ?? "S0";

    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroup: resourceGroupName,
        location,
        cognitiveServicesId: cognitiveServicesId || "",
        kind,
        sku,
        endpoint: props.customSubDomain
          ? `https://${props.customSubDomain}.cognitiveservices.azure.com`
          : `https://${location}.api.cognitive.microsoft.com`,
        primaryKey: Secret.wrap(""),
        secondaryKey: Secret.wrap(""),
        provisioningState: "Succeeded",
        customSubDomain: props.customSubDomain,
        publicNetworkAccess: props.publicNetworkAccess ?? true,
        networkAcls: props.networkAcls,
        tags: props.tags,
        type: "azure::CognitiveServices",
      };
    }

    const { cognitiveServices } = await createAzureClients(props);

    if (this.phase === "delete") {
      if (props.delete === false) {
        // Don't delete the account, just remove from state
        return this.destroy();
      }

      if (!cognitiveServicesId) {
        console.warn(`No cognitiveServicesId found for ${id}, skipping delete`);
        return this.destroy();
      }

      try {
        await cognitiveServices.accounts.beginDeleteAndWait(
          resourceGroupName,
          name,
        );
      } catch (error) {
        if (!isNotFoundError(error)) {
          console.error(
            `Error deleting Cognitive Services account ${id}:`,
            error,
          );
          throw error;
        }
      }
      return this.destroy();
    }

    // Validate name format (after delete phase)
    if (name.length < 2 || name.length > 64) {
      throw new Error(
        `Cognitive Services account name must be 2-64 characters, got: ${name}`,
      );
    }

    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
      throw new Error(
        `Cognitive Services account name must contain only alphanumeric characters, hyphens, and underscores, got: ${name}`,
      );
    }

    if (this.phase === "update" && this.output) {
      if (this.output.name !== name) {
        return this.replace();
      }
      if (this.output.location !== location) {
        return this.replace();
      }
      if (this.output.kind !== kind) {
        return this.replace();
      }
    }

    const accountParams: AzureAccount = {
      location,
      kind,
      sku: {
        name: sku,
      },
      properties: {
        customSubDomainName: props.customSubDomain,
        publicNetworkAccess:
          props.publicNetworkAccess === false ? "Disabled" : "Enabled",
      },
      tags: props.tags,
    };

    // Add network ACLs if specified
    if (props.networkAcls && accountParams.properties) {
      accountParams.properties.networkAcls = {
        defaultAction: props.networkAcls.defaultAction ?? "Allow",
        ipRules: props.networkAcls.ipRules?.map((ip) => ({ value: ip })) ?? [],
        virtualNetworkRules:
          props.networkAcls.virtualNetworkRules?.map((vnet) => ({
            id: vnet,
          })) ?? [],
      };
    }

    let account: AzureAccount;

    if (cognitiveServicesId) {
      account = await cognitiveServices.accounts.beginCreateAndWait(
        resourceGroupName,
        name,
        accountParams,
      );
    } else {
      if (!adopt) {
        try {
          const existing = await cognitiveServices.accounts.get(
            resourceGroupName,
            name,
          );
          if (existing) {
            throw new Error(
              `Cognitive Services account "${name}" already exists. Use adopt: true to adopt it.`,
            );
          }
        } catch (error: unknown) {
          if (!isNotFoundError(error)) {
            const azureError = error as { message?: string };
            if (azureError.message?.includes("already exists")) {
              throw error;
            }
          }
        }
      }

      // Create or adopt account
      account = await cognitiveServices.accounts.beginCreateAndWait(
        resourceGroupName,
        name,
        accountParams,
      );
    }

    const keys = await cognitiveServices.accounts.listKeys(
      resourceGroupName,
      name,
    );

    return {
      id,
      name: account.name!,
      resourceGroup: resourceGroupName,
      location: account.location!,
      cognitiveServicesId: account.id!,
      kind: kind,
      sku: sku,
      endpoint: account.properties?.endpoint || "",
      primaryKey: Secret.wrap(keys.key1 || ""),
      secondaryKey: Secret.wrap(keys.key2 || ""),
      provisioningState: account.properties?.provisioningState,
      customSubDomain: props.customSubDomain,
      publicNetworkAccess: props.publicNetworkAccess,
      networkAcls: props.networkAcls,
      tags: props.tags,
      type: "azure::CognitiveServices",
    };
  },
);
