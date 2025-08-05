import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ImageProviderFactory, MultiProviderConfig } from "./libs/providerFactory.js";
import { ProviderType } from "./libs/providers/base.js";
import { SIZES, STYLES, RESPONSE_FORMATS, OUTPUT_FORMATS, MODERATION_LEVELS, BACKGROUNDS, QUALITIES } from "./libs/providers/openaiProvider.js";

import dotenv from "dotenv";
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
let allowedModels: string[] = [];
let enabledProviders: ProviderType[] = [];

// Parse --models flag
const modelsIndex = args.indexOf('--models');
if (modelsIndex !== -1) {
  for (let i = modelsIndex + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      break;
    }
    allowedModels.push(args[i]);
  }
}

// Parse --providers flag
const providersIndex = args.indexOf('--providers');
if (providersIndex !== -1) {
  for (let i = providersIndex + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      break;
    }
    if (Object.values(ProviderType).includes(args[i] as ProviderType)) {
      enabledProviders.push(args[i] as ProviderType);
    }
  }
}

// 创建多提供商配置
const factoryConfig: Partial<MultiProviderConfig> = {};

if (enabledProviders.length > 0) {
  factoryConfig.providers = enabledProviders;
  factoryConfig.defaultProvider = enabledProviders[0];
}

if (allowedModels.length > 0) {
  factoryConfig.providerSettings = {};
  // 如果指定了模型，将其应用到所有提供商
  for (const provider of enabledProviders.length > 0 ? enabledProviders : [ProviderType.OPENAI]) {
    factoryConfig.providerSettings[provider] = { allowedModels };
  }
}

// 初始化提供商工厂
const providerFactory = ImageProviderFactory.createFromConfig(factoryConfig);

console.error("🎨 Multi-Provider Image Generation MCP Server");
console.error("Available providers:", providerFactory.getAvailableProviders().join(', '));
console.error("Provider statistics:");
console.error(JSON.stringify(providerFactory.getProviderStats(), null, 2));


// 获取所有提供商的模型
const allModels = providerFactory.getAllProviderModels();
const flatModels: Record<string, string> = {};
for (const [provider, models] of Object.entries(allModels)) {
  Object.assign(flatModels, models);
}

// 获取默认模型
const defaultProvider = providerFactory.getDefaultProvider();
const defaultModel = Object.keys(flatModels)[0] || defaultProvider.getDefaultModel();

function objectValuesToZodEnum<T extends string>(obj: Record<string, T>) {
  return Object.values(obj) as [T, ...T[]];
}

const server = new McpServer({
  name: "Multi-Provider Image Generation",
  version: "2.0.0"
});

server.tool("text-to-image",
  { 
    text: z.string().describe("The prompt to generate an image from"),
    outputPath: z.string().describe("Absolute path where the output file should be saved."),
    model: z.enum(objectValuesToZodEnum(flatModels)).optional().describe("The model to use (format: provider/model or model name)").default(defaultModel),
    provider: z.enum(objectValuesToZodEnum(Object.fromEntries(providerFactory.getAvailableProviders().map(p => [p, p])))).optional().describe("The provider to use (auto-detected from model if not specified)"),
    size: z.enum(objectValuesToZodEnum(SIZES)).optional().describe("Size of the generated image").default(SIZES.S1024),
    style: z.enum(objectValuesToZodEnum(STYLES)).optional().describe("Style of the image (for supported models)").default(STYLES.VIVID),
    output_format: z.enum(objectValuesToZodEnum(OUTPUT_FORMATS)).optional().describe("The format of the generated image").default(OUTPUT_FORMATS.PNG),
    output_compression: z.number().optional().describe("The compression of the generated image").default(100),
    moderation: z.enum(objectValuesToZodEnum(MODERATION_LEVELS)).optional().describe("The moderation level of the generated image").default(MODERATION_LEVELS.LOW),
    background: z.enum(objectValuesToZodEnum(BACKGROUNDS)).optional().describe("The background of the generated image").default(BACKGROUNDS.AUTO),
    quality: z.enum(objectValuesToZodEnum(QUALITIES)).optional().describe("The quality of the generated image").default(QUALITIES.AUTO),
    n: z.number().optional().describe("The number of images to generate").default(1), 
  },
  async ({ text, model, provider, size, style, output_format, output_compression, moderation, background, quality, n, outputPath }) => {
    try {
      // 选择提供商和模型
      let targetProvider = providerFactory.getDefaultProvider();
      let targetModel = model || defaultModel;

      if (provider) {
        targetProvider = providerFactory.getProvider(provider as any);
      } else if (model) {
        const providerResult = providerFactory.getProviderFromModel(model);
        targetProvider = providerResult.provider;
        targetModel = providerResult.model;
      }

                    console.error(`🎨 Generating image with provider: ${provider || 'auto'}, model: ${targetModel}`);

      const result = await targetProvider.generateImages({
        prompt: text,
        model: targetModel,
        size: size,
        style: style,
        response_format: RESPONSE_FORMATS.B64_JSON,
        output_format: output_format,
        output_compression: output_compression,
        moderation: moderation,
        background: background,
        quality: quality,
        n: n
      });

      if (result.data.length === 0) {
        throw new Error("No images were generated");
      }

      const imageData = result.data[0].b64_json;
      if (!imageData) {
        throw new Error("Image data not found in response");
      }

      // Save the image to the specified file path or a temporary file
      const filePath = targetProvider.saveImageToTempFile(imageData, output_format, outputPath);

      return {
        content: [
          {
            type: "text",
            text: filePath
          }
        ]
      };
    } catch (error: unknown) {
      console.error("Error generating image:", error);
      return {
        content: [
          { 
            type: "text", 
            text: `Error generating image: ${error instanceof Error ? error.message : String(error)}` 
          }
        ]
      };
    }
  }
);

server.tool("image-to-image",
  { 
    images: z.array(z.string()).describe("The images to edit. Must be an array of file paths."),
    prompt: z.string().describe("A text description of the desired image(s)"),
    outputPath: z.string().describe("Absolute path where the output file should be saved."),
    mask: z.string().optional().describe("Optional mask image whose transparent areas indicate where image should be edited. Must be a file path."),
    model: z.enum(objectValuesToZodEnum(flatModels)).optional().describe("The model to use (format: provider/model or model name)").default(defaultModel),
    provider: z.enum(objectValuesToZodEnum(Object.fromEntries(providerFactory.getAvailableProviders().map(p => [p, p])))).optional().describe("The provider to use (auto-detected from model if not specified)"),
    size: z.enum(objectValuesToZodEnum(SIZES)).optional().describe("Size of the generated image").default(SIZES.S1024),
    output_format: z.enum(objectValuesToZodEnum(OUTPUT_FORMATS)).optional().describe("The format of the generated image").default(OUTPUT_FORMATS.PNG),
    output_compression: z.number().optional().describe("The compression of the generated image").default(100),
    quality: z.enum(objectValuesToZodEnum(QUALITIES)).optional().describe("The quality of the generated image").default(QUALITIES.AUTO),
    n: z.number().optional().describe("The number of images to generate").default(1),
  },
  async ({ images, prompt, mask, model, provider, size, output_format, output_compression, quality, n, outputPath }) => {
    try {
      // 选择提供商和模型
      let targetProvider = providerFactory.getDefaultProvider();
      let targetModel = model || defaultModel;

      if (provider) {
        targetProvider = providerFactory.getProvider(provider as any);
      } else if (model) {
        const providerResult = providerFactory.getProviderFromModel(model);
        targetProvider = providerResult.provider;
        targetModel = providerResult.model;
      }

                    console.error(`🖼️ Editing image with provider: ${provider || 'auto'}, model: ${targetModel}`);

      const result = await targetProvider.editImages({
        images: images,
        prompt,
        mask,
        model: targetModel,
        size: size,
        response_format: RESPONSE_FORMATS.B64_JSON,
        output_format: output_format,
        output_compression: output_compression,
        quality: quality,
        n: n
      });

      if (result.data.length === 0) {
        throw new Error("No images were generated");
      }

      const imageData = result.data[0].b64_json;
      if (!imageData) {
        throw new Error("Image data not found in response");
      }

      // Save the image to the specified file path or a temporary file
      const filePath = targetProvider.saveImageToTempFile(imageData, output_format, outputPath);

      return {
        content: [
          {
            type: "text",
            text: filePath
          }
        ]
      };
    } catch (error: unknown) {
      console.error("Error editing image:", error);
      return {
        content: [
          { 
            type: "text", 
            text: `Error editing image: ${error instanceof Error ? error.message : String(error)}` 
          }
        ]
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);