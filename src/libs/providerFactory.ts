import dotenv from 'dotenv';
import { 
  BaseImageProvider, 
  ProviderType, 
  ProviderConfig, 
  PROVIDER_CONFIGS 
} from './providers/base.js';
import { OpenAIImageProvider } from './providers/openaiProvider.js';
import { StabilityImageProvider } from './providers/stabilityProvider.js';
import { ReplicateImageProvider } from './providers/replicateProvider.js';
import { HuggingFaceImageProvider } from './providers/huggingfaceProvider.js';

dotenv.config();

export interface MultiProviderConfig {
  providers: ProviderType[];
  defaultProvider?: ProviderType;
  providerSettings?: {
    [K in ProviderType]?: {
      allowedModels?: string[];
      [key: string]: any;
    };
  };
}

export class ImageProviderFactory {
  private providers: Map<ProviderType, BaseImageProvider> = new Map();
  private defaultProvider: ProviderType;
  private config: MultiProviderConfig;

  constructor(config: MultiProviderConfig) {
    this.config = config;
    this.defaultProvider = config.defaultProvider || config.providers[0];
    this.initializeProviders();
  }

  private initializeProviders(): void {
    for (const providerType of this.config.providers) {
      try {
        const provider = this.createProvider(providerType);
        this.providers.set(providerType, provider);
        console.log(`✅ Initialized ${PROVIDER_CONFIGS[providerType].name} provider`);
      } catch (error) {
        console.warn(`⚠️ Failed to initialize ${PROVIDER_CONFIGS[providerType].name} provider: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No providers were successfully initialized. Please check your configuration and API keys.');
    }

    // 如果默认提供商没有初始化成功，选择第一个可用的
    if (!this.providers.has(this.defaultProvider)) {
      const firstProvider = this.providers.keys().next().value;
      if (firstProvider) {
        this.defaultProvider = firstProvider;
        console.log(`Default provider switched to: ${PROVIDER_CONFIGS[this.defaultProvider].name}`);
      } else {
        throw new Error('No providers were successfully initialized');
      }
    }

    console.log(`🚀 Image provider factory initialized with ${this.providers.size} provider(s)`);
    console.log(`📌 Default provider: ${PROVIDER_CONFIGS[this.defaultProvider].name}`);
  }

  private createProvider(providerType: ProviderType): BaseImageProvider {
    const providerConfig = PROVIDER_CONFIGS[providerType];
    const apiKey = process.env[providerConfig.envKey];

    if (!apiKey) {
      throw new Error(`${providerConfig.envKey} environment variable is required for ${providerConfig.name}`);
    }

    const config: ProviderConfig = {
      apiKey,
      allowedModels: this.config.providerSettings?.[providerType]?.allowedModels,
      ...this.config.providerSettings?.[providerType]
    };

    switch (providerType) {
      case ProviderType.OPENAI:
        return new OpenAIImageProvider(config);
      case ProviderType.STABILITY:
        return new StabilityImageProvider(config);
      case ProviderType.REPLICATE:
        return new ReplicateImageProvider(config);
      case ProviderType.HUGGINGFACE:
        return new HuggingFaceImageProvider(config);
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
  }

  getProvider(providerType?: ProviderType): BaseImageProvider {
    const targetProvider = providerType || this.defaultProvider;
    const provider = this.providers.get(targetProvider);
    
    if (!provider) {
      throw new Error(`Provider ${targetProvider} is not available. Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
    }
    
    return provider;
  }

  getDefaultProvider(): BaseImageProvider {
    return this.getProvider(this.defaultProvider);
  }

  getAvailableProviders(): ProviderType[] {
    return Array.from(this.providers.keys());
  }

  getAllProviderModels(): Record<string, Record<string, string>> {
    const allModels: Record<string, Record<string, string>> = {};
    
    for (const [providerType, provider] of this.providers) {
      const models = provider.getAllowedModels();
      const prefixedModels: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(models)) {
        // 添加提供商前缀以避免模型名称冲突
        prefixedModels[`${providerType}/${key}`] = value;
      }
      
      allModels[providerType] = prefixedModels;
    }
    
    return allModels;
  }

  getProviderFromModel(modelId: string): { provider: BaseImageProvider; model: string } {
    // 检查是否是带提供商前缀的模型
    if (modelId.includes('/')) {
      const [providerName, modelName] = modelId.split('/', 2);
      const providerType = providerName as ProviderType;
      
      if (this.providers.has(providerType)) {
        const provider = this.providers.get(providerType)!;
        const availableModels = provider.getAllowedModels();
        
        // 检查模型是否存在
        if (availableModels[modelName] || Object.values(availableModels).includes(modelName)) {
          return { 
            provider, 
            model: availableModels[modelName] || modelName 
          };
        }
      }
    }

    // 如果没有前缀，在所有提供商中查找
    for (const [providerType, provider] of this.providers) {
      const models = provider.getAllowedModels();
      if (Object.values(models).includes(modelId) || Object.keys(models).includes(modelId)) {
        return { 
          provider, 
          model: models[modelId] || modelId 
        };
      }
    }

    // 如果找不到，使用默认提供商
    return { 
      provider: this.getDefaultProvider(), 
      model: modelId 
    };
  }

  static createFromConfig(config?: Partial<MultiProviderConfig>): ImageProviderFactory {
    // 默认配置
    const defaultConfig: MultiProviderConfig = {
      providers: [ProviderType.OPENAI], // 默认只启用 OpenAI
      defaultProvider: ProviderType.OPENAI
    };

    // 从环境变量检测可用的提供商
    const availableProviders: ProviderType[] = [];
    
    for (const [providerType, providerConfig] of Object.entries(PROVIDER_CONFIGS)) {
      if (process.env[providerConfig.envKey]) {
        availableProviders.push(providerType as ProviderType);
      }
    }

    if (availableProviders.length > 0) {
      defaultConfig.providers = availableProviders;
      defaultConfig.defaultProvider = availableProviders[0];
    }

    const finalConfig = { ...defaultConfig, ...config };
    
    return new ImageProviderFactory(finalConfig);
  }

  // 获取提供商统计信息
  getProviderStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [providerType, provider] of this.providers) {
      const models = provider.getAllowedModels();
      stats[providerType] = {
        name: PROVIDER_CONFIGS[providerType].name,
        description: PROVIDER_CONFIGS[providerType].description,
        modelCount: Object.keys(models).length,
        models: Object.keys(models),
        supportedFeatures: PROVIDER_CONFIGS[providerType].supportedFeatures,
        isDefault: providerType === this.defaultProvider
      };
    }
    
    return stats;
  }
}