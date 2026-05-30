#!/bin/bash

# 删除旧的构建文件
echo "正在清理旧的构建文件..."
rm -rf build dist *.spec

# 执行打包命令
echo "开始打包..."
pyinstaller --name local-action-bridge main.py

echo "打包完成！" 
