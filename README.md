# Mermaid 拖拽生成器

纯 vibe coding 生成代码，软件：Codex，模型：GPT-5.4

使用 Node.js 启动静态服务。

---

## 本地部署

依赖：Node.js

* 输入：

```bash
npm start
```

启动后访问 [http://localhost:3000](http://localhost:3000)。

---

## 容器运行

* 拉取：
[参考 https://github.com/steve372a/sanaka-mermaid/pkgs/container/sanaka-mermaid](https://github.com/steve372a/sanaka-mermaid/pkgs/container/sanaka-mermaid)

* 运行：
```bash
docker run --rm -p 3000:3000 sanaka-mermaid:latest
```

---

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
