#!/bin/bash

# 多提供商图像生成 MCP 服务器发布脚本

echo "🚀 开始发布 multi-provider-imagegen-mcp..."

# 检查是否已登录npm
echo "📋 检查 npm 登录状态..."
if ! npm whoami &> /dev/null; then
    echo "❌ 未登录 npm，请先运行: npm login"
    exit 1
fi

echo "✅ npm 登录状态正常 ($(npm whoami))"

# 检查构建
echo "🔨 构建项目..."
if ! pnpm run build; then
    echo "❌ 构建失败"
    exit 1
fi

echo "✅ 构建成功"

# 检查包名是否可用
echo "🔍 检查包名是否可用..."
if npm view multi-provider-imagegen-mcp &> /dev/null; then
    echo "⚠️  包名已存在，将发布新版本"
else
    echo "✅ 包名可用"
fi

# 显示即将发布的信息
echo "📦 即将发布的包信息:"
echo "  包名: multi-provider-imagegen-mcp"
echo "  版本: $(node -p "require('./package.json').version")"
echo "  作者: $(node -p "require('./package.json').author")"

# 询问确认
read -p "🤔 确认发布吗? (y/N): " confirm
if [[ $confirm != [yY] ]]; then
    echo "❌ 取消发布"
    exit 0
fi

# 先进行干运行检查
echo "🧪 进行发布预检查..."
if ! npm publish --dry-run; then
    echo "❌ 发布预检查失败"
    exit 1
fi

echo "✅ 发布预检查通过"

# 正式发布
echo "🚀 正在发布..."
if npm publish; then
    echo "🎉 发布成功!"
    echo ""
    echo "📝 发布后验证:"
    echo "  npx multi-provider-imagegen-mcp --help"
    echo "  npx mpimg --help"
    echo ""
    echo "📖 使用文档:"
    echo "  https://github.com/superjavason/imagegen-mcp"
else
    echo "❌ 发布失败"
    exit 1
fi