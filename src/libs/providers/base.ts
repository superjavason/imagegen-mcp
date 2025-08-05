// 基础图像生成提供商接口和类型定义

export interface ImageGenerationParams {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  style?: string;
  quality?: string;
  response_format?: string;
  output_format?: string;
  output_compression?: number;
  background?: string;
  moderation?: string;
  user?: string;
  outputPath?: string;
  // 扩展参数
  [key: string]: any;
}

export interface ImageEditParams {
  images: string[];
  prompt: string;
  mask?: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: string;
  output_format?: string;
  output_compression?: number;
  user?: string;
  outputPath?: string;
  // 扩展参数
  [key: string]: any;
}

export interface ImageObject {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: ImageObject[];
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  allowedModels?: string[];
  [key: string]: any;
}

// 抽象基类
export abstract class BaseImageProvider {
  protected config: ProviderConfig;
  
  constructor(config: ProviderConfig) {
    this.config = config;
  }

  // 抽象方法，子类必须实现
  abstract generateImages(params: ImageGenerationParams): Promise<ImageGenerationResponse>;
  abstract editImages(params: ImageEditParams): Promise<ImageGenerationResponse>;
  abstract getAllowedModels(): Record<string, string>;
  abstract getDefaultModel(): string;
  abstract saveImageToTempFile(imageData: string, outputFormat?: string, outputPath?: string): string;

  // 可选的方法，子类可以覆盖
  validateParams(params: ImageGenerationParams | ImageEditParams): void {
    if (!params.prompt) {
      throw new Error('Prompt is required');
    }
  }

  // 通用工具方法
  protected base64ToBuffer(base64: string): Buffer {
    const base64Data = base64.includes('base64,') ? 
      base64.split('base64,')[1] : 
      base64;
    
    return Buffer.from(base64Data, 'base64');
  }
}

// 提供商类型枚举
export enum ProviderType {
  OPENAI = 'openai',
  STABILITY = 'stability',
  REPLICATE = 'replicate',
  HUGGINGFACE = 'huggingface'
}

export const PROVIDER_CONFIGS = {
  [ProviderType.OPENAI]: {
    name: 'OpenAI',
    description: 'OpenAI DALL-E models',
    requiresApiKey: true,
    envKey: 'OPENAI_API_KEY',
    supportedFeatures: ['text-to-image', 'image-to-image']
  },
  [ProviderType.STABILITY]: {
    name: 'Stability AI',
    description: 'Stable Diffusion models',
    requiresApiKey: true,
    envKey: 'STABILITY_API_KEY',
    supportedFeatures: ['text-to-image', 'image-to-image']
  },
  [ProviderType.REPLICATE]: {
    name: 'Replicate',
    description: 'Various open-source models',
    requiresApiKey: true,
    envKey: 'REPLICATE_API_TOKEN',
    supportedFeatures: ['text-to-image', 'image-to-image']
  },
  [ProviderType.HUGGINGFACE]: {
    name: 'Hugging Face',
    description: 'Hugging Face Inference API',
    requiresApiKey: true,
    envKey: 'HUGGINGFACE_API_KEY',
    supportedFeatures: ['text-to-image']
  }
};