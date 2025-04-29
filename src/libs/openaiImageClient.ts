import fetch from 'node-fetch';

// Constants for use in Zod schemas and other runtime contexts
export const MODELS = {
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
  HD: 'hd',
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

export type ImageModel = typeof MODELS[keyof typeof MODELS];
export type ImageSize = typeof SIZES[keyof typeof SIZES];
export type ImageResponseFormat = typeof RESPONSE_FORMATS[keyof typeof RESPONSE_FORMATS];
export type ImageStyle = typeof STYLES[keyof typeof STYLES];
export type ImageQuality = typeof QUALITIES[keyof typeof QUALITIES];
export type ImageBackground = typeof BACKGROUNDS[keyof typeof BACKGROUNDS];
export type ImageOutputFormat = typeof OUTPUT_FORMATS[keyof typeof OUTPUT_FORMATS];
export type ImageModeration = typeof MODERATION_LEVELS[keyof typeof MODERATION_LEVELS];

export interface ImageGenerationRequest {
  prompt: string;
  model?: ImageModel;
  n?: number;
  size?: ImageSize;
  response_format?: ImageResponseFormat;
  style?: ImageStyle;
  quality?: ImageQuality;
  user?: string;
  background?: ImageBackground;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  moderation?: ImageModeration;
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

export class OpenAIImageClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1/images/generations';
  private allowedModels: Record<string, ImageModel>;

  constructor(apiKey: string, allowedModels?: string[]) {
    this.apiKey = apiKey;
    
    // If specific models are provided, filter the allowed models
    if (allowedModels && allowedModels.length > 0) {
      this.allowedModels = {};
      allowedModels.forEach(modelName => {
        const modelEntry = Object.entries(MODELS).find(([_, value]) => value === modelName);
        if (modelEntry) {
          const [key, value] = modelEntry;
          this.allowedModels[key] = value;
        } else {
          console.warn(`Warning: Unknown model "${modelName}" specified. Ignoring.`);
        }
      });
      
      // If no valid models were specified, use all models
      if (Object.keys(this.allowedModels).length === 0) {
        console.warn("No valid models specified. Using all available models.");
        this.allowedModels = { ...MODELS };
      }
    } else {
      // If no models are specified, use all available models
      this.allowedModels = { ...MODELS };
    }
    
    console.log("Available models:", Object.values(this.allowedModels));
  }
  
  /**
   * Get the allowed models for this client instance
   * @returns Record of allowed models
   */
  getAllowedModels(): Record<string, ImageModel> {
    return this.allowedModels;
  }
  
  /**
   * Get the default model (first in the allowed models list)
   * @returns The default model to use
   */
  getDefaultModel(): ImageModel {
    return Object.values(this.allowedModels)[0];
  }

  /**
   * Generate images using OpenAI's image generation API
   * @param params The parameters for image generation
   * @returns A promise that resolves to the generated images
   */
  async generateImages(params: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    if (!params.prompt) {
      throw new Error('Prompt is required');
    }

    // Set default values for parameters that aren't specified
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

    // Apply defaults for any missing parameters
    params = { ...defaults, ...params };
    
    // Validate that the specified model is allowed
    if (params.model) {
      const isModelAllowed = Object.values(this.allowedModels).includes(params.model);
      if (!isModelAllowed) {
        throw new Error(`Model "${params.model}" is not allowed. Allowed models: ${Object.values(this.allowedModels).join(', ')}`);
      }
    }

    // Model-specific validation
    if (params.model === MODELS.DALLE3 && params.n && params.n > 1) {
      throw new Error('dall-e-3 model only supports n=1');
    }
    
    // Remove style parameter for models other than dall-e-3
    if (params.model !== MODELS.DALLE3) {
      params.style = undefined;
    }

    // Size validation based on model
    if (params.model === MODELS.DALLE2 && params.size && 
        params.size !== '256x256' && params.size !== '512x512' && params.size !== '1024x1024') {
      throw new Error('dall-e-2 only supports sizes 256x256, 512x512, or 1024x1024');
    }

    if (params.model === MODELS.DALLE3 && params.size && 
        params.size !== '1024x1024' && params.size !== '1792x1024' && params.size !== '1024x1792') {
      throw new Error('dall-e-3 only supports sizes 1024x1024, 1792x1024, or 1024x1792');
    }

    // Handle transparency requirements
    if (params.background === BACKGROUNDS.TRANSPARENT && 
        params.output_format && 
        params.output_format !== 'png' && params.output_format !== 'webp') {
      throw new Error('When background is transparent, output_format must be png or webp');
    }

    const requestParams = {...params};
    if (params.model !== MODELS.DALLE2 && params.model !== MODELS.DALLE3) {
      // gpt-image-1 always returns base64-encoded images and doesn't support response_format
      requestParams.response_format = undefined;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestParams)
    });

    if (!response.ok) {
      const errorData = await response.json() as { error: { message: string } };
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    return response.json() as Promise<ImageGenerationResponse>;
  }
}

/**
 * Example usage:
 * 
 * const client = new OpenAIImageClient('your-api-key');
 * const images = await client.generateImages({
 *   prompt: 'A cute baby sea otter',
 *   n: 1,
 *   size: SIZES.S1024
 * });
 */ 