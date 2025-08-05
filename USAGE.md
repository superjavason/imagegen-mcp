# 🎨 多提供商图像生成 MCP 服务器使用指南

## 🚀 快速开始

### 1. 安装和配置

```bash
# 克隆项目
git clone https://github.com/spartanz51/imagegen-mcp.git
cd imagegen-mcp

# 安装依赖
pnpm install

# 配置环境变量
cp env.example .env
# 编辑 .env 文件，添加你的 API 密钥

# 构建项目
pnpm run build
```

### 2. 运行服务器

```bash
# 自动检测可用提供商
node dist/index.js

# 指定特定提供商
node dist/index.js --providers openai stability

# 指定特定模型
node dist/index.js --models dall-e-3 stable-diffusion-xl-1024-v1-0
```

## 🔧 提供商配置

### OpenAI
- **API 密钥**: [OpenAI Platform](https://platform.openai.com/api-keys)
- **支持的模型**: 
  - `dall-e-2`: 经典 DALL-E 模型
  - `dall-e-3`: 最新 DALL-E 模型，支持更高质量生成
  - `gpt-image-1`: GPT 图像模型
- **特色功能**: 高质量图像生成，样式控制，图像编辑

### Stability AI
- **API 密钥**: [Stability AI Platform](https://platform.stability.ai/account/keys)
- **支持的模型**:
  - `stable-diffusion-xl-1024-v1-0`: Stable Diffusion XL
  - `stable-diffusion-v2-1`: Stable Diffusion v2.1
  - `stable-diffusion-v1-6`: Stable Diffusion v1.6
- **特色功能**: 开源模型，高度可定制，支持多种尺寸

### Replicate
- **API 令牌**: [Replicate](https://replicate.com/account/api-tokens)
- **支持的模型**:
  - `FLUX-SCHNELL`: 快速高质量生成
  - `STABLE_DIFFUSION_XL`: SDXL 模型
  - `PLAYGROUND_V2_5`: Playground v2.5
- **特色功能**: 多样化开源模型，实验性功能

### Hugging Face
- **访问令牌**: [Hugging Face](https://huggingface.co/settings/tokens)
- **支持的模型**:
  - `stabilityai/stable-diffusion-xl-base-1.0`
  - `black-forest-labs/FLUX.1-schnell`
  - `playgroundai/playground-v2.5-1024px-aesthetic`
- **特色功能**: 免费层级，社区模型

## 🎯 使用示例

### 基础文本生成图像

```json
{
  "tool": "text-to-image",
  "parameters": {
    "text": "A beautiful mountain landscape at sunset",
    "outputPath": "/tmp/mountain.png",
    "size": "1024x1024"
  }
}
```

### 使用特定提供商和模型

```json
{
  "tool": "text-to-image",
  "parameters": {
    "text": "A futuristic city with flying cars",
    "outputPath": "/tmp/city.png",
    "provider": "openai",
    "model": "dall-e-3",
    "style": "vivid",
    "quality": "hd"
  }
}
```

### 图像编辑

```json
{
  "tool": "image-to-image",
  "parameters": {
    "images": ["/path/to/input.jpg"],
    "prompt": "Add a rainbow in the sky",
    "outputPath": "/tmp/edited.png",
    "provider": "stability"
  }
}
```

## 🔍 模型选择指南

### 选择提供商的考虑因素

| 提供商 | 成本 | 质量 | 速度 | 定制性 |
|--------|------|------|------|--------|
| OpenAI | 较高 | 极高 | 中等 | 中等 |
| Stability AI | 中等 | 高 | 快 | 高 |
| Replicate | 中等 | 高 | 中等 | 极高 |
| Hugging Face | 低/免费 | 中等 | 慢 | 高 |

### 用途推荐

- **艺术创作**: OpenAI DALL-E 3
- **产品设计**: Stability AI SDXL
- **实验创作**: Replicate 各种模型
- **原型开发**: Hugging Face 免费模型

## 🚨 常见问题

### Q: 如何处理 API 密钥错误？
A: 确保在 `.env` 文件中正确设置了相应的环境变量，并且 API 密钥有效。

### Q: 为什么某些模型不支持特定功能？
A: 不同提供商和模型支持的功能不同。例如，图像编辑主要支持 OpenAI 和 Stability AI。

### Q: 如何选择最适合的图像尺寸？
A: 
- DALL-E 2: 256x256, 512x512, 1024x1024
- DALL-E 3: 1024x1024, 1792x1024, 1024x1792
- Stability AI: 支持更多自定义尺寸

### Q: 可以同时使用多个提供商吗？
A: 是的！服务器会根据指定的模型自动选择合适的提供商，或者你可以明确指定。

## 🔧 高级配置

### 自定义提供商设置

```bash
# 只启用特定提供商
node dist/index.js --providers openai stability

# 限制特定模型
node dist/index.js --models dall-e-3 stable-diffusion-xl-1024-v1-0

# 组合配置
node dist/index.js --providers openai --models dall-e-3
```

### 性能优化

1. **并发控制**: 根据 API 限制调整请求频率
2. **缓存策略**: 对相似请求使用缓存
3. **提供商选择**: 根据需求选择最适合的提供商

## 📊 监控和日志

服务器会输出详细的运行信息：

```bash
🎨 Multi-Provider Image Generation MCP Server
Available providers: openai, stability, replicate
📌 Default provider: OpenAI
🎨 Generating image with provider: openai, model: dall-e-3
```

## 🤝 贡献

欢迎贡献新的提供商实现或功能改进！请查看项目的贡献指南。