import fetch from 'node-fetch';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { 
  BaseImageProvider, 
  ImageGenerationParams, 
  ImageEditParams, 
  ImageGenerationResponse, 
  ProviderConfig 
} from './base.js';

// OpenAI 特定的模型和常量
export const OPENAI_MODELS = {
  GPT_IMAGE: 'gpt-image-1',
  DALLE2: 'dall-e-2',
  DALLE3: 'dall-e-3',
} as const;

export const SIZES = {
  S256: '256x256',
  S512: '512x512',
  S1024: '1024x1024',
  LANDSCAPE: '1536x1024',
  PORTRAIT: '1024x1536',
  WIDE: '1792x1024',
  TALL: '1024x1792',
  AUTO: 'auto'
} as const;

export const RESPONSE_FORMATS = {
  URL: 'url',
  B64_JSON: 'b64_json'
} as const;

export const STYLES = {
  VIVID: 'vivid',
  NATURAL: 'natural'
} as const;

export const QUALITIES = {
  STANDARD: 'standard',
  AUTO: 'auto',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const;

export const BACKGROUNDS = {
  TRANSPARENT: 'transparent',
  OPAQUE: 'opaque',
  AUTO: 'auto'
} as const;

export const OUTPUT_FORMATS = {
  PNG: 'png',
  JPEG: 'jpeg',
  WEBP: 'webp'
} as const;

export const MODERATION_LEVELS = {
  LOW: 'low',
  AUTO: 'auto'
} as const;

export type ImageModel = typeof OPENAI_MODELS[keyof typeof OPENAI_MODELS];
export type ImageSize = typeof SIZES[keyof typeof SIZES];
export type ImageResponseFormat = typeof RESPONSE_FORMATS[keyof typeof RESPONSE_FORMATS];
export type ImageStyle = typeof STYLES[keyof typeof STYLES];
export type ImageQuality = typeof QUALITIES[keyof typeof QUALITIES];
export type ImageBackground = typeof BACKGROUNDS[keyof typeof BACKGROUNDS];
export type ImageOutputFormat = typeof OUTPUT_FORMATS[keyof typeof OUTPUT_FORMATS];
export type ImageModeration = typeof MODERATION_LEVELS[keyof typeof MODERATION_LEVELS];

export class OpenAIImageProvider extends BaseImageProvider {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1/images/generations';
  private editUrl: string = 'https://api.openai.com/v1/images/edits';
  private allowedModels: Record<string, ImageModel>;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    this.apiKey = config.apiKey;
    
    // 如果指定了特定模型，筛选允许的模型
    if (config.allowedModels && config.allowedModels.length > 0) {
      this.allowedModels = {};
      config.allowedModels.forEach(modelName => {
        const modelEntry = Object.entries(OPENAI_MODELS).find(([_, value]) => value === modelName);
        if (modelEntry) {
          const [key, value] = modelEntry;
          this.allowedModels[key] = value;
        } else {
          console.warn(`Warning: Unknown OpenAI model "${modelName}" specified. Ignoring.`);
        }
      });
      
      // 如果没有有效的模型，使用所有模型
      if (Object.keys(this.allowedModels).length === 0) {
        console.warn("No valid OpenAI models specified. Using all available models.");
        this.allowedModels = { ...OPENAI_MODELS };
      }
    } else {
      // 如果没有指定模型，使用所有可用模型
      this.allowedModels = { ...OPENAI_MODELS };
    }
    
    console.log("Available OpenAI models:", Object.values(this.allowedModels));
  }

  getAllowedModels(): Record<string, ImageModel> {
    return this.allowedModels;
  }

  getDefaultModel(): ImageModel {
    return Object.values(this.allowedModels)[0];
  }

  async generateImages(params: ImageGenerationParams): Promise<ImageGenerationResponse> {
    this.validateParams(params);

    // 设置默认值
    const defaults = {
      model: this.getDefaultModel(),
      n: 1,
      size: SIZES.S1024,
      response_format: RESPONSE_FORMATS.B64_JSON,
      style: STYLES.VIVID,
      background: BACKGROUNDS.AUTO,
      quality: QUALITIES.AUTO,
      output_format: OUTPUT_FORMATS.PNG,
      output_compression: 100,
      moderation: MODERATION_LEVELS.LOW,
    };

    const requestParams = { ...defaults, ...params };
    
    // 验证模型是否被允许
    if (requestParams.model) {
      const isModelAllowed = Object.values(this.allowedModels).includes(requestParams.model as ImageModel);
      if (!isModelAllowed) {
        throw new Error(`Model "${requestParams.model}" is not allowed. Allowed models: ${Object.values(this.allowedModels).join(', ')}`);
      }
    }

    // 模型特定的验证
    if (requestParams.model === OPENAI_MODELS.DALLE3 && requestParams.n && requestParams.n > 1) {
      throw new Error('dall-e-3 model only supports n=1');
    }
    
    // 移除非 dall-e-3 模型的样式参数
    if (requestParams.model !== OPENAI_MODELS.DALLE3) {
      (requestParams as any).style = undefined;
    }

    // 尺寸验证
    if (requestParams.model === OPENAI_MODELS.DALLE2 && requestParams.size && 
        requestParams.size !== '256x256' && requestParams.size !== '512x512' && requestParams.size !== '1024x1024') {
      throw new Error('dall-e-2 only supports sizes 256x256, 512x512, or 1024x1024');
    }

    if (requestParams.model === OPENAI_MODELS.DALLE3 && requestParams.size && 
        requestParams.size !== '1024x1024' && requestParams.size !== '1792x1024' && requestParams.size !== '1024x1792') {
      throw new Error('dall-e-3 only supports sizes 1024x1024, 1792x1024, or 1024x1792');
    }

    // 处理透明度要求
    if (requestParams.background === BACKGROUNDS.TRANSPARENT && 
        requestParams.output_format && 
        requestParams.output_format !== 'png' && requestParams.output_format !== 'webp') {
      throw new Error('When background is transparent, output_format must be png or webp');
    }

    const cleanedParams = { ...requestParams };
    if (requestParams.model !== OPENAI_MODELS.DALLE2 && requestParams.model !== OPENAI_MODELS.DALLE3) {
      // gpt-image-1 总是返回 base64 编码图像，不支持 response_format
      (cleanedParams as any).response_format = undefined;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(cleanedParams)
    });

    if (!response.ok) {
      const errorData = await response.json() as { error: { message: string } };
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    return response.json() as Promise<ImageGenerationResponse>;
  }

  async editImages(params: ImageEditParams): Promise<ImageGenerationResponse> {
    if (!params.images || params.images.length === 0) {
      throw new Error('At least one image file path is required');
    }
    
    this.validateParams(params);

    // 设置默认值
    const defaults = {
      model: OPENAI_MODELS.GPT_IMAGE, // 只有 dall-e-2 和 gpt-image-1 支持编辑
      n: 1,
      size: SIZES.S1024,
      response_format: RESPONSE_FORMATS.B64_JSON,
      quality: QUALITIES.AUTO,
      output_format: OUTPUT_FORMATS.PNG,
      output_compression: 100,
    };

    const requestParams = { ...defaults, ...params };
    
    // 验证模型是否被允许和支持编辑
    if (requestParams.model) {
      const isModelAllowed = Object.values(this.allowedModels).includes(requestParams.model as ImageModel);
      if (!isModelAllowed) {
        throw new Error(`Model "${requestParams.model}" is not allowed. Allowed models: ${Object.values(this.allowedModels).join(', ')}`);
      }
      
      // 检查模型是否支持编辑
      if (requestParams.model !== OPENAI_MODELS.DALLE2 && requestParams.model !== OPENAI_MODELS.GPT_IMAGE) {
        throw new Error('Only dall-e-2 and gpt-image-1 are supported for image editing');
      }
    }

    // 模型特定验证
    if (requestParams.model === OPENAI_MODELS.DALLE2 && requestParams.images.length !== 1) {
      throw new Error('dall-e-2 only supports a single image for editing');
    }

    // 尺寸验证
    if (requestParams.model === OPENAI_MODELS.DALLE2 && requestParams.size && 
        requestParams.size !== '256x256' && requestParams.size !== '512x512' && requestParams.size !== '1024x1024') {
      throw new Error('dall-e-2 only supports sizes 256x256, 512x512, or 1024x1024');
    }

    const formData = new FormData();
    
    // 添加所有提供的图像文件
    requestParams.images.forEach((filePath, index) => {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Image file not found: ${filePath}`);
      }
      const buffer = fs.readFileSync(filePath);
      formData.append('image[]', buffer, { filename: path.basename(filePath) });
    });
    
    // 添加蒙版（如果提供）
    if (requestParams.mask) {
        if (!fs.existsSync(requestParams.mask)) {
          throw new Error(`Mask file not found: ${requestParams.mask}`);
        }
        const maskBuffer = fs.readFileSync(requestParams.mask);
        formData.append('mask', maskBuffer, { filename: path.basename(requestParams.mask) });
    }
    
    // 添加其他参数
    formData.append('prompt', requestParams.prompt);
    if (requestParams.model) formData.append('model', requestParams.model);
    if (requestParams.n) formData.append('n', requestParams.n.toString());
    if (requestParams.size) formData.append('size', requestParams.size);
    if (requestParams.response_format && requestParams.model !== OPENAI_MODELS.GPT_IMAGE) formData.append('response_format', requestParams.response_format);
    if (requestParams.quality) formData.append('quality', requestParams.quality);
    if (requestParams.user) formData.append('user', requestParams.user);

    const response = await fetch(this.editUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json() as { error: { message: string } };
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    return response.json() as Promise<ImageGenerationResponse>;
  }

  saveImageToTempFile(
    imageData: string, 
    outputFormat: string = OUTPUT_FORMATS.PNG,
    outputPath?: string
  ): string {
    // 移除数据 URL 前缀（如果存在）
    const base64Data = imageData.includes('base64,') ? 
      imageData.split('base64,')[1] : 
      imageData;
    
    const buffer = Buffer.from(base64Data, 'base64');
    
    let filePath: string;
    
    if (outputPath) {
      // 检查 outputPath 是否包含文件名（有扩展名）
      const parsedPath = path.parse(outputPath);
      
      if (parsedPath.ext) {
        // outputPath 包含文件名
        filePath = outputPath;
        
        // 确保目录存在
        const dirPath = parsedPath.dir;
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      } else {
        // outputPath 只是目录，使用 UUID 作为文件名
        const uuid = uuidv4();
        
        // 确保目录存在
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }
        
        filePath = path.join(outputPath, `${uuid}.${outputFormat}`);
      }
    } else {
      // 默认行为 - 保存到 /tmp 目录，使用 UUID 文件名
      const uuid = uuidv4();
      filePath = path.join('/tmp', `${uuid}.${outputFormat}`);
    }
    
    fs.writeFileSync(filePath, buffer);
    
    return filePath;
  }
}