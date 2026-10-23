#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
自主学习知识库管理工具 v4.0 — 记忆桥接版

核心升级：
1. 记忆桥接 — 直接写入 Claude memory，重启会话自动可用
2. 智能去重 — 存之前自动检查，重复跳过/合并
3. 使用跟踪 — 每条知识记使用次数，自动衰减
4. 模式挖掘 — 分析冲突、高频话题、知识盲区

用法:
  python learn.py save <内容> [--type fact|preference|skill] [--tag 标签]
  python learn.py auto <对话文本>
  python learn.py recall <关键词>
  python learn.py analyze
  python learn.py stats
  python learn.py decay [--days 60]
  python learn.py migrate
  python learn.py bridge
  python learn.py graph [--tag 标签]
"""
import sys, os, json, re, time, io, math
import urllib.request, urllib.error
from datetime import datetime
import hashlib
import os

# 强制 UTF-8 输出
if sys.stdout.encoding != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

LEARNER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "learner")
LESSONS_DIR = os.path.join(LEARNER_DIR, "lessons")
PREFS_DIR = os.path.join(LEARNER_DIR, "preferences")
SKILLS_DIR = os.path.join(LEARNER_DIR, "skills")
JOURNAL_PATH = os.path.join(LEARNER_DIR, "journal.md")
GRAPH_PATH = os.path.join(LEARNER_DIR, "graph.json")

MEMORY_DIR = os.path.join(
    os.environ.get("HOME") or os.environ.get("USERPROFILE") or "C:\\Users\\Administrator",
    ".claude", "projects", "C--Users-Administrator", "memory"
)
MEMORY_INDEX = os.path.join(MEMORY_DIR, "MEMORY.md") if MEMORY_DIR else None

for d in [LESSONS_DIR, PREFS_DIR, SKILLS_DIR, MEMORY_DIR]:
    if d: os.makedirs(d, exist_ok=True)

TYPE_MAP = {
    "fact": ("lessons", LESSONS_DIR, "💡"),
    "preference": ("preferences", PREFS_DIR, "🎯"),
    "skill": ("skills", SKILLS_DIR, "⚙️"),
}

LEARNER_TO_MEMORY_TYPE = {"fact": "reference", "preference": "user", "skill": "project", "feedback": "feedback"}
MEMORY_TO_LEARNER_TYPE = {"reference": "fact", "user": "preference", "feedback": "feedback", "project": "skill"}

# ==================== AI ====================

AGNES_API_KEY = os.getenv("AGNES_API_KEY", "")

def _call_ai(prompt, system="你是一个知识提取专家。从对话中提取值得记录的知识点。"):
    try:
        body = json.dumps({"model": "agnes-2.5-flash",
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "max_tokens": 2048}).encode()
        import socket
        proxy_on = False
        try:
            s = socket.socket(); s.settimeout(2); s.connect(("127.0.0.1", 7892)); s.close(); proxy_on = True
        except: pass
        if proxy_on:
            old_https = os.environ.get("HTTPS_PROXY", ""); old_http = os.environ.get("HTTP_PROXY", "")
            os.environ["HTTPS_PROXY"] = "http://127.0.0.1:7892"; os.environ["HTTP_PROXY"] = "http://127.0.0.1:7892"
        try:
            req = urllib.request.Request("https://apihub.agnes-ai.com/v1/chat/completions",
                data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + AGNES_API_KEY})
            resp = urllib.request.urlopen(req, timeout=30)
            data = json.loads(resp.read())
            return data['choices'][0]['message']['content']
        finally:
            if proxy_on:
                if old_https: os.environ["HTTPS_PROXY"] = old_https
                else: del os.environ["HTTPS_PROXY"]
                if old_http: os.environ["HTTP_PROXY"] = old_http
                else: del os.environ["HTTP_PROXY"]
    except:
        return None

def _ai_extract(text):
    print("AI 正在分析对话...\n")
    prompt = """分析以下对话，提取值得记录的知识点。

对话内容：""" + text + """

请严格按 JSON 格式返回，不要加其他内容：
{
  "findings": [
    {
      "type": "fact|preference|skill",
      "content": "知识点的核心内容，一句话概括",
      "why": "这个知识点为什么重要",
      "how": "如何应用这个知识点",
      "confidence": 0-1之间的小数,
      "reason": "为什么这是值得记录的知识点"
    }
  ]
}

要求：fact(环境/工具/版本), preference(偏好/习惯), skill(工作流/步骤)
confidence >= 0.8 才返回，content <= 50字，最多5条"""

    result = _call_ai(prompt)
    if not result:
        print("  AI 调用失败，使用正则模式"); return None
    try:
        m = re.search(r'\{.*"findings".*\}', result, re.DOTALL)
        if m: return json.loads(m.group()).get("findings", [])
    except: pass
    print("  AI 返回格式异常，切换正则模式"); return None

# ==================== 去重 ====================

def _similarity(a, b):
    if not a or not b: return 0.0
    a, b = a.lower(), b.lower()
    sa, sb = set(a), set(b)
    if not sa or not sb: return 0.0
    cs = len(sa & sb) / len(sa | sb) if sa | sb else 0.0
    wa = set(re.findall(r'[\u4e00-\u9fff]{2,4}', a))
    wb = set(re.findall(r'[\u4e00-\u9fff]{2,4}', b))
    ws = 0.0
    if wa and wb: ws = len(wa & wb) / len(wa | wb)
    return max(cs, ws)

def _find_duplicates(content, category=None):
    results = []
    cats = [category] if category else ["fact", "preference", "skill"]
    for cat in cats:
        if cat in TYPE_MAP:
            _, dp, _ = TYPE_MAP[cat]
            if os.path.isdir(dp):
                for fn in os.listdir(dp):
                    if not fn.endswith(".md"): continue
                    fp = os.path.join(dp, fn)
                    with open(fp, "r", encoding="utf-8") as f:
                        fc = f.read()
                    t = fc.strip().split("\n")[0].replace("# ", "")
                    s = _similarity(content, t)
                    if s > 0.5:
                        results.append((s, fn.replace(".md",""), cat, t, fp))
    if MEMORY_DIR and os.path.isdir(MEMORY_DIR):
        for fn in os.listdir(MEMORY_DIR):
            if not fn.endswith(".md") or fn == "MEMORY.md": continue
            fp = os.path.join(MEMORY_DIR, fn)
            with open(fp, "r", encoding="utf-8") as f:
                fc = f.read()
            dm = re.search(r'description:\s*(.*)', fc)
            t = dm.group(1).strip() if dm else fn.replace(".md","")
            s = _similarity(content, t)
            if s > 0.5:
                results.append((s, fn.replace(".md",""), "fact", t, fp))
    results.sort(key=lambda x: -x[0])
    return results

# ==================== 记忆桥接 ====================

def _make_slug(content):
    slug = re.sub(r'[^\w\u4e00-\u9fff]', '-', content[:20])
    slug = re.sub(r'-+', '-', slug).strip('-').lower()
    if not re.search(r'[a-z]', slug):
        slug = "k-" + hashlib.md5(content.encode()).hexdigest()[:8]
    return slug[:30]

def _save_to_memory(content, mem_type, why="", how="", tags=""):
    if not MEMORY_DIR: return None
    slug = _make_slug(content)
    emojis = {"reference":"💡","user":"🎯","feedback":"📝","project":"⚙️"}
    me = emojis.get(mem_type, "📄")
    fp = os.path.join(MEMORY_DIR, slug + ".md")
    body = content
    if why: body += "\n\n**Why:** " + why
    if how: body += "\n\n**How to apply:** " + how
    n = datetime.now().strftime('%Y-%m-%d %H:%M')
    body += "\n\n**Used:** 1\n**Last used:** " + n
    if tags: body += "\n**Tags:** " + tags
    mc = "---\nname: " + slug + "\ndescription: " + content + "\nmetadata:\n  type: " + mem_type + "\n---\n\n" + body + "\n"
    with open(fp, "w", encoding="utf-8") as f: f.write(mc)
    _update_memory_index(slug, content, me)
    return slug

def _update_memory_index(slug, desc, emoji="📄"):
    if not MEMORY_INDEX or not os.path.exists(MEMORY_INDEX): return
    with open(MEMORY_INDEX, "r", encoding="utf-8") as f: c = f.read()
    line = "- [" + emoji + " " + desc[:40] + "](" + slug + ".md) \u2014 " + desc
    pr = re.compile(r'- \[.*?\]\(' + re.escape(slug) + r'\.md\)')
    if pr.search(c): c = pr.sub(line, c)
    else: c = c.rstrip() + "\n" + line + "\n"
    with open(MEMORY_INDEX, "w", encoding="utf-8") as f: f.write(c)

def _increment_usage(slug):
    if not MEMORY_DIR: return
    fp = os.path.join(MEMORY_DIR, slug + ".md")
    if not os.path.exists(fp): return
    with open(fp, "r", encoding="utf-8") as f: c = f.read()
    m = re.search(r'\*\*Used:\*\*\s*(\d+)', c)
    if m:
        c = c.replace("**Used:** " + m.group(1), "**Used:** " + str(int(m.group(1))+1))
    else: c += "\n**Used:** 1"
    n = datetime.now().strftime('%Y-%m-%d %H:%M')
    if "**Last used:**" in c: c = re.sub(r'\*\*Last used:\*\*.*', "**Last used:** " + n, c)
    else: c += "\n**Last used:** " + n
    with open(fp, "w", encoding="utf-8") as f: f.write(c)

# ==================== 工具函数 ====================

def _now(): return datetime.now().strftime("%Y-%m-%d %H:%M")
def _new_id(): return int(time.time() * 10)

def _read_all_learner():
    items = []
    for cat, (_, dp, emoji) in TYPE_MAP.items():
        if not os.path.isdir(dp): continue
        for fn in sorted(os.listdir(dp)):
            if not fn.endswith(".md"): continue
            with open(os.path.join(dp, fn), "r", encoding="utf-8") as f:
                fc = f.read()
            items.append({"id": fn.replace(".md",""), "cat": cat, "emoji": emoji,
                "title": fc.strip().split("\n")[0].replace("# ",""), "content": fc, "path": os.path.join(dp, fn)})
    return items

def _read_all_memory():
    if not MEMORY_DIR or not os.path.isdir(MEMORY_DIR): return []
    items = []
    for fn in os.listdir(MEMORY_DIR):
        if not fn.endswith(".md") or fn == "MEMORY.md": continue
        with open(os.path.join(MEMORY_DIR, fn), "r", encoding="utf-8") as f:
            fc = f.read()
        dm = re.search(r'description:\s*(.*)', fc)
        tm = re.search(r'type:\s*(\w+)', fc)
        t = dm.group(1).strip() if dm else fn.replace(".md","")
        mt = tm.group(1) if tm else "reference"
        emojis = {"reference":"💡","user":"🎯","feedback":"📝","project":"⚙️"}
        items.append({"id": fn.replace(".md",""), "cat": MEMORY_TO_LEARNER_TYPE.get(mt,"fact"),
            "emoji": emojis.get(mt,"📄"), "title": t, "content": fc, "path": os.path.join(MEMORY_DIR, fn), "memory_type": mt})
    return items

def _read_all(): return _read_all_learner() + _read_all_memory()

def _search(query):
    r, q = [], query.lower()
    for item in _read_all():
        s = 0
        if q in item["title"].lower(): s += 3
        if q in item["content"].lower(): s += item["content"].lower().count(q)
        if s > 0: r.append((s, item))
    r.sort(key=lambda x: -x[0])
    return r

def _guess_tags(content):
    tm = {"python":["python","py"],"vscode":["vscode","vs code","visual studio"],
        "claude":["claude","anthropic"],"git":["git","github","repo"],
        "docker":["docker","container"],"vpn":["vpn","代理","proxy"],
        "api":["api","接口","endpoint"],"前端":["前端","html","css","js","vue","react"],
        "配置":["配置","config","settings","setup","安装","install"],
        "设计":["设计","ui","ux","design","样式","theme"],
        "自动化":["自动化","auto","自动","批量","脚本"],
        "网络":["网络","network","proxy","7892"],"cc-switch":["cc-switch","ccswitch"],
        "headroom":["headroom"],"插件":["插件","plugin"]}
    cl = content.lower()
    matched = [tag for tag, kws in tm.items() if any(kw in cl for kw in kws)]
    return ",".join(matched[:3]) if matched else "一般"

# ==================== 核心命令 ====================

def cmd_save(content, category="fact", tag=None, why="", how=""):
    print("检查重复...")
    dupes = _find_duplicates(content, category)
    if dupes:
        bs, bid, bcat, btitle, bpath = dupes[0]
        if bs > 0.7:
            print("  已存在相似（" + str(int(bs*100)) + "%）: " + btitle[:50])
            return bid

    kid = _new_id()
    emoji = TYPE_MAP[category][2] if category in TYPE_MAP else "💡"
    dp = TYPE_MAP[category][1] if category in TYPE_MAP else LESSONS_DIR
    with open(os.path.join(dp, str(kid)+".md"), "w", encoding="utf-8") as f:
        f.write("# " + emoji + " " + content + "\n\n- **ID**: " + str(kid) + "\n- **类型**: " + category + "\n- **标签**: " + (tag or "无") + "\n- **创建**: " + _now() + "\n- **最后使用**: " + _now() + "\n")
        if why: f.write("- **Why**: " + why + "\n")
        if how: f.write("- **How**: " + how + "\n")
    with open(JOURNAL_PATH, "a", encoding="utf-8") as f:
        f.write("- [" + _now() + "] [" + category + "] [" + (tag or "无") + "] " + content + " (id:" + str(kid) + ")\n")
    print("[learner] 已保存 (id:" + str(kid) + "): " + content[:60])
    mt = LEARNER_TO_MEMORY_TYPE.get(category, "reference")
    slug = _save_to_memory(content, mt, why, how, tag or "")
    if slug: print("[memory] 已同步 -> " + slug + ".md")
    return kid

def cmd_auto(text):
    fds = _ai_extract(text)
    if fds:
        print("AI 识别到 " + str(len(fds)) + " 个知识点：\n")
        sc = 0
        for i, f in enumerate(fds, 1):
            cat = f.get("type","fact"); c = f.get("content",""); conf = f.get("confidence",0)
            why = f.get("why",""); how = f.get("how","")
            cn = {"fact":"💡事实","preference":"🎯偏好","skill":"⚙️技能"}
            bar = "█" * int(conf*10) + "░" * (10-int(conf*10))
            print("  [" + str(i) + "] " + cn.get(cat,"?") + " [" + bar + "] " + str(int(conf*100)) + "%")
            print("      " + c)
            if conf >= 0.8:
                cmd_save(c, cat, why=why, how=how); sc += 1
            else: print("      置信度不足")
            print()
        if sc > 0: print("自动保存 " + str(sc) + " 条")
        return
    # 回退正则
    print("  切换正则模式...")
    AP = {
        "preference": [
            (r"(?:我|用户)(?:喜欢|偏爱|习惯用|习惯|推荐|倾向于)\s*(.*?)(?:[。，；\n])", 0.9),
            (r"(?:最好|应该|建议)\s*(?:用|使用|采用|选)\s*(.*?)(?:[。，；\n])", 0.75),
            (r"以后都用\s*(.*?)(?:[。，；\n])", 0.9),
            (r"(?:都用|都用的是|一般用|通常用)\s*(.*?)(?:[。，；\n来])", 0.8),
        ],
        "fact": [
            (r"(?:我|我们|用户)(?:用的是|在用|使用|安装了|装了|有)\s*(.*?)(?:[。，；\n])", 0.7),
            (r"(?:路径|地址|目录|端口|URL|网址)为?\s*[：:是为]\s*(.*?)(?:[。，；\n])", 0.9),
        ],
        "skill": [
            (r"(?:步骤|流程|方法|方案|策略)[：:是为]\s*(.*?)(?:[。\n])", 0.9),
            (r"每次\s*(.*?)(?:就|都|先|再)[^。]*", 0.7),
        ],
    }
    print("正则扫描...\n")
    fds = []
    seen = set()
    for cat, pats in AP.items():
        for pat, conf in pats:
            for m in re.finditer(pat, text):
                key = m.group(0).strip()[:30]
                if key in seen: continue
                seen.add(key)
                core = (m.group(1) if m.groups() else m.group(0)).strip()
                core = re.sub(r'[。，；！？、\n\r]+$', '', core)
                if len(core) >= 4: fds.append({"cat":cat,"content":core,"confidence":conf})
    dedup = []
    seen_c = set()
    for f in sorted(fds, key=lambda x: -x["confidence"]):
        if f["content"] not in seen_c:
            seen_c.add(f["content"]); dedup.append(f)
    if not dedup: print("无结果"); return
    sc = 0
    for i, f in enumerate(dedup, 1):
        print("  [" + str(i) + "] [" + str(int(f['confidence']*100)) + "%] " + f['content'][:80])
        if f["confidence"] >= 0.8:
            d = _find_duplicates(f["content"], f["cat"])
            if not d or d[0][0] < 0.6: cmd_save(f["content"], f["cat"]); sc += 1
            else: print("      重复跳过")
        print()
    if sc > 0: print("保存 " + str(sc) + " 条（正则）")

def cmd_recall(query):
    r = _search(query)
    if not r: print("未找到"); return
    print("找到 " + str(len(r)) + " 条相关记忆：\n")
    lr = [x for x in r if "learner" in x[1]["path"]]
    mr = [x for x in r if "memory" in x[1]["path"]]
    if lr:
        print("[Learner]:")
        for s, item in lr[:5]:
            print("  " + item['emoji'] + " [" + item['cat'] + "] " + item['title'][:60])
            print("      id:" + str(item['id']))
        print()
    if mr:
        print("[Memory]:")
        for s, item in mr[:5]:
            print("  " + item['emoji'] + " " + item['title'][:60])
            print("      file:" + str(item['id']) + ".md")
            _increment_usage(item["id"])
        print()
    print("learner " + str(len(lr)) + " + memory " + str(len(mr)))

def cmd_migrate():
    if not MEMORY_DIR: print("不可用"); return
    print("迁移旧数据到 Claude memory...\n")
    migrated = 0; skipped = 0
    for item in _read_all_learner():
        t = re.sub(r'^[^\w\u4e00-\u9fff]+', '', item["title"]).strip()
        if not t: continue
        d = _find_duplicates(t)
        if any("memory" in x[4] for x in d):
            skipped += 1; continue
        mt = LEARNER_TO_MEMORY_TYPE.get(item["cat"], "reference")
        if _save_to_memory(t, mt):
            migrated += 1; print("  [" + item['cat'] + "] " + t[:50])
    print("\n迁移 " + str(migrated) + " 条, 跳过 " + str(skipped))

def cmd_analyze():
    print("模式挖掘分析\n")
    ai = _read_all(); total = len(ai)
    if not ai: print("空"); return
    cc, tc = {}, {}
    for item in ai:
        cc[item["cat"]] = cc.get(item["cat"],0)+1
        m = re.search(r'\*\*Tags?[：:]\s*(\S+)', item["content"])
        if m:
            for t in m.group(1).split(","):
                t = t.strip()
                if t and t != "一般": tc[t] = tc.get(t,0)+1
    print("总量: " + str(total) + "  |  事实:" + str(cc.get('fact',0)) + "  偏好:" + str(cc.get('preference',0)) + "  技能:" + str(cc.get('skill',0)))
    if tc:
        top = sorted(tc.items(), key=lambda x: -x[1])[:5]
        print("热门: " + ", ".join("#" + t + "(" + str(c) + ")" for t,c in top))
    if cc.get("skill",0) == 0: print("\n盲区: 无技能记录")
    if cc.get("preference",0) == 0: print("盲区: 无偏好记录")

def cmd_stats():
    al = _read_all_learner(); am = _read_all_memory()
    total = len(al) + len(am)
    print("学习统计\n  总知识: " + str(total) + "\n  Learner: " + str(len(al)) + "  Memory: " + str(len(am)))

# ==================== 图谱（保留）====================

def _load_graph():
    if os.path.exists(GRAPH_PATH):
        try: return json.load(open(GRAPH_PATH, 'r', encoding='utf-8'))
        except: pass
    return {"nodes": {}, "edges": []}

def _save_graph(g): json.dump(g, open(GRAPH_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

def _add_to_graph(kid, content, cat, tags):
    g = _load_graph()
    g["nodes"][str(kid)] = {"content": content[:50], "type": cat, "tags": tags or "", "created": _now()}
    _save_graph(g)

def _auto_link_new(kid, content, cat):
    for item in _read_all_learner():
        if item["id"] == kid: continue
        s = _similarity(content, item["title"])
        if s > 0.4: _relate_knowledge(kid, item["id"], int(s*10))

def _relate_knowledge(k1, k2, st=1):
    g = _load_graph()
    for e in g["edges"]:
        if set(e["nodes"]) == {str(k1), str(k2)}:
            e["strength"] += st; _save_graph(g); return
    g["edges"].append({"nodes": [str(k1), str(k2)], "strength": st, "created": _now()})
    _save_graph(g)

def _show_graph(tag=None):
    g = _load_graph(); nodes = g.get("nodes",{}); edges = g.get("edges",[])
    if not nodes: print("空"); return
    print("知识图谱: " + str(len(nodes)) + " 节点, " + str(len(edges)) + " 连接\n")
    if tag:
        nodes = {k:v for k,v in nodes.items() if tag in v.get("tags","")}
        if not nodes: print("无 #" + tag); return
    ec = {}
    for e in edges:
        for n in e["nodes"]:
            if n in nodes: ec[n] = ec.get(n,0)+1
    if ec:
        for k,c in sorted(ec.items(), key=lambda x:-x[1])[:5]:
            i = nodes.get(k,{}); em = {"fact":"💡","preference":"🎯","skill":"⚙️"}.get(i.get("type",""),"📄")
            print("  " + em + " [" + k + "] " + i.get("content","?")[:40] + " (" + str(c) + " 连接)")
    else:
        for k,i in nodes.items():
            em = {"fact":"💡","preference":"🎯","skill":"⚙️"}.get(i.get("type",""),"📄")
            print("  " + em + " [" + k + "] " + i.get("content","?")[:50])

def _show_relate(kid):
    g = _load_graph(); nodes = g.get("nodes",{}); edges = g.get("edges",[])
    if str(kid) not in nodes: print("未找到 " + str(kid)); return
    i = nodes[str(kid)]
    em = {"fact":"💡","preference":"🎯","skill":"⚙️"}.get(i.get("type",""),"📄")
    print(em + " [" + str(kid) + "] " + i.get("content","?"))
    print("  标签: " + i.get("tags","无") + "  创建: " + i.get("created","?"))
    rel = []
    for e in edges:
        if str(kid) in e["nodes"]:
            o = e["nodes"][0] if e["nodes"][1]==str(kid) else e["nodes"][1]
            if o in nodes: rel.append((e.get("strength",1), o, nodes[o]))
    if rel:
        for st, oid, oi in sorted(rel, key=lambda x:-x[0]):
            bar = "█" * min(st,10)
            em2 = {"fact":"💡","preference":"🎯","skill":"⚙️"}.get(oi.get("type",""),"📄")
            print("  " + em2 + " [" + oid + "] " + oi.get("content","?")[:50] + " [" + bar + "]")
    else: print("  无关联")

def _link_manual(k1, k2):
    g = _load_graph(); nodes = g.get("nodes",{})
    if str(k1) not in nodes: print("未找到 " + str(k1)); return
    if str(k2) not in nodes: print("未找到 " + str(k2)); return
    _relate_knowledge(k1, k2)
    print("已关联: " + nodes[str(k1)].get("content","?")[:20] + " <-> " + nodes[str(k2)].get("content","?")[:20])

def _forget(kid):
    for _, dp, _ in TYPE_MAP.values():
        fp = os.path.join(dp, str(kid)+".md")
        if os.path.exists(fp):
            os.remove(fp)
            g = _load_graph()
            if str(kid) in g.get("nodes",{}): del g["nodes"][str(kid)]
            g["edges"] = [e for e in g.get("edges",[]) if str(kid) not in e["nodes"]]
            _save_graph(g)
            print("已删除 id:" + str(kid)); return
    print("未找到 id:" + str(kid))

def _list(category=None):
    items = []
    for cat in ([category] if category else ["fact","preference","skill"]):
        if cat not in TYPE_MAP: continue
        _, dp, emoji = TYPE_MAP[cat]
        if not os.path.isdir(dp): continue
        for fn in sorted(os.listdir(dp), reverse=True):
            if not fn.endswith(".md"): continue
            with open(os.path.join(dp, fn), "r", encoding="utf-8") as f:
                fc = f.read()
            items.append((fn.replace(".md",""), cat, emoji, fc.strip().split("\n")[0].replace("# ","")))
    return items

# ==================== 主入口 ====================

def main():
    if len(sys.argv) < 2: print(__doc__); return
    cmd = sys.argv[1]

    if cmd == "save":
        if len(sys.argv) < 3:
            print("用法: python learn.py save <内容> [--type fact|preference|skill] [--tag 标签] [--why 原因] [--how 用法]")
            return
        content = sys.argv[2]; category = "fact"; tag = None; why = ""; how = ""
        for i, a in enumerate(sys.argv[3:], 3):
            if a == "--type" and i+1 < len(sys.argv): category = sys.argv[i+1]
            elif a == "--tag" and i+1 < len(sys.argv): tag = sys.argv[i+1]
            elif a == "--why" and i+1 < len(sys.argv): why = sys.argv[i+1]
            elif a == "--how" and i+1 < len(sys.argv): how = sys.argv[i+1]
        if category not in TYPE_MAP: print("未知类型"); return
        if tag is None: tag = _guess_tags(content)
        cmd_save(content, category, tag, why, how)

    elif cmd == "auto":
        if len(sys.argv) < 3: print("用法: python learn.py auto <对话文本>"); return
        cmd_auto(sys.argv[2])

    elif cmd == "recall":
        if len(sys.argv) < 3: print("用法: python learn.py recall <关键词>"); return
        cmd_recall(sys.argv[2])

    elif cmd == "analyze": cmd_analyze()
    elif cmd == "migrate": cmd_migrate()
    elif cmd == "bridge": cmd_migrate();

    elif cmd == "stats": cmd_stats()

    elif cmd == "decay":
        days = 60
        for i, a in enumerate(sys.argv[2:], 2):
            if a == "--days" and i+1 < len(sys.argv):
                try: days = int(sys.argv[i+1])
                except: pass
        ai = _read_all()
        if not ai: print("空"); return
        now = datetime.now()
        fresh, stale = [], []
        for item in ai:
            m = re.search(r'(?:\*\*Last used:\*\*|\*\*最后使用\*\*)[：:]\s*(.*)', item["content"])
            u = m.group(1).strip() if m else None
            if not u:
                m2 = re.search(r'(?:\*\*创建\*\*|created)[：:]\s*(.*)', item["content"])
                u = m2.group(1).strip() if m2 else None
            if u:
                try:
                    ud = datetime.strptime(u.strip()[:16], "%Y-%m-%d %H:%M")
                    if (now-ud).days < days: fresh.append(((now-ud).days, item))
                    else: stale.append(((now-ud).days, item))
                except: pass
        print("衰减检查（" + str(days) + "天）: 新鲜 " + str(len(fresh)) + " | 过时 " + str(len(stale)))
        if stale:
            for d, item in sorted(stale, key=lambda x:-x[0])[:5]:
                src = "memory" if "memory" in item["path"] else "learner"
                print("  " + src + " " + item['title'][:40] + " - " + str(d) + " 天未用")

    elif cmd == "graph":
        tag = None
        for i, a in enumerate(sys.argv[2:], 2):
            if a == "--tag" and i+1 < len(sys.argv): tag = sys.argv[i+1]
        _show_graph(tag)

    elif cmd == "relate":
        if len(sys.argv) < 3: print("用法: python learn.py relate <id>"); return
        _show_relate(sys.argv[2])

    elif cmd == "link":
        if len(sys.argv) < 4: print("用法: python learn.py link <id1> <id2>"); return
        _link_manual(sys.argv[2], sys.argv[3])

    elif cmd == "forget":
        if len(sys.argv) < 3: print("用法: python learn.py forget <id>"); return
        _forget(sys.argv[2])

    elif cmd == "list":
        category = None
        for i, a in enumerate(sys.argv[2:], 2):
            if a == "--type" and i+1 < len(sys.argv): category = sys.argv[i+1]
        items = _list(category)
        if items:
            print("共 " + str(len(items)) + " 条：\n")
            for k, c, e, t in items: print("  " + e + " [" + k + "] " + t)
        else: print("空")

    elif cmd == "search":
        if len(sys.argv) < 3: print("用法: python learn.py search <关键词>"); return
        r = _search(sys.argv[2])
        if r:
            print("找到 " + str(len(r)) + " 条：\n")
            for i, (s, item) in enumerate(r[:10], 1):
                src = "memory" if "memory" in item["path"] else "learner"
                print("  " + str(i) + ". " + src + " " + item['emoji'] + " [" + item['cat'] + "] " + item['title'])
        else: print("无")

    elif cmd == "journal":
        if os.path.exists(JOURNAL_PATH):
            c = open(JOURNAL_PATH, "r", encoding="utf-8").read()
            if c.strip(): print(c.strip()); return
        print("空")

    else:
        print("未知命令: " + cmd)
        print(__doc__)

if __name__ == "__main__":
    main()
