"""
导出材质和 Niagara 资产中的所有注释（Comment 节点文本）到 JSON 文件。
UE 5.8 正确 API 版本。

用法（Python 模式）：
    exec(open(r"F:/Window/Downloder/001浏览器下载/内容示例5_8汉化/内容示例5_8汉化/Content/Python/export_comments.py", encoding="utf-8").read())

输出文件：工程/Saved/comment_export.json
"""

import unreal
import json
import os

SCAN_ROOTS = ["/Game"]
OUTPUT_PATH = os.path.join(unreal.Paths.project_saved_dir(), "comment_export.json")

def log(msg):
    unreal.log("[CommentExport] " + str(msg))

def log_warn(msg):
    unreal.log_warning("[CommentExport] " + str(msg))

# ─── 材质 Comment 导出 ──────────────────────────────────
def get_material_comments(material):
    """从 Material 资产获取所有 Comment 节点"""
    comments = []

    # 方法 1: EditorComments_DEPRECATED 数组（UMaterial 上仍反射暴露）
    try:
        deprecated = material.get_editor_property("editor_comments")
        if deprecated:
            for c in deprecated:
                if c is None:
                    continue
                text = ""
                try:
                    text = c.get_editor_property("text")
                except:
                    try:
                        text = c.text
                    except:
                        pass
                if text and str(text).strip():
                    comments.append({
                        "node_id": str(c.get_name()),
                        "text": str(text).strip(),
                        "type": "material_comment"
                    })
            if comments:
                return comments
    except:
        pass

    # 方法 2: get_editor_only_data() -> expression_collection -> editor_comments
    try:
        eod = material.get_editor_only_data()
        if eod is not None:
            ec = eod.get_editor_property("expression_collection")
            if ec is not None:
                editor_comments = ec.get_editor_property("editor_comments")
                if editor_comments:
                    for c in editor_comments:
                        if c is None:
                            continue
                        text = ""
                        try:
                            text = c.get_editor_property("text")
                        except:
                            try:
                                text = c.text
                            except:
                                pass
                        if text and str(text).strip():
                            comments.append({
                                "node_id": str(c.get_name()),
                                "text": str(text).strip(),
                                "type": "material_comment"
                            })
    except:
        pass

    return comments

def get_material_function_comments(mf):
    """从 MaterialFunction 资产获取所有 Comment 节点"""
    comments = []

    # 方法 1: get_material_function_expressions 可能包含 comment
    try:
        expressions = unreal.MaterialEditingLibrary.get_material_function_expressions(mf)
        for expr in expressions:
            if expr is None:
                continue
            if isinstance(expr, unreal.MaterialExpressionComment):
                text = ""
                try:
                    text = expr.get_editor_property("text")
                except:
                    try:
                        text = expr.text
                    except:
                        pass
                if text and str(text).strip():
                    comments.append({
                        "node_id": str(expr.get_name()),
                        "text": str(text).strip(),
                        "type": "material_function_comment"
                    })
    except:
        pass

    # 方法 2: function_expression_collection.editor_comments
    if not comments:
        try:
            ec = mf.get_editor_property("function_expression_collection")
            if ec is not None:
                editor_comments = ec.get_editor_property("editor_comments")
                if editor_comments:
                    for c in editor_comments:
                        if c is None:
                            continue
                        text = ""
                        try:
                            text = c.get_editor_property("text")
                        except:
                            try:
                                text = c.text
                            except:
                                pass
                        if text and str(text).strip():
                            comments.append({
                                "node_id": str(c.get_name()),
                                "text": str(text).strip(),
                                "type": "material_function_comment"
                            })
        except:
            pass

    return comments

# ─── Niagara Comment 导出 ───────────────────────────────
def get_niagara_script_comments(script, script_label=""):
    """从单个 NiagaraScript 获取图中的 Comment 节点"""
    comments = []

    if script is None:
        return comments

    try:
        source = script.get_editor_property("source")
        if source is None:
            # 尝试直接属性
            try:
                source = script.source
            except:
                return comments

        graph = None
        if source is not None:
            try:
                graph = source.get_editor_property("node_graph")
            except:
                try:
                    graph = source.node_graph
                except:
                    pass

        if graph is None:
            return comments

        nodes = []
        try:
            nodes = graph.get_editor_property("nodes")
        except:
            try:
                nodes = graph.nodes
            except:
                pass

        if not nodes:
            return comments

        for node in nodes:
            if node is None:
                continue
            # 检查是否是 Comment 节点
            node_type = type(node).__name__
            if "Comment" in node_type or "comment" in node_type:
                text = ""
                try:
                    text = node.get_editor_property("node_comment")
                except:
                    try:
                        text = node.node_comment
                    except:
                        pass
                if not text:
                    try:
                        text = node.get_comment_text() if hasattr(node, "get_comment_text") else ""
                    except:
                        pass
                if text and str(text).strip():
                    comments.append({
                        "node_id": str(node.get_name()),
                        "text": str(text).strip(),
                        "type": "niagara_graph_comment",
                        "script": script_label
                    })
    except Exception as e:
        log_warn("Niagara script 注释读取失败 {}: {}".format(script_label, str(e)))

    return comments

def get_niagara_asset_comments(asset_path, asset):
    """获取 Niagara 资产（System/Emitter/Script）中的所有注释"""
    comments = []
    asset_class = type(asset).__name__

    # NiagaraScript（Module/DynamicInput 等）
    if isinstance(asset, unreal.NiagaraScript):
        label = asset.get_name() if hasattr(asset, "get_name") else "script"
        comments.extend(get_niagara_script_comments(asset, label))

    # NiagaraEmitter
    elif isinstance(asset, unreal.NiagaraEmitter):
        # Emitter 包含多个 script，尝试各种属性名
        script_props_names = [
            "emitter_spawn_script_props",
            "emitter_update_script_props",
            "particle_spawn_script_props",
            "particle_update_script_props",
            "particle_event_script_props",
            "render_module_script_props",
        ]
        for prop_name in script_props_names:
            try:
                props = asset.get_editor_property(prop_name)
                if props is not None:
                    script = props.get_editor_property("script") if hasattr(props, "get_editor_property") else None
                    if script is None:
                        try:
                            script = props.script
                        except:
                            pass
                    if script is not None:
                        comments.extend(get_niagara_script_comments(script, prop_name))
            except:
                pass

        # 如果上面没找到，尝试直接获取 script
        if not comments:
            try:
                script = asset.get_editor_property("script")
                if script:
                    comments.extend(get_niagara_script_comments(script, "emitter_script"))
            except:
                pass

    # NiagaraSystem
    elif isinstance(asset, unreal.NiagaraSystem):
        # System 有 SystemSpawnScript 和 SystemUpdateScript
        sys_script_names = [
            "system_spawn_script",
            "system_update_script",
        ]
        for prop_name in sys_script_names:
            try:
                script = asset.get_editor_property(prop_name)
                if script is not None:
                    comments.extend(get_niagara_script_comments(script, prop_name))
            except:
                pass

        # System 还包含 Emitter，遍历 emitter 找注释
        if not comments:
            try:
                emitters = asset.get_editor_property("niagara_emitters")
                if emitters:
                    for emitter_entry in emitters:
                        try:
                            emitter = emitter_entry.get_editor_property("emitter") if hasattr(emitter_entry, "get_editor_property") else None
                            if emitter is None:
                                emitter = emitter_entry
                            if isinstance(emitter, unreal.NiagaraEmitter):
                                emitter_comments = get_niagara_asset_comments(asset_path, emitter)
                                comments.extend(emitter_comments)
                        except:
                            pass
            except:
                pass

    return comments

# ─── 主流程 ─────────────────────────────────────────────
def main():
    log("=" * 60)
    log("开始扫描全工程注释 — UE 5.8 正确 API 版本")
    log("扫描根路径: {}".format(SCAN_ROOTS))
    log("输出文件: {}".format(OUTPUT_PATH))
    log("=" * 60)

    ear = unreal.EditorAssetLibrary
    all_assets = []
    for root in SCAN_ROOTS:
        assets = ear.list_assets(root, recursive=True, include_folder=False)
        all_assets.extend(assets)
    log("找到 {} 个资产".format(len(all_assets)))

    material_results = []
    niagara_results = []
    material_count = 0
    niagara_count = 0
    material_comment_count = 0
    niagara_comment_count = 0
    skipped = 0
    debug_printed = {"material": False, "mf": False, "niagara_sys": False, "niagara_emitter": False, "niagara_script": False}

    for i, asset_path in enumerate(all_assets):
        if (i + 1) % 200 == 0:
            log("进度: {}/{}".format(i + 1, len(all_assets)))

        try:
            asset = ear.load_asset(asset_path)
            if asset is None:
                skipped += 1
                continue

            asset_class = type(asset).__name__

            # ── 材质 ──
            if isinstance(asset, unreal.Material):
                # 首次遇到时打印可用属性（调试）
                if not debug_printed["material"]:
                    debug_printed["material"] = True
                    try:
                        props = [p for p in dir(asset) if "comment" in p.lower() or "expression" in p.lower() or "editor" in p.lower()]
                        log("[DEBUG] Material 属性: {}".format(props[:15]))
                    except:
                        pass

                comments = get_material_comments(asset)
                if comments:
                    material_results.append({
                        "asset_path": asset_path,
                        "asset_type": asset_class,
                        "comments": comments
                    })
                    material_count += 1
                    material_comment_count += len(comments)

            elif isinstance(asset, unreal.MaterialFunctionInterface):
                if not debug_printed["mf"]:
                    debug_printed["mf"] = True
                    try:
                        props = [p for p in dir(asset) if "comment" in p.lower() or "expression" in p.lower()]
                        log("[DEBUG] MaterialFunction 属性: {}".format(props[:15]))
                    except:
                        pass

                comments = get_material_function_comments(asset)
                if comments:
                    material_results.append({
                        "asset_path": asset_path,
                        "asset_type": asset_class,
                        "comments": comments
                    })
                    material_count += 1
                    material_comment_count += len(comments)

            # ── Niagara ──
            elif isinstance(asset, (unreal.NiagaraSystem, unreal.NiagaraEmitter, unreal.NiagaraScript)):
                debug_key = "niagara_sys" if isinstance(asset, unreal.NiagaraSystem) else \
                           "niagara_emitter" if isinstance(asset, unreal.NiagaraEmitter) else "niagara_script"
                if not debug_printed[debug_key]:
                    debug_printed[debug_key] = True
                    try:
                        props = [p for p in dir(asset) if "script" in p.lower() or "source" in p.lower() or "emitter" in p.lower()]
                        log("[DEBUG] {} 属性: {}".format(asset_class, props[:20]))
                    except:
                        pass

                comments = get_niagara_asset_comments(asset_path, asset)
                if comments:
                    niagara_results.append({
                        "asset_path": asset_path,
                        "asset_type": asset_class,
                        "comments": comments
                    })
                    niagara_count += 1
                    niagara_comment_count += len(comments)

        except Exception as e:
            skipped += 1

    # 写 JSON
    output_data = {
        "materials": material_results,
        "niagara": niagara_results,
        "stats": {
            "total_assets_scanned": len(all_assets),
            "material_assets_with_comments": material_count,
            "niagara_assets_with_comments": niagara_count,
            "material_comments": material_comment_count,
            "niagara_comments": niagara_comment_count,
            "skipped": skipped
        }
    }

    output_dir = os.path.dirname(OUTPUT_PATH)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    log("=" * 60)
    log("导出完成！统计信息：")
    log("  扫描资产总数: {}".format(len(all_assets)))
    log("  含注释的材质资产: {}（共 {} 条注释）".format(material_count, material_comment_count))
    log("  含注释的 Niagara 资产: {}（共 {} 条注释）".format(niagara_count, niagara_comment_count))
    log("  跳过: {}".format(skipped))
    log("  输出文件: {}".format(OUTPUT_PATH))
    log("=" * 60)

if __name__ == "__main__":
    main()
