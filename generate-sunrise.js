#!/usr/bin/env node

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

// MCP 请求格式
const mcpRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "text-to-image",
    arguments: {
      text: "A beautiful sunrise over the horizon, warm orange and red colors, dramatic sky with clouds, natural lighting, high quality, photorealistic",
      outputPath: "/tmp/imagegen-output/sunrise.png",
      model: "stability/stable-diffusion-xl-1024-v1-0",
      size: "1024x1024",
      output_format: "png",
      quality: "high"
    }
  }
};

console.log("🌅 正在生成日出图片...");
console.log("提示词:", mcpRequest.params.arguments.text);
console.log("输出路径:", mcpRequest.params.arguments.outputPath);

// 启动 MCP 服务器进程
const mcpProcess = spawn('node', ['dist/index.js', '--providers', 'stability', '--models', 'stable-diffusion-xl-1024-v1-0'], {
  env: {
    ...process.env,
    STABILITY_API_KEY: 'sk-Z698TWbuOSUjzwTpUVx9LYJANQF4gZlIO1uPfelNpnOcgdW4'
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

let responseData = '';

mcpProcess.stdout.on('data', (data) => {
  responseData += data.toString();
  
  // 检查是否收到完整的 JSON 响应
  try {
    const response = JSON.parse(responseData);
    if (response.result) {
      console.log("✅ 图片生成成功！");
      console.log("结果:", response.result);
      mcpProcess.kill();
      process.exit(0);
    }
  } catch (e) {
    // 继续等待更多数据
  }
});

mcpProcess.stderr.on('data', (data) => {
  console.error("错误:", data.toString());
});

mcpProcess.on('close', (code) => {
  console.log(`MCP 进程退出，代码: ${code}`);
});

// 发送请求
mcpProcess.stdin.write(JSON.stringify(mcpRequest) + '\n');

// 设置超时
setTimeout(() => {
  console.log("⏰ 请求超时");
  mcpProcess.kill();
  process.exit(1);
}, 60000); // 60秒超时 