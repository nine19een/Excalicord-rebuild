# CanvasCast

CanvasCast is a browser-based whiteboard recording app built with React, TypeScript and Vite.

It is inspired by modern screen recording tools and digital whiteboard tools, focusing on a smooth workflow for drawing, presenting, recording and exporting whiteboard-style content directly in the browser.

## Demo

Online Demo: https://canvascast.nine19een.com  

Demo Video: Coming soon

## Overview

CanvasCast brings together an infinite whiteboard, slide-based presentation flow, recording settings, frame backgrounds, camera overlay, microphone selection and a teleprompter into one browser-based workspace.

It is designed for technical explanations, teaching videos, visual notes, product walkthroughs and whiteboard-style presentation recordings.

## Features

- Infinite whiteboard workspace
- Slide-based recording workflow
- Freehand pen with smoother SVG path rendering
- Object-level eraser
- Rectangle / ellipse / arrow / straight line tools
- Text insertion
- Image insertion
- Object selection, movement, scaling and rotation
- Multi-selection transform
- Slide thumbnails
- Slide duplication, deletion, renaming and drag sorting
- Frame background picker with built-in background presets
- Random background selection
- Canvas ratio presets: 16:9, 4:3, 3:4, 9:16, 1:1
- Canvas color settings
- Canvas pattern settings
- Camera overlay
- Independent microphone device selection
- Teleprompter with adjustable speed and opacity
- Browser-based recording output

## Screenshots

### Main Interface

![CanvasCast main interface](docs/images/1.png)

### Multi-slide Workflow

![CanvasCast workflow](docs/images/2.png)

### Recording Settings

![CanvasCast recording settings](docs/images/3.png)

### Recording Output

![CanvasCast recording output](docs/images/4.png)

## Tech Stack

- React
- TypeScript
- Vite
- SVG-based whiteboard rendering
- MediaRecorder API
- CSS responsive layout

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

## Type Check

```bash
npx tsc --noEmit -p tsconfig.app.json --pretty false
```

## Build

```bash
npm run build
```

## Project Highlights

### SVG-based whiteboard object system

CanvasCast stores whiteboard content as editable objects and renders them with SVG. This keeps elements selectable and transformable instead of flattening the board into static pixels.

### Slide-based recording workflow

The app supports multiple slides, slide thumbnails, slide ordering and a recording frame workflow, making it easier to structure whiteboard content as a presentation.

### Recording frame and background system

The recording preview and browser recording output are designed to stay visually aligned. CanvasCast supports canvas ratios, frame backgrounds, canvas colors and canvas patterns as part of the recording setup.

### Camera and microphone support

Camera overlay and microphone input are controlled separately. Users can record with a camera overlay, record audio only, or disable microphone input when needed.

### Teleprompter

CanvasCast includes a floating teleprompter with playback controls, adjustable scrolling speed and opacity settings for smoother recording sessions.

## Current Status

CanvasCast is currently in the MVP stage.

Core whiteboard editing, slide workflow, recording settings, frame backgrounds, camera overlay, teleprompter and browser-based recording have been implemented.

## Roadmap

- More export options
- More advanced image editing
- Better pressure-like pen rendering
- More transition effects
- Performance optimization for larger whiteboards
- Better mobile and tablet support

## Notes

CanvasCast is a personal learning and portfolio project focused on product interaction, browser media APIs and whiteboard editing workflows.

# CanvasCast 中文说明

## 演示

在线体验：https://canvascast.nine19een.com  
演示视频：Coming soon

## 项目简介

CanvasCast 是一个基于 React、TypeScript 和 Vite 构建的浏览器端白板录制工具。

项目灵感来自现代录屏软件和数字白板工具，重点围绕白板绘制、幻灯片式演示、录制设置、背景装饰、摄像头小窗、麦克风选择与提词器等功能，形成一套可以直接在浏览器中完成白板内容创作与录制导出的工作流。

它适合算法讲解、课程演示、技术说明、可视化笔记、作品集 demo 等场景。

## 功能特性

- 无限白板工作区
- 基于幻灯片的录制工作流
- 平滑自由画笔
- 对象级橡皮
- 矩形、圆形、箭头、直线、文本、图片
- 对象选择、移动、缩放、旋转、多选变换
- 幻灯片缩略图、复制、删除、重命名、拖拽排序
- 内置背景图与随机背景
- 多种画布比例：16:9、4:3、3:4、9:16、1:1
- 画布颜色与样式设置
- 摄像头小窗
- 独立麦克风选择
- 提词器
- 浏览器端录制导出

## 技术栈

- React
- TypeScript
- Vite
- SVG 白板渲染
- MediaRecorder API
- CSS 响应式布局

## 截图

截图见上方英文部分的 Screenshots。

## 本地运行

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

类型检查：

```bash
npx tsc --noEmit -p tsconfig.app.json --pretty false
```

构建：

```bash
npm run build
```

## 项目亮点

### SVG 对象化白板渲染

白板内容以可编辑对象数组进行管理，并通过 SVG 渲染。相比静态像素画布，这种方式更适合对象选择、移动、缩放、旋转和后续编辑。

### 多幻灯片录制工作流

CanvasCast 支持多张幻灯片、缩略图、复制、删除、重命名和拖拽排序，便于把白板内容组织成适合录制的演示结构。

### 预览与录制输出一致性

录制设置中的画布比例、背景图、画布颜色、画布样式、圆角和边距会尽量与最终浏览器录制输出保持一致。

### 摄像头与麦克风独立控制

摄像头小窗和麦克风设备选择相互独立。用户可以显示摄像头录制，也可以关闭摄像头但保留麦克风声音。

### 提词器辅助录制

内置提词器支持播放控制、滚动速度和透明度调整，适合需要脚本辅助的讲解和演示录制。

## 当前状态

CanvasCast 目前处于 MVP 阶段。核心白板编辑、幻灯片工作流、录制设置、背景图、摄像头小窗、麦克风选择、提词器和浏览器端录制功能已经完成。

后续会继续优化导出能力、移动端适配、性能表现和更多录制体验。

## 后续计划

- 更多导出选项
- 更高级的图片编辑能力
- 更接近压感效果的画笔渲染
- 更多切换和演示效果
- 大型白板下的性能优化
- 更好的移动端和平板支持