"""
探测脚本：在单个材质和 Niagara 资产上试出正确的 Comment 访问 API。
不扫描全工程，只对几个样本资产做深度探测。
"""
import unreal
import json

def log(msg):
    unreal.log("[Probe] " + str(msg))

def log_warn(msg):
    unreal.log_warning("[Probe] " + str(msg))

ear = unreal.EditorAssetLibrary

# ─── 测试材质 ───────────────────────────────────────────
def probe_material(asset_path):
    log("=" * 50)
    log("探测材质: " + asset_path)
    mat = ear.load_asset(asset_path)
    if mat is None:
        log_warn("加载失败")
        return

    # 列出所有 get_editor_property 能访问的属性名
    # UE Python 的 dir() 不列 UPROPERTY，但我们可以试常见名字
    prop_names_to_try = [
        "editor_comments",
        "EditorComments",
        "EditorComments_DEPRECATED",
        "expression_collection",
        "ExpressionCollection",
        "expressions",
        "Expressions",
        "FunctionExpressions",
        "function_expressions",
    ]

    for name in prop_names_to_try:
        try:
            val = mat.get_editor_property(name)
            if val is not None:
                log("  ✓ mat.get_editor_property('{}') = {} (type: {})".format(
                    name, str(val)[:200], type(val).__name__))
                # 如果是数组，尝试遍历
                if hasattr(val, '__iter__') and not isinstance(val, str):
                    count = 0
                    for item in val:
                        count += 1
                        if count <= 3:
                            item_type = type(item).__name__ if item else "None"
                            log("    [{}] type={}, name={}".format(
                                count, item_type,
                                item.get_name() if item and hasattr(item, "get_name") else "?"))
                    if count > 3:
                        log("    ... 共 {} 个".format(count))
            else:
                pass  # None = 属性不存在或值为空，静默
        except Exception as e:
            err_str = str(e)
            if "not a valid property" not in err_str and "is not a valid" not in err_str:
                log("  ✗ mat.get_editor_property('{}') 错误: {}".format(name, err_str[:100]))

    # 尝试 MaterialEditingLibrary
    log("  --- MaterialEditingLibrary ---")
    try:
        exprs = unreal.MaterialEditingLibrary.get_material_expressions(mat)
        log("  ✓ get_material_expressions() = {} 个表达式".format(len(exprs) if exprs else 0))
        if exprs:
            for i, e in enumerate(exprs[:5]):
                etype = type(e).__name__ if e else "None"
                log("    [{}] type={}".format(i, etype))
                # 检查是否是 Comment
                if "Comment" in etype:
                    try:
                        t = e.get_editor_property("text")
                        log("      text = '{}'".format(t))
                    except:
                        try:
                            t = e.text
                            log("      text = '{}'".format(t))
                        except:
                            pass
    except Exception as e:
        log_warn("  get_material_expressions 错误: " + str(e)[:200])

    # 尝试 get_editor_only_data
    log("  --- get_editor_only_data ---")
    try:
        eod = mat.get_editor_only_data()
        if eod:
            log("  ✓ get_editor_only_data() = {} (type: {})".format(str(eod)[:100], type(eod).__name__))
            # 尝试从 eod 获取 expression_collection
            try:
                ec = eod.get_editor_property("expression_collection")
                if ec:
                    log("  ✓ eod.expression_collection = {} (type: {})".format(str(ec)[:100], type(ec).__name__))
                    # 尝试获取 editor_comments
                    try:
                        ec_comments = ec.get_editor_property("editor_comments")
                        log("  ✓ ec.editor_comments = {} (type: {}, len: {})".format(
                            str(ec_comments)[:200], type(ec_comments).__name__,
                            len(ec_comments) if ec_comments else 0))
                        if ec_comments:
                            for i, c in enumerate(ec_comments[:3]):
                                ctype = type(c).__name__ if c else "None"
                                log("    [{}] type={}".format(i, ctype))
                                try:
                                    t = c.get_editor_property("text")
                                    log("      text = '{}'".format(t))
                                except:
                                    pass
                    except Exception as e2:
                        log("  ✗ ec.editor_comments 错误: " + str(e2)[:150])
                    # 尝试 expressions
                    try:
                        ec_exprs = ec.get_editor_property("expressions")
                        log("  ✓ ec.expressions = len {}".format(len(ec_exprs) if ec_exprs else 0))
                    except:
                        pass
                else:
                    log("  eod.expression_collection = None")
            except Exception as e2:
                log("  ✗ eod.expression_collection 错误: " + str(e2)[:150])

            # 直接试 eod 上的 editor_comments
            try:
                eod_comments = eod.get_editor_property("editor_comments")
                if eod_comments:
                    log("  ✓ eod.editor_comments = len {}".format(len(eod_comments)))
            except:
                pass
        else:
            log("  get_editor_only_data() = None")
    except Exception as e:
        log_warn("  get_editor_only_data 错误: " + str(e)[:200])

# ─── 测试 NiagaraScript ─────────────────────────────────
def probe_niagara_script(asset_path):
    log("=" * 50)
    log("探测 NiagaraScript: " + asset_path)
    script = ear.load_asset(asset_path)
    if script is None:
        log_warn("加载失败")
        return

    # source 属性
    try:
        source = script.get_editor_property("source")
        if source:
            log("  ✓ script.source = {} (type: {})".format(str(source)[:100], type(source).__name__))
            # node_graph
            try:
                graph = source.get_editor_property("node_graph")
                if graph:
                    log("  ✓ source.node_graph = {} (type: {})".format(str(graph)[:100], type(graph).__name__))
                    # nodes
                    try:
                        nodes = graph.get_editor_property("nodes")
                        if nodes:
                            log("  ✓ graph.nodes = {} 个".format(len(nodes)))
                            comment_count = 0
                            for i, node in enumerate(nodes):
                                ntype = type(node).__name__ if node else "None"
                                if "Comment" in ntype:
                                    comment_count += 1
                                    if comment_count <= 3:
                                        log("    [{}] type={} (COMMENT!)".format(i, ntype))
                                        try:
                                            t = node.get_editor_property("node_comment")
                                            log("      node_comment = '{}'".format(t))
                                        except:
                                            try:
                                                t = node.node_comment
                                                log("      node_comment = '{}'".format(t))
                                            except:
                                                pass
                                elif i < 5:
                                    log("    [{}] type={}".format(i, ntype))
                            if comment_count > 0:
                                log("  共找到 {} 个 Comment 节点".format(comment_count))
                            else:
                                log("  没找到 Comment 节点（节点总数 {}）".format(len(nodes)))
                        else:
                            log("  graph.nodes = None 或空")
                    except Exception as e:
                        log("  ✗ graph.nodes 错误: " + str(e)[:150])
                else:
                    log("  source.node_graph = None")
            except Exception as e:
                log("  ✗ source.node_graph 错误: " + str(e)[:150])
        else:
            log("  script.source = None")
    except Exception as e:
        log("  ✗ script.source 错误: " + str(e)[:150])

    # description 属性
    try:
        desc = script.get_editor_property("description")
        if desc:
            log("  ✓ script.description = '{}'".format(desc))
    except:
        pass

# ─── 测试 NiagaraEmitter ────────────────────────────────
def probe_niagara_emitter(asset_path):
    log("=" * 50)
    log("探测 NiagaraEmitter: " + asset_path)
    em = ear.load_asset(asset_path)
    if em is None:
        log_warn("加载失败")
        return

    # graph_source
    try:
        gs = em.get_editor_property("graph_source")
        if gs:
            log("  ✓ emitter.graph_source = {} (type: {})".format(str(gs)[:100], type(gs).__name__))
            try:
                nodes = gs.get_editor_property("nodes")
                if nodes:
                    log("  ✓ graph_source.nodes = {} 个".format(len(nodes)))
                    comment_count = 0
                    for node in nodes:
                        ntype = type(node).__name__ if node else "None"
                        if "Comment" in ntype:
                            comment_count += 1
                            if comment_count <= 3:
                                log("    COMMENT type={}".format(ntype))
                                try:
                                    t = node.get_editor_property("node_comment")
                                    log("      text='{}'".format(t))
                                except:
                                    pass
                    log("  共 {} 个 Comment 节点".format(comment_count))
            except Exception as e:
                log("  ✗ graph_source.nodes 错误: " + str(e)[:150])
    except Exception as e:
        log("  ✗ emitter.graph_source 错误: " + str(e)[:150])

    # script props
    for prop_name in ["emitter_spawn_script_props", "emitter_update_script_props",
                       "spawn_script_props", "update_script_props", "gpu_compute_script"]:
        try:
            val = em.get_editor_property(prop_name)
            if val:
                log("  ✓ emitter.{} = {} (type: {})".format(prop_name, str(val)[:80], type(val).__name__))
        except:
            pass

# ─── 测试 NiagaraSystem ─────────────────────────────────
def probe_niagara_system(asset_path):
    log("=" * 50)
    log("探测 NiagaraSystem: " + asset_path)
    sys = ear.load_asset(asset_path)
    if sys is None:
        log_warn("加载失败")
        return

    # 尝试各种属性
    for prop_name in ["system_spawn_script", "system_update_script",
                       "niagara_emitters", "emitters", "system_spawn_script_props",
                       "system_update_script_props"]:
        try:
            val = sys.get_editor_property(prop_name)
            if val:
                log("  ✓ system.{} = {} (type: {})".format(prop_name, str(val)[:80], type(val).__name__))
                # 如果是 script，探测它的 source
                if hasattr(val, "get_editor_property"):
                    try:
                        src = val.get_editor_property("source")
                        if src:
                            log("    .source = {}".format(str(src)[:80]))
                    except:
                        pass
        except:
            pass

# ─── 主流程 ─────────────────────────────────────────────
def main():
    log("开始探测样本资产...")

    # 找几个材质样本
    mat_assets = ear.list_assets("/Game/ExampleContent/Materials", recursive=True, include_folder=False)
    mat_samples = [a for a in mat_assets if a.endswith(".M_Opaque") or a.endswith(".M_MasterMaterial")
                   or a.endswith(".MF_Rotate2D") or a.endswith(".MF_RadialMotionBlurSample")][:5]
    if not mat_samples:
        mat_samples = mat_assets[:5]

    for path in mat_samples:
        try:
            asset = ear.load_asset(path)
            if asset:
                atype = type(asset).__name__
                if "Material" in atype:
                    probe_material(path)
        except:
            pass

    # 找 Niagara 样本
    ni_assets = ear.list_assets("/Game/ExampleContent/Niagara", recursive=True, include_folder=False)

    # 分类
    sys_samples = []
    emitter_samples = []
    script_samples = []
    for path in ni_assets[:200]:
        try:
            asset = ear.load_asset(path)
            if asset:
                atype = type(asset).__name__
                if isinstance(asset, unreal.NiagaraSystem):
                    if len(sys_samples) < 3:
                        sys_samples.append(path)
                elif isinstance(asset, unreal.NiagaraEmitter):
                    if len(emitter_samples) < 3:
                        emitter_samples.append(path)
                elif isinstance(asset, unreal.NiagaraScript):
                    if len(script_samples) < 3:
                        script_samples.append(path)
        except:
            pass

    log("Niagara 样本: System={}, Emitter={}, Script={}".format(
        len(sys_samples), len(emitter_samples), len(script_samples)))

    for path in script_samples:
        probe_niagara_script(path)
    for path in emitter_samples:
        probe_niagara_emitter(path)
    for path in sys_samples:
        probe_niagara_system(path)

    log("=" * 50)
    log("探测完成！看上面的 ✓ 行就是能用的 API。")

main()
