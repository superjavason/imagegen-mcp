# MCP 多提供商图像生成服务器

[![npm version](https://img.shields.io/npm/v/imagegen-mcp)](https://www.npmjs.com/package/imagegen-mcp)

This project provides a server implementation based on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) that supports multiple AI image generation providers including OpenAI, Stability AI, Replicate, and Hugging Face.

## 🎨 Features

### 支持的提供商
*   **OpenAI**: DALL-E 2, DALL-E 3, GPT-Image-1
*   **Stability AI**: Stable Diffusion XL, Stable Diffusion v2.1, Stable Diffusion v1.6
*   **Replicate**: Various open-source models including FLUX, SDXL, Playground v2.5
*   **Hugging Face**: Stable Diffusion models via Inference API

### 核心功能
*   🖼️ `text-to-image` generation across multiple providers
*   ✏️ `image-to-image` editing (where supported)
*   🔧 Unified API interface for all providers
*   ⚙️ Configurable via environment variables and command-line arguments
*   📏 Support for various image sizes, styles, and quality settings
*   💾 Saves generated/edited images to specified paths

Here's an example of generating an image directly in Cursor using the `text-to-image` tool integrated via MCP:

<div align="center">
  <img src="https://raw.githubusercontent.com/spartanz51/imagegen-mcp/refs/heads/main/cursor.gif" alt="Example usage in Cursor" width="600"/>
</div>

## 🚀 Quick Start

You can run the server directly from npm using `npx`:

```bash
# 基础用法（自动检测可用的提供商）
npx multi-provider-imagegen-mcp

# 指定提供商
npx multi-provider-imagegen-mcp --providers openai stability

# 指定模型
npx multi-provider-imagegen-mcp --models dall-e-3 stable-diffusion-xl-1024-v1-0

# 使用短名称
npx mpimg --providers openai stability replicate
```

## 📋 Prerequisites

*   Node.js (v18 or later recommended)  
*   pnpm, npm or yarn
*   At least one provider API key:
    *   **OpenAI API key** from [OpenAI Platform](https://platform.openai.com/api-keys)
    *   **Stability AI API key** from [Stability AI Platform](https://platform.stability.ai/account/keys)
    *   **Replicate API token** from [Replicate](https://replicate.com/account/api-tokens)
    *   **Hugging Face token** from [Hugging Face](https://huggingface.co/settings/tokens)

## 🔧 Integration with Cursor

Integrate this multi-provider server with Cursor to access various image generation models:

1.  **Open Cursor Settings:**
    *   Go to `File > Preferences > Cursor Settings` (or use `Ctrl+,` / `Cmd+,`)
2.  **Navigate to MCP Settings:**
    *   Search for "MCP" and find "Model Context Protocol: Custom Servers"
3.  **Add Custom Server:**
    *   Click "Edit in settings.json" and add configurations:

### 🎯 Example Configurations

#### Multi-Provider Setup (Recommended)
```json
"mcpServers": {
  "multi-image-generator": {
    "command": "npx multi-provider-imagegen-mcp --providers openai stability replicate",
    "env": {
      "OPENAI_API_KEY": "your_openai_key",
      "STABILITY_API_KEY": "your_stability_key",
      "REPLICATE_API_TOKEN": "your_replicate_token"
    }
  }
}
```

#### Single Provider Setup
```json
"mcpServers": {
  "openai-image-generator": {
    "command": "npx mpimg --providers openai --models dall-e-3",
    "env": {
      "OPENAI_API_KEY": "your_openai_api_key"
    }
  }
}
```

#### Advanced Configuration
```json
"mcpServers": {
  "custom-image-generator": {
    "command": "npx multi-provider-imagegen-mcp --providers openai stability --models dall-e-3 stable-diffusion-xl-1024-v1-0",
    "env": {
      "OPENAI_API_KEY": "your_openai_key",
      "STABILITY_API_KEY": "your_stability_key"
    }
  }
}
```

After saving, the multi-provider image generation tools will be available in Cursor's MCP tool selection.

## ⚙️ Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/spartanz51/imagegen-mcp.git
    cd imagegen-mcp
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    # or
    npm install
    # or
    yarn install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the project root:
    ```bash
    cp .env.example .env
    ```
    
    Edit the `.env` file and add your API keys (only add the ones you plan to use):
    ```env
    # OpenAI (for DALL-E models)
    OPENAI_API_KEY=your_openai_api_key_here
    
    # Stability AI (for Stable Diffusion models)
    STABILITY_API_KEY=your_stability_api_key_here
    
    # Replicate (for various open-source models)
    REPLICATE_API_TOKEN=your_replicate_api_token_here
    
    # Hugging Face (for Inference API models)
    HUGGINGFACE_API_KEY=your_huggingface_api_key_here
    ```

## 🔨 Building

To build the TypeScript code into JavaScript:
```bash
pnpm run build
# or
npm run build
# or 
yarn build
```
This will compile the code into the `dist` directory.

## 🚀 Running the Server

### Development Mode
```bash
pnpm run dev
# or
npx tsx src/index.ts [options]
```

### Production Mode
```bash
node dist/index.js [options]
```

### Command Line Options

#### `--providers <provider1> <provider2> ...`
Specify which providers to enable:
```bash
# Enable specific providers
node dist/index.js --providers openai stability

# Enable all available providers (with API keys)
node dist/index.js --providers openai stability replicate huggingface
```

#### `--models <model1> <model2> ...`
Specify which models to allow (applies to all enabled providers):
```bash
# Specific models
node dist/index.js --models dall-e-3 stable-diffusion-xl-1024-v1-0

# Combined with providers
node dist/index.js --providers openai stability --models dall-e-3
```

#### Auto-Detection
If no options are provided, the server automatically detects available providers based on environment variables:
```bash
node dist/index.js
```

The server will start and listen for MCP requests via standard input/output (`StdioServerTransport`).

## 🛠️ MCP Tools

The server exposes the following unified MCP tools that work across all providers:

### `text-to-image`

Generates an image based on a text prompt using any supported provider.

**Parameters:**

*   `text` (string, required): The prompt to generate an image from
*   `outputPath` (string, required): Absolute path where the output file should be saved
*   `model` (enum, optional): The model to use (format: `provider/model` or `model`). Auto-detects provider if not specified
*   `provider` (enum, optional): The provider to use (`openai`, `stability`, `replicate`, `huggingface`). Auto-detected from model if not specified
*   `size` (enum, optional): Size of the generated image (e.g., `1024x1024`, `1792x1024`). Defaults to `1024x1024`
*   `style` (enum, optional): Style of the image (`vivid` or `natural`). Supported by certain models like DALL-E 3
*   `output_format` (enum, optional): Format (`png`, `jpeg`, `webp`). Defaults to `png`
*   `output_compression` (number, optional): Compression level (0-100). Defaults to 100
*   `moderation` (enum, optional): Moderation level (`low`, `auto`). Defaults to `low` (OpenAI specific)
*   `background` (enum, optional): Background (`transparent`, `opaque`, `auto`). Defaults to `auto`
*   `quality` (enum, optional): Quality (`standard`, `auto`, `high`, `medium`, `low`). Defaults to `auto`
*   `n` (number, optional): Number of images to generate. Defaults to 1

**Example Usage:**
```json
{
  "text": "A beautiful landscape with mountains and a lake",
  "outputPath": "/tmp/landscape.png",
  "model": "openai/dall-e-3",
  "size": "1024x1024",
  "style": "vivid"
}
```

### `image-to-image`

Edits an existing image based on a text prompt and optional mask.

**Parameters:**

*   `images` (array, required): An array of file paths to local images
*   `prompt` (string, required): A text description of the desired edits
*   `outputPath` (string, required): Absolute path where the output file should be saved
*   `mask` (string, optional): File path of mask image (PNG). Transparent areas indicate where the image should be edited
*   `model` (enum, optional): The model to use (format: `provider/model` or `model`). Auto-detects provider
*   `provider` (enum, optional): The provider to use. Auto-detected from model if not specified
*   `size` (enum, optional): Size of the generated image. Defaults to `1024x1024`
*   `output_format` (enum, optional): Format (`png`, `jpeg`, `webp`). Defaults to `png`
*   `output_compression` (number, optional): Compression level (0-100). Defaults to 100
*   `quality` (enum, optional): Quality settings. Defaults to `auto`
*   `n` (number, optional): Number of images to generate. Defaults to 1

**Provider Support:**
*   **OpenAI**: Supports DALL-E 2 and GPT-Image-1 for editing
*   **Stability AI**: Supports image-to-image with Stable Diffusion models
*   **Replicate**: Supports various image editing models
*   **Hugging Face**: Limited support (falls back to text-to-image for some models)

**Returns:**

Both tools return:
*   `content`: An array containing a `text` object with the path to the saved image file

## Development

*   **Linting:** `npm run lint` or `yarn lint`
*   **Formatting:** `npm run format` or `yarn format` (if configured in `package.json`)

## Contributing

Pull Requests (PRs) are welcome! Please feel free to submit improvements or bug fixes. 