import { InferenceClient } from '@huggingface/inference';
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

// HuggingFace 特定的模型
export const HUGGINGFACE_MODELS = {
  STABLE_DIFFUSION_XL: 'stabilityai/stable-diffusion-xl-base-1.0',
  STABLE_DIFFUSION_2_1: 'stabilityai/stable-diffusion-2-1',
  DALLE_MINI: 'dalle-mini/dalle-mini',
  FLUX_SCHNELL: 'black-forest-labs/FLUX.1-schnell',
  STABLE_DIFFUSION_3: 'stabilityai/stable-diffusion-3-medium-diffusers',
  PLAYGROUND_V2_5: 'playgroundai/playground-v2.5-1024px-aesthetic'
} as const;

export type HuggingFaceModel = typeof HUGGINGFACE_MODELS[keyof typeof HUGGINGFACE_MODELS];

export class HuggingFaceImageProvider extends BaseImageProvider {
  private client: InferenceClient;
  private allowedModels: Record<string, HuggingFaceModel>;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('Hugging Face API token is required');
    }
    
    this.client = new InferenceClient(config.apiKey);
    
    // 设置允许的模型
    if (config.allowedModels && config.allowedModels.length > 0) {
      this.allowedModels = {};
      config.allowedModels.forEach(modelName => {
        const modelEntry = Object.entries(HUGGINGFACE_MODELS).find(([_, value]) => 
          value === modelName || value.includes(modelName)
        );
        if (modelEntry) {
          const [key, value] = modelEntry;
          this.allowedModels[key] = value;
        } else {
          // 允许直接使用 HuggingFace 模型字符串
          this.allowedModels[modelName] = modelName as HuggingFaceModel;
        }
      });
      
      if (Object.keys(this.allowedModels).length === 0) {
        console.warn("No valid HuggingFace models specified. Using default models.");
        this.allowedModels = { STABLE_DIFFUSION_XL: HUGGINGFACE_MODELS.STABLE_DIFFUSION_XL };
      }
    } else {
      this.allowedModels = { ...HUGGINGFACE_MODELS };
    }
    
            console.error("Available HuggingFace models:", Object.keys(this.allowedModels));
  }

  getAllowedModels(): Record<string, HuggingFaceModel> {
    return this.allowedModels;
  }

  getDefaultModel(): HuggingFaceModel {
    return Object.values(this.allowedModels)[0];
  }

  async generateImages(params: ImageGenerationParams): Promise<ImageGenerationResponse> {
    this.validateParams(params);

    const model = params.model || Object.keys(this.allowedModels)[0];
    
    // 验证模型是否被允许
    const modelName = this.allowedModels[model] || model;
    if (!modelName) {
      throw new Error(`Model "${model}" is not allowed. Allowed models: ${Object.keys(this.allowedModels).join(', ')}`);
    }

    try {
      // 生成图像
      const blob = await this.client.textToImage({
        model: modelName,
        inputs: params.prompt,
        parameters: {
          num_inference_steps: 20,
          guidance_scale: 7.5,
          ...(params.size && this.supportsCustomSize(modelName) && {
            width: this.extractWidthFromSize(params.size),
            height: this.extractHeightFromSize(params.size)
          }),
          ...(params.style && this.supportsStyle(modelName) && {
            style: params.style
          })
        }
      });
      
      // 将 Blob 转换为 Buffer
      const arrayBuffer = await (blob as any).arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      // 生成多个图像（如果请求）
      const images = [];
      const numImages = params.n || 1;
      
      for (let i = 0; i < numImages; i++) {
        if (i === 0) {
          // 第一个图像已经生成
          images.push({
            b64_json: base64,
            revised_prompt: params.prompt
          });
        } else {
          // 为额外的图像重新调用 API
          const additionalBlob = await this.client.textToImage({
            model: modelName,
            inputs: params.prompt,
            parameters: {
              num_inference_steps: 20,
              guidance_scale: 7.5,
            }
          });
          const additionalArrayBuffer = await (additionalBlob as any).arrayBuffer();
          const additionalBuffer = Buffer.from(additionalArrayBuffer);
          const additionalBase64 = additionalBuffer.toString('base64');
          
          images.push({
            b64_json: additionalBase64,
            revised_prompt: params.prompt
          });
        }
      }

      return {
        created: Date.now(),
        data: images
      };
    } catch (error) {
      throw new Error(`HuggingFace API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async editImages(params: ImageEditParams): Promise<ImageGenerationResponse> {
    // HuggingFace Inference API 对图像编辑的支持有限
    // 这里实现一个基础的图像到图像转换
    if (!params.images || params.images.length === 0) {
      throw new Error('At least one image file path is required');
    }
    
    this.validateParams(params);

    const model = params.model || Object.keys(this.allowedModels)[0];
    const modelName = this.allowedModels[model] || model;
    
    if (!modelName) {
      throw new Error(`Model "${model}" is not allowed. Allowed models: ${Object.keys(this.allowedModels).join(', ')}`);
    }

    try {
      // 读取输入图像
      const imagePath = params.images[0];
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const imageBlob = new Blob([imageBuffer]);

      // 使用图像到图像的功能（如果模型支持）
      const options: any = {
        model: modelName,
        parameters: {
          prompt: params.prompt,
          num_inference_steps: 20,
          guidance_scale: 7.5,
          strength: 0.8, // 控制原图像的保留程度
        }
      };

      // 尝试使用 image-to-image 功能
      let resultBlob: any;
      try {
        resultBlob = await this.client.imageToImage({
          model: modelName,
          inputs: imageBlob,
          parameters: {
            prompt: params.prompt,
            num_inference_steps: 20,
            guidance_scale: 7.5,
            strength: 0.8,
          }
        });
      } catch (imageToImageError) {
        // 如果 image-to-image 不支持，回退到 text-to-image
        console.warn('Image-to-image not supported, falling back to text-to-image');
        resultBlob = await this.client.textToImage({
          model: modelName,
          inputs: `${params.prompt}, based on the provided image`,
          parameters: {
            num_inference_steps: 20,
            guidance_scale: 7.5,
          }
        });
      }

      // 将 Blob 转换为 base64
      const arrayBuffer = await (resultBlob as any).arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      return {
        created: Date.now(),
        data: [{
          b64_json: base64,
          revised_prompt: params.prompt
        }]
      };
    } catch (error) {
      throw new Error(`HuggingFace API error: ${error instanceof Error ? error.message : String(error)}`);
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

  private supportsCustomSize(modelName: string): boolean {
    // 检查模型是否支持自定义尺寸
    const supportedModels = [
      'stabilityai/stable-diffusion-xl-base-1.0',
      'stabilityai/stable-diffusion-2-1',
      'black-forest-labs/FLUX.1-schnell'
    ];
    return supportedModels.some(model => modelName.includes(model));
  }

  private supportsStyle(modelName: string): boolean {
    // 检查模型是否支持样式参数
    const supportedModels = [
      'playgroundai/playground-v2.5-1024px-aesthetic'
    ];
    return supportedModels.some(model => modelName.includes(model));
  }
}