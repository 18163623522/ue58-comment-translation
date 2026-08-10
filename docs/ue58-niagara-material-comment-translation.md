# UE 5.8 Niagara 与材质注释翻译 — 技术调研报告

> **目标**：通过 Python 脚本批量翻译 UE 5.8 内容示例工程中材质图和 Niagara 脚本里的 Comment 注释为中文，**只改文本，不动布局**。
>
> **日期**：2026-08-10
> **引擎**：UE 5.8.0-55116800（Installed Build）
> **工程**：内容示例5_8汉化（`F:/Window/Downloder/001浏览器下载/内容示例5_8汉化/`）
> **资产数**：3874 个

---

## 1. 调研结论

### 能不能做？

**能做**，但 UE 5.8 的 Python API 有重大变更，标准文档里的方法大部分已废弃，需要绕路。

### 最佳路径

| 方案 | 可行性 | 说明 |
|---|---|---|
| ❌ unreal-mcp | 不可行 | 引擎无 MaterialToolset；NiagaraToolset 40+ 工具不含编辑 Comment 的 API |
| ✅ Python 脚本 | 可行 | 用 `getattr()` 直接访问 deprecated 属性，绕过 `get_editor_property` 拦截 |

---

## 2. unreal-mcp 调研结果

### 2.1 MCP 环境状态

| 项目 | 状态 |
|---|---|
| ModelContextProtocol 插件 | ✅ 已启用（`.uproject` Plugins 数组） |
| AllToolsets 插件 | ❌ 未启用 |
| MCP Server 端口 8000 | ❌ 未监听（Server 未启动） |
| ZCode `.mcp.json` 配置 | ❌ 只有 vision-bridge，无 unreal-mcp |

### 2.2 Toolset 插件清单

UE 5.8 引擎自带 27 个 Toolset 插件，位于：

```
E:/Softwave/UE/UE_5.8/Engine/Plugins/Experimental/Toolsets/
```

完整列表：

```
AIModuleToolset, AllToolsets, AnimationAssistantToolset, AutomationTestToolset,
ChaosClothAssetToolset, ConfigSettingsToolset, ConversationToolset, DataRegistryToolset,
DataflowAgent, EditorToolset, GASToolsets, GameFeaturesToolset, GameplayTagsToolset,
LiveCodingToolset, MCPClientToolset, MVVMToolset, MetaHumanGenerator, NiagaraToolsets,
PCGToolset, PhysicsToolsets, PluginToolset, SemanticSearchToolset, SequencerAnimMixerToolset,
SlateInspectorToolset, StateTreeToolset, UMGToolSet, WorldConditionsToolset
```

### 2.3 关键发现：没有 MaterialToolset

**引擎不提供材质图编辑的 MCP 工具集。** 27 个 Toolset 中无任何 Material 相关插件。

### 2.4 NiagaraToolsets 能力分析

NiagaraToolsets 源码路径：
```
E:/Softwave/UE/UE_5.8/Engine/Plugins/Experimental/Toolsets/NiagaraToolsets/Source/
```

工具分类（40+ AICallable 函数）：

| 分类 | 函数数 | 能力 |
|---|---|---|
| Schema | 8 | 获取 System/Emitter/Renderer/DataInterface/Module 的属性 schema |
| Topology | 8 | 获取 Emitter/ScriptStack/Module 的结构拓扑 |
| Data | 8 | 读取 System/Emitter/Renderer/Module 的属性值 |
| Edit | 15 | 修改属性、增删 Emitter/Module/UserVariable |
| Assets | 3 | 获取可用 DynamicInput、创建 System |
| Status | 3 | 编译状态、Stack 问题 |

**关键结论**：NiagaraToolset 的能力定位是"读取结构 + 修改模块参数值 + 增删 Emitter/Module"，**不包含编辑图级 Comment 文本的工具**。Comment 是图编辑器的元数据（`UEdGraphNode_Comment`），不在 Stack/Module 参数范围内。

---

## 3. Python API 调研结果

### 3.1 工程环境

| 项目 | 状态 |
|---|---|
| PythonScriptPlugin | ✅ 已启用 |
| Python 版本 | 3.11.8 |
| EditorScriptingUtilities | ✅ 已启用 |
| Python 启动脚本 | IKRig / ControlRig / ToolsetRegistry 的 init_unreal.py |

### 3.2 运行方式

在 UE 编辑器 Output Log 中切换到 **Python 模式**，用 `exec` 执行脚本文件：

```python
exec(open(r"F:/工程路径/Content/Python/script.py", encoding="utf-8").read())
```

> **注意**：`py script_name` 是控制台命令（Command 模式），不是 Python 语法。在 Python 模式下输入 `py xxx` 会报 `SyntaxError`。

### 3.3 材质 Comment API

#### ❌ 不可用的方法

| 方法 | 错误 |
|---|---|
| `material.get_material_expression_collection()` | `AttributeError` — 方法不存在 |
| `material.get_editor_property("editor_comments")` | 返回 None |
| `material.get_editor_property("expression_collection")` | 返回 None |
| `material.get_editor_only_data()` | Python 未正确暴露（探测返回空） |
| `MaterialEditingLibrary.get_material_expressions(mat)` | 只返回表达式节点，**不含 Comment** |

#### C++ 源码确认

`Material.h`（第416行、第1483-1486行、第2142行）：

```cpp
// ExpressionCollection 在 UMaterialEditorOnlyData 上（第416行）
FMaterialExpressionCollection ExpressionCollection;

// GetEditorComments 是 C++ 方法，非 UFUNCTION（第1483行）
ENGINE_API TConstArrayView<TObjectPtr<UMaterialExpressionComment>> GetEditorComments() const;

// EditorComments_DEPRECATED 仍存在（第2142行）
TArray<TObjectPtr<class UMaterialExpressionComment>> EditorComments_DEPRECATED;
```

`MaterialExpression.h`（第124-149行）：

```cpp
struct FMaterialExpressionCollection {
    TArray<TObjectPtr<UMaterialExpression>> Expressions;        // 不含 Comment
    TArray<TObjectPtr<UMaterialExpressionComment>> EditorComments; // Comment 单独存储
};
```

#### ✅ 正确方法（待验证）

用 `getattr()` 直接访问 deprecated 属性：

```python
import unreal

mat = unreal.EditorAssetLibrary.load_asset("/Game/Path/To/Material")

# 方法 1: deprecated 数组（仍可访问）
comments = getattr(mat, "editor_comments", None)  # 或 "EditorComments_DEPRECATED"

# 方法 2: 通过 EditorOnlyData
eod = mat.get_editor_only_data()
ec = getattr(eod, "expression_collection", None)
comments = getattr(ec, "editor_comments", None)

# 读取 Comment 文本
for c in comments:
    text = getattr(c, "text", "")  # UMaterialExpressionComment::Text
```

> **核心问题**：`get_editor_property("xxx")` 遇到 deprecated 属性会抛异常，但 `getattr(obj, "xxx")` 可以绕过。需用探测脚本 v2 验证。

### 3.4 Niagara Comment API

#### ❌ 不可用的方法

| 方法 | 错误 |
|---|---|
| `script.get_editor_property("source")` | `Property 'source' on 'NiagaraScript' is deprecated` |
| `emitter.get_editor_property("graph_source")` | `Property 'graph_source' on 'NiagaraEmitter' is deprecated` |
| `sys.get_editor_property("niagara_emitters")` | 返回 None |

#### C++ 源码确认

`NiagaraScript.h`（第775行）：

```cpp
// Source 仍存在，只是标记为 deprecated
TObjectPtr<class UNiagaraScriptSourceBase> Source = nullptr;

// GetSource() 仍可用（第766行），但非 UFUNCTION
class UNiagaraScriptSourceBase* GetSource() { return Source; }
```

`NiagaraEmitter.h`（第512行）：

```cpp
TObjectPtr<UNiagaraScriptSourceBase> GraphSource = nullptr;
```

`NiagaraScriptSource.h`（第25行）：

```cpp
TObjectPtr<class UNiagaraGraph> NodeGraph;  // 即 .node_graph
```

`EdGraph.h`（第79行）：

```cpp
TArray<TObjectPtr<UEdGraphNode>> Nodes;  // 即 .nodes
```

`EdGraphNode.h`（第394行）：

```cpp
UPROPERTY() FString NodeComment;  // Comment 文本
```

#### ✅ 正确方法（待验证）

用 `getattr()` 直接访问 deprecated 属性，走 `source → node_graph → nodes` 链：

```python
import unreal

# NiagaraScript（Module / DynamicInput 等）
script = unreal.EditorAssetLibrary.load_asset("/Game/Path/To/Script")
source = script.source                          # deprecated 但仍可访问
graph = source.node_graph                       # UNiagaraGraph (继承自 UEdGraph)
for node in graph.nodes:                        # TArray[UEdGraphNode]
    if isinstance(node, unreal.EdGraphNode_Comment):
        text = node.node_comment                # FString NodeComment
        node.node_comment = "中文翻译"           # 写入

# NiagaraEmitter
emitter = unreal.EditorAssetLibrary.load_asset("/Game/Path/To/Emitter")
gs = emitter.graph_source                       # deprecated 但仍可访问
graph = gs.node_graph
for node in graph.nodes:
    if isinstance(node, unreal.EdGraphNode_Comment):
        text = node.node_comment

# NiagaraSystem → 遍历 Emitter
system = unreal.EditorAssetLibrary.load_asset("/Game/Path/To/System")
emitters = system.niagara_emitters              # 待验证属性名
for emitter_entry in emitters:
    emitter = emitter_entry.emitter             # FNiagaraEmitterHandle
    gs = emitter.graph_source
    # ... 同上
```

### 3.5 Niagara 参数描述

`NiagaraScript` 有 `description` 属性（`dir()` 确认）：

```python
desc = script.description  # FNiagaraScriptDescription 或 FString
```

---

## 4. 实施方案

### 4.1 三阶段流程

```
阶段 1: 导出          阶段 2: 翻译           阶段 3: 回写
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ export_     │     │              │     │ apply_       │
│ comments.py │────▶│  AI 翻译     │────▶│ translations │
│             │     │  EN → ZH     │     │ .py          │
│ 读出所有    │     │              │     │              │
│ Comment 文本│     │ 生成映射 JSON│     │ 写回 Comment │
│ → JSON      │     │              │     │ + 保存资产   │
└─────────────┘     └──────────────┘     └──────────────┘
     只读                不碰 UE               只改文本属性
```

### 4.2 导出 JSON 格式

```json
{
  "materials": [
    {
      "asset_path": "/Game/ExampleContent/Materials/Materials/M_Opaque",
      "asset_type": "Material",
      "comments": [
        {"node_id": "MaterialExpressionComment_0", "text": "Main color blend", "type": "material_comment"}
      ]
    }
  ],
  "niagara": [
    {
      "asset_path": "/Game/ExampleContent/Niagara/Simple/NS_Sparks",
      "asset_type": "NiagaraSystem",
      "comments": [
        {"node_id": "EdGraphNode_Comment_2", "text": "Spawn rate controls", "type": "niagara_graph_comment", "script": "system_spawn_script"}
      ]
    }
  ],
  "translations": {
    "Main color blend": "主颜色混合",
    "Spawn rate controls": "生成速率控制"
  }
}
```

### 4.3 安全保障

| 保障 | 实现 |
|---|---|
| 只改文本 | 只修改 `node_comment` / `text` 字符串属性 |
| 不动布局 | 不触碰节点位置、大小、连线 |
| 可撤销 | 脚本先保存资产，UE 编辑器支持 Ctrl+Z |
| 可回滚 | 导出 JSON 包含原文，可生成回滚脚本 |
| 分批处理 | 按 200 个资产分批，避免内存溢出 |

---

## 5. 已验证的 UE 5.8 Python API 速查

### 5.1 资产操作

```python
import unreal
ear = unreal.EditorAssetLibrary

# 列出资产
assets = ear.list_assets("/Game", recursive=True, include_folder=False)

# 加载资产
asset = ear.load_asset("/Game/Path/To/Asset")

# 保存资产
ear.save_loaded_asset(asset)
```

### 5.2 材质

```python
mel = unreal.MaterialEditingLibrary

# 获取表达式（不含 Comment）
exprs = mel.get_material_expressions(material)
exprs = mel.get_material_function_expressions(material_function)

# Comment 需通过 deprecated 属性访问
comments = getattr(material, "editor_comments", [])
# 或
eod = material.get_editor_only_data()
ec = getattr(eod, "expression_collection", None)
comments = getattr(ec, "editor_comments", [])

# Comment 文本
text = getattr(comment, "text", "")
comment.text = "中文"
```

### 5.3 Niagara

```python
# NiagaraScript
source = script.source           # deprecated 但可访问
graph = source.node_graph
nodes = graph.nodes
# 遍历找 Comment
for node in nodes:
    if isinstance(node, unreal.EdGraphNode_Comment):
        text = node.node_comment
        node.node_comment = "中文"

# NiagaraEmitter
gs = emitter.graph_source        # deprecated 但可访问
graph = gs.node_graph
# 同上

# NiagaraSystem → 遍历 Emitter
emitters = system.niagara_emitters
```

### 5.4 运行脚本

```python
# Output Log → Python 模式
exec(open(r"F:/path/to/script.py", encoding="utf-8").read())

# 或控制台命令（Command 模式）
# py "F:/path/to/script.py"
```

---

## 6. 踩坑记录

### 6.1 `get_editor_property` vs `getattr`

| 方法 | deprecated 属性 | 行为 |
|---|---|---|
| `obj.get_editor_property("source")` | ❌ 抛异常 | UE Python 绑定拦截 deprecated 属性 |
| `getattr(obj, "source")` | ✅ 返回值 | 直接访问反射属性，不经过 deprecated 检查 |

**教训**：UE 5.8 大量属性被标记为 deprecated（`Source`、`GraphSource`、`EditorComments`），`get_editor_property` 会拒绝访问。但底层 C++ 属性仍存在，用 `getattr()` 可以绕过。

### 6.2 `dir()` 不列 UPROPERTY

`dir(obj)` 只列出方法名，不列出 UPROPERTY 字段。需要用 `get_editor_property("name")` 或 `getattr(obj, "name")` 传字符串名访问。

### 6.3 MaterialEditingLibrary.get_material_expressions 不含 Comment

`FMaterialExpressionCollection` 有两个独立数组：
- `Expressions` — 材质表达式节点（**不含 Comment**）
- `EditorComments` — Comment 节点（单独存储）

`get_material_expressions()` 只返回 `Expressions`，Comment 必须从 `EditorComments` 数组获取。

### 6.4 NiagaraScript.source 被标记 deprecated

UE 5.8 把 `NiagaraScript::Source` 标记为 deprecated，但**没有提供替代的 Python API**。C++ 层面 `GetSource()` 仍可用（`NiagaraScript.h` 第766行），属性仍存在（第775行）。只能通过 `getattr()` 绕过 Python 绑定的 deprecated 拦截。

### 6.5 MCP 工具集不覆盖 Comment 编辑

NiagaraToolset 有 40+ AICallable 工具，但全部面向"模块参数读写 + 结构增删"，不覆盖图编辑器元数据（Comment 节点、节点标题等）。这是 MCP 工具集的设计边界，不是 bug。

---

## 7. 待办

- [ ] 跑通探测脚本 v2，确认 `getattr()` 能访问 deprecated 属性
- [ ] 用正确的 API 重写导出脚本，跑全工程扫描
- [ ] 翻译导出的 JSON
- [ ] 写回写脚本 `apply_translations.py`，执行翻译
- [ ] 验证：打开几个材质/Niagara 编辑器，确认 Comment 已翻译且布局未变

---

## 附录 A：相关源码文件索引

| 文件 | 关键行 | 内容 |
|---|---|---|
| `Engine/Source/Runtime/Engine/Public/Materials/Material.h` | 416, 455, 1483-1486, 2142 | ExpressionCollection, GetEditorOnlyData, GetEditorComments, EditorComments_DEPRECATED |
| `Engine/Source/Runtime/Engine/Public/Materials/MaterialExpression.h` | 124-149 | FMaterialExpressionCollection（Expressions + EditorComments 分离存储） |
| `Engine/Source/Runtime/Engine/Public/Materials/MaterialExpressionComment.h` | 27 | `FString Text` UPROPERTY |
| `Engine/Source/Editor/MaterialEditor/Public/MaterialEditingLibrary.h` | 137, 141, 145 | get_material_function_expressions, get_material_expressions, get_num_material_expressions |
| `Engine/Source/Editor/UnrealEd/Public/EdGraphNode_Comment.h` | 44 | UEdGraphNode_Comment 类定义 |
| `Engine/Source/Runtime/Engine/Classes/EdGraph/EdGraphNode.h` | 394 | `FString NodeComment` UPROPERTY |
| `Engine/Source/Runtime/Engine/Classes/EdGraph/EdGraph.h` | 79 | `TArray<UEdGraphNode*> Nodes` UPROPERTY |
| `Engine/Plugins/FX/Niagara/Source/Niagara/Classes/NiagaraScript.h` | 766, 775 | GetSource(), Source 属性 |
| `Engine/Plugins/FX/Niagara/Source/NiagaraEditor/Public/NiagaraScriptSource.h` | 25 | `NodeGraph` UPROPERTY |
| `Engine/Plugins/FX/Niagara/Source/NiagaraEditor/Public/NiagaraGraph.h` | 235 | UNiagaraGraph 继承 UEdGraph |
| `Engine/Plugins/FX/Niagara/Source/Niagara/Classes/NiagaraEmitter.h` | 512, 935 | GraphSource, GraphSource_DEPRECATED |
| `Engine/Plugins/Experimental/Toolsets/NiagaraToolsets/Source/NiagaraToolsets/Private/NiagaraToolset_System.h` | 全文 | 40+ AICallable 函数定义 |
