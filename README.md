# Mermaid 拖拽生成器

使用 Node.js 启动静态服务。

## 启动

```bash
npm start
```

启动后访问 [http://localhost:3000](http://localhost:3000)。

## 容器运行

构建镜像：

```bash
docker build -t mermaid-dnd-builder .
```

或：

```bash
podman build -t mermaid-dnd-builder .
```

运行容器：

```bash
docker run --rm -p 3000:3000 mermaid-dnd-builder
```

或：

```bash
podman run --rm -p 3000:3000 mermaid-dnd-builder
```

然后访问 [http://localhost:3000](http://localhost:3000)。

## 发布镜像

仓库里已包含 GitHub Actions 工作流 [release.yml](/Users/steve372dzudo/hexo/vibecoding/.github/workflows/release.yml)。

发布方式：

```bash
git tag v1.0.0
git push origin v1.0.0
```

触发后会自动：

- 创建 GitHub Release
- 构建多架构镜像
- 推送到 `ghcr.io/<owner>/<repo>:v1.0.0`
- 同时更新 `ghcr.io/<owner>/<repo>:latest`

拉取示例：

```bash
docker pull ghcr.io/<owner>/<repo>:latest
```

或：

```bash
podman pull ghcr.io/<owner>/<repo>:latest
```

## 功能

- 从左侧拖拽节点到画布
- 拖动节点重新排布
- 从节点右侧连接点拖到另一个节点左侧连接点，创建连线
- 右侧实时生成 Mermaid `flowchart TD` 代码
- 支持直接修改 Mermaid 代码，并应用回画布
- 实时 Mermaid 预览
- 支持导出 SVG / PNG
- 导入 / 导出 JSON

## 说明

- 当前主要支持 Mermaid `flowchart`。
- 代码回写画布目前支持本工具这套 `flowchart` 子集：
  - `flowchart TD/BT/LR/RL`
  - 矩形、圆角、判断、圆形、子流程节点
  - `-->` 连线和 `|标签|` 连线标签
# sanaka-mermaid
