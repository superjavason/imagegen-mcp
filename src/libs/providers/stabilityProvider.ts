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

// Stability AI 特定的模型和常量
export const STABILITY_MODELS = {
  STABLE_DIFFUSION_XL: 'stable-diffusion-xl-1024-v1-0',
  STABLE_DIFFUSION_V2_1: 'stable-diffusion-v2-1',
  STABLE_DIFFUSION_V1_6: 'stable-diffusion-v1-6',
  STABLE_DIFFUSION_512_V2_1: 'stable-diffusion-512-v2-1'
} as const;

export const STABILITY_SIZES = {
  S512: '512x512',
  S768: '768x768',
  S1024: '1024x1024',
  S1152: '1152x896',
  S896: '896x1152',
  S1216: '1216x832',
  S832: '832x1216',
  S1344: '1344x768',
  S768_1344: '768x1344',
  S1536: '1536x640',
  S640: '640x1536'
} as const;

export const STABILITY_ENGINES = {
  STABLE_DIFFUSION_XL_1024_V0_9: 'stable-diffusion-xl-1024-v0-9',
  STABLE_DIFFUSION_XL_1024_V1_0: 'stable-diffusion-xl-1024-v1-0',
  STABLE_DIFFUSION_V1_6: 'stable-diffusion-v1-6',
  STABLE_DIFFUSION_512_V2_1: 'stable-diffusion-512-v2-1'
} as const;

export type StabilityModel = typeof STABILITY_MODELS[keyof typeof STABILITY_MODELS];
export type StabilitySize = typeof STABILITY_SIZES[keyof typeof STABILITY_SIZES];

export class StabilityImageProvider extends BaseImageProvider {
  private apiKey: string;
  private baseUrl: string = 'https://api.stability.ai/v1';
  private allowedModels: Record<string, StabilityModel>;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('Stability AI API key is required');
    }
    
    this.apiKey = config.apiKey;
    
    // 设置允许的模型
    if (config.allowedModels && config.allowedModels.length > 0) {
      this.allowedModels = {};
      config.allowedModels.forEach(modelName => {
        const modelEntry = Object.entries(STABILITY_MODELS).find(([_, value]) => value === modelName);
        if (modelEntry) {
          const [key, value] = modelEntry;
          this.allowedModels[key] = value;
        } else {
          console.warn(`Warning: Unknown Stability AI model "${modelName}" specified. Ignoring.`);
        }
      });
      
      if (Object.keys(this.allowedModels).length === 0) {
        console.warn("No valid Stability AI models specified. Using all available models.");
        this.allowedModels = { ...STABILITY_MODELS };
      }
    } else {
      this.allowedModels = { ...STABILITY_MODELS };
    }
    
            console.error("Available Stability AI models:", Object.values(this.allowedModels));
  }

  getAllowedModels(): Record<string, StabilityModel> {
    return this.allowedModels;
  }

  getDefaultModel(): StabilityModel {
    return Object.values(this.allowedModels)[0];
  }

  async generateImages(params: ImageGenerationParams): Promise<ImageGenerationResponse> {
    this.validateParams(params);

    const model = params.model || this.getDefaultModel();
    
    // 验证模型是否被允许
    const isModelAllowed = Object.values(this.allowedModels).includes(model as StabilityModel);
    if (!isModelAllowed) {
      throw new Error(`Model "${model}" is not allowed. Allowed models: ${Object.values(this.allowedModels).join(', ')}`);
    }

    const requestBody = {
      text_prompts: [
        {
          text: params.prompt,
          weight: 1
        }
      ],
      cfg_scale: 7,
      height: this.extractHeightFromSize(params.size || '1024x1024'),
      width: this.extractWidthFromSize(params.size || '1024x1024'),
      samples: params.n || 1,
      steps: 30,
      style_preset: params.style,
    };

    const response = await fetch(`${this.baseUrl}/generation/${model}/text-to-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json() as { message?: string };
      throw new Error(`Stability AI API error: ${errorData.message || response.statusText}`);
    }

    const result = await response.json() as any;
    
    // 转换为标准格式
    return {
      created: Date.now(),
      data: result.artifacts.map((artifact: any) => ({
        b64_json: artifact.base64,
        revised_prompt: params.prompt
      }))
    };
  }

  async editImages(params: ImageEditParams): Promise<ImageGenerationResponse> {
    if (!params.images || params.images.length === 0) {
      throw new Error('At least one image file path is required');
    }
    
    this.validateParams(params);

    const model = params.model || this.getDefaultModel();
    
    // 验证模型是否被允许
    const isModelAllowed = Object.values(this.allowedModels).includes(model as StabilityModel);
    if (!isModelAllowed) {
      throw new Error(`Model "${model}" is not allowed. Allowed models: ${Object.values(this.allowedModels).join(', ')}`);
    }

    const formData = new FormData();
    
    // 添加文本提示
    formData.append('text_prompts[0][text]', params.prompt);
    formData.append('text_prompts[0][weight]', '1');
    
    // 添加图像文件
    const imagePath = params.images[0]; // Stability AI 通常只支持单个图像
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    
    const imageBuffer = fs.readFileSync(imagePath);
    formData.append('init_image', imageBuffer, { filename: path.basename(imagePath) });
    
    // 添加蒙版（如果提供）
    if (params.mask) {
      if (!fs.existsSync(params.mask)) {
        throw new Error(`Mask file not found: ${params.mask}`);
      }
      const maskBuffer = fs.readFileSync(params.mask);
      formData.append('mask_image', maskBuffer, { filename: path.basename(params.mask) });
    }
    
    // 添加其他参数
    formData.append('cfg_scale', '7');
    formData.append('samples', (params.n || 1).toString());
    formData.append('steps', '30');

    const response = await fetch(`${this.baseUrl}/generation/${model}/image-to-image`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json() as { message?: string };
      throw new Error(`Stability AI API error: ${errorData.message || response.statusText}`);
    }

    const result = await response.json() as any;
    
    // 转换为标准格式
    return {
      created: Date.now(),
      data: result.artifacts.map((artifact: any) => ({
        b64_json: artifact.base64,
        revised_prompt: params.prompt
      }))
    };
  }

  saveImageToTempFile(
    imageData: string, 
    outputFormat: string = 'png',
    outputPath?: string
  ): string {
    // 移除数据 URL 前缀（如果存在）
    const base64Data = imageData.includes('base64,') ? 
      imageData.split('base64,')[1] : 
      imageData;
    
    const buffer = Buffer.from(base64Data, 'base64');
    
    let filePath: string;
    
    if (outputPath) {
      const parsedPath = path.parse(outputPath);
      
      if (parsedPath.ext) {
        filePath = outputPath;
        const dirPath = parsedPath.dir;
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      } else {
        const uuid = uuidv4();
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }
        filePath = path.join(outputPath, `${uuid}.${outputFormat}`);
      }
    } else {
      const uuid = uuidv4();
      filePath = path.join('/tmp', `${uuid}.${outputFormat}`);
    }
    
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  private extractWidthFromSize(size: string): number {
    if (size.includes('x')) {
      return parseInt(size.split('x')[0]);
    }
    return 1024; // 默认值
  }

  private extractHeightFromSize(size: string): number {
    if (size.includes('x')) {
      return parseInt(size.split('x')[1]);
    }
    return 1024; // 默认值
  }
}