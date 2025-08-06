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
console.error("\n📖 Tool Usage Examples:");
console.error("1. Text-to-image: 'Generate a beautiful sunset over mountains, oil painting style'");
console.error("2. Image-to-image: 'Edit the background to blue sky with white clouds'");
console.error("✨ Ready to generate amazing images!");


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
    text: z.string().describe("详细的图像生成提示词，描述你想要生成的图像内容、风格、颜色等。例如：'富士山日出的美丽风景画，油画风格，暖色调'"),
    outputPath: z.string().optional().describe("保存图像的绝对路径。如果不指定，将自动保存到临时目录。例如：'/Users/username/Desktop/image.png'"),
    model: z.enum(objectValuesToZodEnum(flatModels)).optional().describe(`使用的AI模型。可选模型：${Object.keys(flatModels).slice(0, 5).join(', ')}等。建议使用dall-e-3获得最佳效果`).default(defaultModel),
    provider: z.enum(objectValuesToZodEnum(Object.fromEntries(providerFactory.getAvailableProviders().map(p => [p, p])))).optional().describe("AI提供商：openai(DALL-E), stability(Stable Diffusion), replicate等。通常会根据模型自动选择"),
    size: z.enum(objectValuesToZodEnum(SIZES)).optional().describe("图像尺寸。常用：1024x1024(正方形), 1792x1024(横向), 1024x1792(竖向)").default(SIZES.S1024),
    style: z.enum(objectValuesToZodEnum(STYLES)).optional().describe("图像风格：vivid(生动鲜艳) 或 natural(自然真实)。主要适用于DALL-E 3").default(STYLES.VIVID),
    output_format: z.enum(objectValuesToZodEnum(OUTPUT_FORMATS)).optional().describe("输出格式：png(推荐), jpeg, webp").default(OUTPUT_FORMATS.PNG),
    n: z.number().optional().describe("生成图像数量，通常设为1").default(1), 
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
      const filePath = targetProvider.saveImageToTempFile(imageData, output_format, outputPath || undefined);

      return {
        content: [
          {
            type: "text",
            text: `图像生成成功！🎨\n保存路径：${filePath}\n\n提示词：${text}\n使用模型：${targetModel}\n提供商：${targetProvider.constructor.name}\n图像尺寸：${size}`
          }
        ]
      };
    } catch (error: unknown) {
      console.error("Error generating image:", error);
      return {
        content: [
          { 
            type: "text", 
            text: `图像生成失败：${error instanceof Error ? error.message : String(error)}\n\n请检查：\n1. API密钥是否正确配置\n2. 提示词是否合适\n3. 模型是否可用\n\n当前配置：\n- 提供商：${providerFactory.getAvailableProviders().join(', ')}\n- 默认模型：${defaultModel}` 
          }
        ]
      };
    }
  }
);

server.tool("image-to-image",
  { 
    images: z.array(z.string()).describe("要编辑的图像文件路径数组。例如：['/path/to/image.jpg']"),
    prompt: z.string().describe("描述期望编辑效果的文本提示。例如：'将背景改为蓝天白云，保持人物不变'"),
    outputPath: z.string().optional().describe("保存编辑后图像的绝对路径。如果不指定，将自动保存到临时目录"),
    mask: z.string().optional().describe("遮罩图像文件路径(PNG格式)。透明区域表示要编辑的部分"),
    model: z.enum(objectValuesToZodEnum(flatModels)).optional().describe(`使用的AI模型。可选模型：${Object.keys(flatModels).slice(0, 5).join(', ')}等`).default(defaultModel),
    provider: z.enum(objectValuesToZodEnum(Object.fromEntries(providerFactory.getAvailableProviders().map(p => [p, p])))).optional().describe("AI提供商：openai, stability, replicate等。通常会根据模型自动选择"),
    size: z.enum(objectValuesToZodEnum(SIZES)).optional().describe("生成图像尺寸：1024x1024, 1792x1024等").default(SIZES.S1024),
    output_format: z.enum(objectValuesToZodEnum(OUTPUT_FORMATS)).optional().describe("输出格式：png(推荐), jpeg, webp").default(OUTPUT_FORMATS.PNG),
    n: z.number().optional().describe("生成图像数量，通常设为1").default(1),
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
      const filePath = targetProvider.saveImageToTempFile(imageData, output_format, outputPath || undefined);

      return {
        content: [
          {
            type: "text",
            text: `图像编辑完成！\n保存路径：${filePath}\n\n使用的模型：${targetModel}\n提供商：${targetProvider.constructor.name}`
          }
        ]
      };
    } catch (error: unknown) {
      console.error("Error editing image:", error);
      return {
        content: [
          { 
            type: "text", 
            text: `图像编辑失败：${error instanceof Error ? error.message : String(error)}\n\n请检查：\n1. 图像文件路径是否正确\n2. API密钥是否有效\n3. 提示词是否合适` 
          }
        ]
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);