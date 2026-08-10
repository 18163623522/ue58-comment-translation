"""
探测脚本 v2：绕过 deprecated 限制，直接访问属性。
"""
import unreal

def log(msg):
    unreal.log("[Probe2] " + str(msg))

ear = unreal.EditorAssetLibrary

# ─── 材质 ───────────────────────────────────────────────
def probe_mat(path):
    log("=" * 40)
    log("材质: " + path)
    mat = ear.load_asset(path)
    if not mat:
        return

    # 1. 直接属性访问（不走 get_editor_property，绕过 deprecated 检查）
    for attr in ["source", "graph_source", "editor_comments", "expression_collection",
                 "EditorComments", "ExpressionCollection", "EditorComments_DEPRECATED"]:
        try:
            val = getattr(mat, attr)
            if val is not None:
                log("  ✓ mat.{} = {} type={}".format(attr, str(val)[:120], type(val).__name__))
        except Exception as e:
            es = str(e)
            if "deprecated" not in es.lower() and "not found" not in es.lower() and "has no attribute" not in es.lower():
                log("  ? mat.{} err: {}".format(attr, es[:100]))

    # 2. get_editor_only_data 各种试法
    for method in ["get_editor_only_data", "GetEditorOnlyData"]:
        try:
            eod = getattr(mat, method)()
            if eod:
                log("  ✓ mat.{}() = {} type={}".format(method, str(eod)[:80], type(eod).__name__))
                # 从 eod 获取 expression_collection
                for attr in ["expression_collection", "ExpressionCollection", "editor_comments", "EditorComments"]:
                    try:
                        val = getattr(eod, attr)
                        if val is not None:
                            log("    ✓ eod.{} = {} type={}".format(attr, str(val)[:120], type(val).__name__))
                            # 尝试遍历
                            if hasattr(val, '__iter__') and not isinstance(val, str):
                                try:
                                    for i, item in enumerate(list(val)[:5]):
                                        itype = type(item).__name__
                                        log("      [{}] type={}".format(i, itype))
                                        if "Comment" in itype:
                                            try:
                                                t = getattr(item, "text")
                                                log("        text='{}'".format(t))
                                            except:
                                                try:
                                                    t = item.get_editor_property("text")
                                                    log("        text='{}'".format(t))
                                                except:
                                                    pass
                                except:
                                    pass
                            # 如果是 struct，尝试获取子属性
                            try:
                                sub_comments = val.get_editor_property("editor_comments")
                                if sub_comments:
                                    log("    ✓ val.editor_comments len={}".format(len(sub_comments)))
                                    for i, c in enumerate(list(sub_comments)[:3]):
                                        log("      [{}] type={}".format(i, type(c).__name__))
                                        try:
                                            log("        text='{}'".format(c.get_editor_property("text")))
                                        except:
                                            try:
                                                log("        text='{}'".format(c.text))
                                            except:
                                                pass
                            except:
                                pass
                            try:
                                sub_exprs = val.get_editor_property("expressions")
                                if sub_exprs:
                                    log("    ✓ val.expressions len={}".format(len(sub_exprs)))
                            except:
                                pass
                        else:
                            log("    eod.{} = None".format(attr))
                    except Exception as e:
                        es = str(e)
                        if "deprecated" not in es.lower():
                            log("    ✗ eod.{} err: {}".format(attr, es[:80]))
                break  # 找到一个就够
        except Exception as e:
            pass

    # 3. MaterialEditingLibrary
    try:
        exprs = unreal.MaterialEditingLibrary.get_material_expressions(mat)
        if exprs and len(exprs) > 0:
            log("  ✓ MEL.get_material_expressions = {} 个".format(len(exprs)))
            for i, e in enumerate(list(exprs)[:5]):
                etype = type(e).__name__
                log("    [{}] type={}".format(i, etype))
                if "Comment" in etype:
                    try:
                        log("      text='{}'".format(e.get_editor_property("text")))
                    except:
                        pass
        else:
            log("  MEL.get_material_expressions = 空或None")
    except Exception as e:
        log("  ✗ MEL err: {}".format(str(e)[:100]))

# ─── Niagara Script ────────────────────────────────────
def probe_niagara_script(path):
    log("=" * 40)
    log("NiagaraScript: " + path)
    script = ear.load_asset(path)
    if not script:
        return

    # 直接属性访问 source
    try:
        source = script.source
        if source:
            log("  ✓ script.source = {} type={}".format(str(source)[:80], type(source).__name__))
            # node_graph
            try:
                graph = source.node_graph
                if graph:
                    log("  ✓ source.node_graph = {} type={}".format(str(graph)[:80], type(graph).__name__))
                    try:
                        nodes = graph.nodes
                        if nodes:
                            log("  ✓ graph.nodes = {} 个".format(len(nodes)))
                            cc = 0
                            for node in nodes:
                                nt = type(node).__name__
                                if "Comment" in nt:
                                    cc += 1
                                    if cc <= 3:
                                        log("    COMMENT type={}".format(nt))
                                        try:
                                            log("      text='{}'".format(node.node_comment))
                                        except:
                                            try:
                                                log("      text='{}'".format(node.get_editor_property("node_comment")))
                                            except:
                                                pass
                            log("  Comment 节点数: {}".format(cc))
                    except Exception as e:
                        log("  ✗ graph.nodes: {}".format(str(e)[:80]))
            except Exception as e:
                log("  ✗ source.node_graph: {}".format(str(e)[:80]))
        else:
            log("  script.source = None")
    except Exception as e:
        log("  ✗ script.source: {}".format(str(e)[:120]))

    # description
    try:
        desc = script.description
        if desc:
            log("  ✓ script.description = '{}'".format(desc))
    except:
        pass

# ─── Niagara Emitter ───────────────────────────────────
def probe_niagara_emitter(path):
    log("=" * 40)
    log("NiagaraEmitter: " + path)
    em = ear.load_asset(path)
    if not em:
        return

    # graph_source 直接访问
    try:
        gs = em.graph_source
        if gs:
            log("  ✓ em.graph_source = {} type={}".format(str(gs)[:80], type(gs).__name__))
            try:
                graph = gs.node_graph
                if graph:
                    nodes = graph.nodes
                    if nodes:
                        log("  ✓ graph.nodes = {} 个".format(len(nodes)))
                        cc = 0
                        for node in nodes:
                            nt = type(node).__name__
                            if "Comment" in nt:
                                cc += 1
                                if cc <= 3:
                                    log("    COMMENT type={}".format(nt))
                                    try:
                                        log("      text='{}'".format(node.node_comment))
                                    except:
                                        pass
                        log("  Comment 节点数: {}".format(cc))
            except Exception as e:
                log("  ✗ gs.node_graph: {}".format(str(e)[:80]))
    except Exception as e:
        log("  ✗ em.graph_source: {}".format(str(e)[:120]))

    # script props
    for prop in ["emitter_spawn_script_props", "emitter_update_script_props",
                 "spawn_script_props", "update_script_props", "gpu_compute_script"]:
        try:
            val = getattr(em, prop)
            if val:
                log("  ✓ em.{} type={}".format(prop, type(val).__name__))
                # 尝试获取 script
                try:
                    s = val.script
                    if s:
                        log("    .script = {}".format(str(s)[:60]))
                        try:
                            src = s.source
                            if src:
                                log("    .source = {}".format(str(src)[:60]))
                                g = src.node_graph
                                if g:
                                    nodes = g.nodes
                                    cc = sum(1 for n in nodes if "Comment" in type(n).__name__)
                                    log("    graph.nodes={} comments={}".format(len(nodes), cc))
                        except:
                            pass
                except:
                    pass
        except:
            pass

# ─── Niagara System ────────────────────────────────────
def probe_niagara_system(path):
    log("=" * 40)
    log("NiagaraSystem: " + path)
    sys = ear.load_asset(path)
    if not sys:
        return

    # 列出所有非方法属性
    try:
        attrs = [a for a in dir(sys) if not a.startswith("_") and not callable(getattr(sys, a, None))]
        log("  属性列表: {}".format(attrs[:30]))
    except:
        pass

    # 尝试各种属性名
    for prop in ["niagara_emitters", "emitters", "system_spawn_script", "system_update_script",
                 "system_spawn_script_props", "system_update_script_props",
                 "graph_source", "source", "script"]:
        try:
            val = getattr(sys, prop)
            if val is not None:
                log("  ✓ sys.{} = {} type={}".format(prop, str(val)[:80], type(val).__name__))
                # 如果是数组
                if hasattr(val, '__iter__') and not isinstance(val, str):
                    try:
                        for i, item in enumerate(list(val)[:3]):
                            log("    [{}] type={}".format(i, type(item).__name__))
                    except:
                        pass
        except:
            pass

# ─── 主流程 ─────────────────────────────────────────────
log("开始探测 v2...")

# 材质样本
mat_assets = ear.list_assets("/Game/ExampleContent/Materials/Materials", recursive=False, include_folder=False)
for p in mat_assets[:5]:
    try:
        a = ear.load_asset(p)
        if a and "Material" in type(a).__name__:
            probe_mat(p)
    except:
        pass

# MaterialFunction 样本
mf_assets = ear.list_assets("/Game/ExampleContent/Materials/Materials", recursive=False, include_folder=False)
for p in mf_assets:
    if "MF_" in p:
        try:
            a = ear.load_asset(p)
            if a:
                probe_mat(p)
        except:
            pass
        break

# Niagara 样本
ni_assets = ear.list_assets("/Game/ExampleContent/Niagara", recursive=True, include_folder=False)
sys_done = 0
em_done = 0
sc_done = 0
for p in ni_assets[:300]:
    try:
        a = ear.load_asset(p)
        if not a:
            continue
        if isinstance(a, unreal.NiagaraSystem) and sys_done < 2:
            probe_niagara_system(p)
            sys_done += 1
        elif isinstance(a, unreal.NiagaraEmitter) and em_done < 2:
            probe_niagara_emitter(p)
            em_done += 1
        elif isinstance(a, unreal.NiagaraScript) and sc_done < 2:
            probe_niagara_script(p)
            sc_done += 1
    except:
        pass
    if sys_done >= 2 and em_done >= 2 and sc_done >= 2:
        break

log("=" * 40)
log("探测 v2 完成！")
