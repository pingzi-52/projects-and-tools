# -*- coding: utf-8 -*-
"""工具模块入口 - 收集所有工具定义和分派函数"""
import json
import sys
import os

# 确保 tools 目录在路径中
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, os.path.dirname(_THIS_DIR))

from tools import basic, file_tools, web_tools, ai_tools, data_tools, util_tools

# 所有工具模块列表（按此顺序分派）
MODULES = [basic, file_tools, web_tools, ai_tools, data_tools, util_tools]

# 合并所有工具定义
ALL_TOOLS = []
for mod in MODULES:
    ALL_TOOLS.extend(mod.TOOLS)


def execute_tool(tool_name, args):
    """执行工具调用 - 分派给各模块

    参数:
        tool_name: 工具名称字符串
        args: 参数字典

    返回:
        JSON 字符串（与旧版 execute_tool 保持完全兼容）
    """
    for mod in MODULES:
        result = mod.execute(tool_name, args)
        if result is not None:
            return result
    return json.dumps({"error": "未知工具: " + str(tool_name)}, ensure_ascii=False)
