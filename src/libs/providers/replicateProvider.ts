import Replicate from 'replicate';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { 
  BaseImageProvider, 
  ImageGenerationParams, 
  ImageEditParams, 
  ImageGenerationResponse, 
  ProviderConfig 
} from './base.js';

// Replicate 特定的模型
export const REPLICATE_MODELS = {
  STABLE_DIFFUSION_XL: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
  STABLE_DIFFUSION: 'stability-ai/stable-diffusion:27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478',
  FLUX_SCHNELL: 'black-forest-labs/flux-schnell:bf2f2b6c6d3c4f7b7c5e8c6f4d2f1e6b8a9c0e8f',
  PLAYGROUND_V2_5: 'playgroundai/playground-v2.5-1024px-aesthetic:a45f82a1382bed5c7aeb861dac7c7d191b0fdf74d8d57c4a0e6ed7d4d0bf7d24',
  KANDINSKY_2_2: 'ai-forever/kandinsky-2.2:ad9d7879fbffa2874e1d909d1d37d9bc682889cc65b31f7bb00d2362619f194a'
} as const;

export type ReplicateModel = typeof REPLICATE_MODELS[keyof typeof REPLICATE_MODELS];

export class ReplicateImageProvider extends BaseImageProvider {
  private replicate: Replicate;
  private allowedModels: Record<string, ReplicateModel>;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('Replicate API token is required');
    }
    
    this.replicate = new Replicate({
      auth: config.apiKey,
    });
    
    // 设置允许的模型
    if (config.allowedModels && config.allowedModels.length > 0) {
      this.allowedModels = {};
      config.allowedModels.forEach(modelName => {
        const modelEntry = Object.entries(REPLICATE_MODELS).find(([key, _]) => 
          key.toLowerCase().includes(modelName.toLowerCase()) || modelName === key
        );
        if (modelEntry) {
          const [key, value] = modelEntry;
          this.allowedModels[key] = value;
        } else {
          // 允许直接使用 Replicate 模型字符串
          this.allowedModels[modelName] = modelName as ReplicateModel;
        }
      });
      
      if (Object.keys(this.allowedModels).length === 0) {
        console.warn("No valid Replicate models specified. Using default models.");
        this.allowedModels = { STABLE_DIFFUSION_XL: REPLICATE_MODELS.STABLE_DIFFUSION_XL };
      }
    } else {
      this.allowedModels = { ...REPLICATE_MODELS };
    }
    
    console.log("Available Replicate models:", Object.keys(this.allowedModels));
  }

  getAllowedModels(): Record<string, ReplicateModel> {
    return this.allowedModels;
  }

  getDefaultModel(): ReplicateModel {
    return Object.values(this.allowedModels)[0];
  }

  async generateImages(params: ImageGenerationParams): Promise<ImageGenerationResponse> {
    this.validateParams(params);

    const model = params.model || Object.keys(this.allowedModels)[0];
    
    // 验证模型是否被允许
    const modelVersion = this.allowedModels[model] || model;
    if (!modelVersion) {
      throw new Error(`Model "${model}" is not allowed. Allowed models: ${Object.keys(this.allowedModels).join(', ')}`);
    }

    try {
      // 构建输入参数
      const input: any = {
        prompt: params.prompt,
        num_outputs: params.n || 1,
      };

      // 根据模型调整参数
      if (model.includes('sdxl') || model.includes('STABLE_DIFFUSION_XL')) {
        input.width = this.extractWidthFromSize(params.size || '1024x1024');
        input.height = this.extractHeightFromSize(params.size || '1024x1024');
        input.guidance_scale = 7.5;
        input.num_inference_steps = 20;
      } else if (model.includes('flux')) {
        input.aspect_ratio = this.convertSizeToAspectRatio(params.size || '1024x1024');
        input.num_inference_steps = 4;
      } else {
        input.width = this.extractWidthFromSize(params.size || '512x512');
        input.height = this.extractHeightFromSize(params.size || '512x512');
      }

      // 添加样式参数（如果支持）
      if (params.style && (model.includes('playground') || model.includes('PLAYGROUND'))) {
        input.style = params.style;
      }

      const output = await this.replicate.run(modelVersion as any, { input });
      
      // 处理输出
      const images = Array.isArray(output) ? output : [output];
      const data = [];

      for (const imageUrl of images) {
        if (typeof imageUrl === 'string') {
          // 下载图像并转换为 base64
          const response = await fetch(imageUrl);
          const buffer = await response.buffer();
          const base64 = buffer.toString('base64');
          
          data.push({
            b64_json: base64,
            url: imageUrl,
            revised_prompt: params.prompt
          });
        }
      }

      return {
        created: Date.now(),
        data
      };
    } catch (error) {
      throw new Error(`Replicate API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async editImages(params: ImageEditParams): Promise<ImageGenerationResponse> {
    if (!params.images || params.images.length === 0) {
      throw new Error('At least one image file path is required');
    }
    
    this.validateParams(params);

    const model = params.model || Object.keys(this.allowedModels)[0];
    const modelVersion = this.allowedModels[model] || model;
    
    if (!modelVersion) {
      throw new Error(`Model "${model}" is not allowed. Allowed models: ${Object.keys(this.allowedModels).join(', ')}`);
    }

    try {
      // 读取图像文件
      const imagePath = params.images[0];
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // 对于 Replicate，我们需要上传图像到可访问的 URL 或使用 data URI
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);
      const dataUri = `data:${mimeType};base64,${base64Image}`;

      const input: any = {
        prompt: params.prompt,
        image: dataUri,
        num_outputs: params.n || 1,
      };

      // 添加蒙版（如果提供）
      if (params.mask) {
        if (!fs.existsSync(params.mask)) {
          throw new Error(`Mask file not found: ${params.mask}`);
        }
        const maskBuffer = fs.readFileSync(params.mask);
        const base64Mask = maskBuffer.toString('base64');
        const maskMimeType = this.getMimeType(params.mask);
        input.mask = `data:${maskMimeType};base64,${base64Mask}`;
      }

      // 根据模型调整参数
      if (model.includes('sdxl') || model.includes('inpaint')) {
        input.width = this.extractWidthFromSize(params.size || '1024x1024');
        input.height = this.extractHeightFromSize(params.size || '1024x1024');
        input.guidance_scale = 7.5;
        input.num_inference_steps = 20;
      }

      const output = await this.replicate.run(modelVersion as any, { input });
      
      // 处理输出
      const images = Array.isArray(output) ? output : [output];
      const data = [];

      for (const imageUrl of images) {
        if (typeof imageUrl === 'string') {
          // 下载图像并转换为 base64
          const response = await fetch(imageUrl);
          const buffer = await response.buffer();
          const base64 = buffer.toString('base64');
          
          data.push({
            b64_json: base64,
            url: imageUrl,
            revised_prompt: params.prompt
          });
        }
      }

      return {
        created: Date.now(),
        data
      };
    } catch (error) {
      throw new Error(`Replicate API error: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    return 1024;
  }

  private extractHeightFromSize(size: string): number {
    if (size.includes('x')) {
      return parseInt(size.split('x')[1]);
    }
    return 1024;
  }

  private convertSizeToAspectRatio(size: string): string {
    const width = this.extractWidthFromSize(size);
    const height = this.extractHeightFromSize(size);
    
    if (width === height) return '1:1';
    if (width > height) {
      if (width / height >= 1.7) return '16:9';
      if (width / height >= 1.4) return '3:2';
      return '4:3';
    } else {
      if (height / width >= 1.7) return '9:16';
      if (height / width >= 1.4) return '2:3';
      return '3:4';
    }
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.webp': return 'image/webp';
      case '.gif': return 'image/gif';
      default: return 'image/png';
    }
  }
}