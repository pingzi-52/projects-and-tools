# -*- coding: utf-8 -*-
"""
文件处理工具模块
工具列表: read_file, write_file, read_excel, read_pdf, read_docx, compress_image, batch_rename, text_replace
"""
import json
import os
import re as _re

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取本地文件内容（txt/csv/json等文本文件）",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "文件路径，如 C:/data/report.csv"}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "写内容到本地文件",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "保存路径"},
                    "content": {"type": "string", "description": "文件内容"}
                },
                "required": ["file_path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_excel",
            "description": "读取Excel文件（.xlsx）的内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Excel文件路径"}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_pdf",
            "description": "提取PDF文件的文字内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "PDF文件路径"}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_docx",
            "description": "读取Word文档（.docx）的内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Word文件路径"}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compress_image",
            "description": "压缩图片或转换格式，节省存储空间",
            "parameters": {
                "type": "object",
                "properties": {
                    "image_path": {"type": "string", "description": "图片路径"},
                    "quality": {"type": "integer", "description": "压缩质量 1-100，默认60"},
                    "max_width": {"type": "integer", "description": "最大宽度，默认1024"},
                    "output_format": {"type": "string", "description": "输出格式，如 jpg, png, webp"}
                },
                "required": ["image_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "batch_rename",
            "description": "批量重命名文件，支持替换文字或加前辍",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "文件所在目录"},
                    "pattern": {"type": "string", "description": "匹配的文件名模式，如 *.txt, *.py"},
                    "find": {"type": "string", "description": "要替换的文字（留空则加前辍）"},
                    "replace": {"type": "string", "description": "替换后的文字（留空则删除find文字）"},
                    "prefix": {"type": "string", "description": "加在文件名前面的前辍（当find为空时生效）"}
                },
                "required": ["directory", "pattern"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "text_replace",
            "description": "批量替换文件中的文字内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "搜索目录"},
                    "file_pattern": {"type": "string", "description": "文件匹配模式，如 *.py, *.txt"},
                    "find": {"type": "string", "description": "要查找的文字"},
                    "replace": {"type": "string", "description": "替换成的文字"}
                },
                "required": ["directory", "file_pattern", "find", "replace"]
            }
        }
    },
]


def execute(tool_name, args):
    """执行本模块的工具"""
    if tool_name == "read_file":
        try:
            fp = args.get("file_path", "").replace("\\", "/")
            if not os.path.exists(fp):
                return json.dumps({"error": "文件不存在: " + fp}, ensure_ascii=False)
            with open(fp, "rb") as f:
                raw = f.read()
            try:
                text = raw.decode("utf-8")
            except:
                text = raw.decode("gbk", errors="replace")
            max_len = 3000
            if len(text) > max_len:
                text = text[:max_len] + "\n...（文件共" + str(len(text)) + "字符，截断显示）"
            return json.dumps({"filename": os.path.basename(fp), "content": text}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "读文件失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "write_file":
        try:
            fp = args.get("file_path", "").replace("\\", "/")
            content = args.get("content", "")
            os.makedirs(os.path.dirname(fp) if os.path.dirname(fp) else ".", exist_ok=True)
            with open(fp, "w", encoding="utf-8") as f:
                f.write(content)
            return json.dumps({"success": True, "file": fp, "size": len(content)}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "写文件失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "read_excel":
        try:
            from openpyxl import load_workbook
            fp = args.get("file_path", "").replace("\\", "/")
            wb = load_workbook(fp, read_only=True)
            sheets = wb.sheetnames
            result = {"file": fp, "sheets": sheets, "data": {}}
            for name in sheets[:3]:
                ws = wb[name]
                rows = []
                for i, row in enumerate(ws.iter_rows(values_only=True)):
                    if i >= 50:
                        break
                    rows.append(list(row))
                result["data"][name] = {"rows": rows, "total_rows_in_sheet": ws.max_row}
            wb.close()
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "read_pdf":
        try:
            from PyPDF2 import PdfReader
            fp = args.get("file_path", "").replace("\\", "/")
            reader = PdfReader(fp)
            pages = []
            for i, page in enumerate(reader.pages):
                pages.append({"page": i + 1, "text": page.extract_text()[:2000]})
                if i >= 10:
                    break
            return json.dumps({"file": fp, "total_pages": len(reader.pages), "pages": pages}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "read_docx":
        try:
            from docx import Document
            fp = args.get("file_path", "").replace("\\", "/")
            doc = Document(fp)
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()][:100]
            text = "\n".join(paragraphs)
            if len(text) > 5000:
                text = text[:5000] + "\n...（截断）"
            return json.dumps({"file": fp, "total_paragraphs": len(doc.paragraphs), "content": text}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "compress_image":
        try:
            from PIL import Image
            img_path = args.get("image_path", "").replace("\\", "/")
            quality = args.get("quality", 60)
            max_width = args.get("max_width", 1024)
            output_format = args.get("output_format", "")
            if not os.path.exists(img_path):
                return json.dumps({"error": "文件不存在: " + img_path}, ensure_ascii=False)
            img = Image.open(img_path)
            w, h = img.size
            if max_width and w > max_width:
                scale = max_width / w
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            ext = output_format.lower() if output_format else os.path.splitext(img_path)[1].lstrip(".")
            out_path = os.path.splitext(img_path)[0] + "_compressed." + ext
            img.save(out_path, quality=quality, optimize=True)
            old_size = os.path.getsize(img_path)
            new_size = os.path.getsize(out_path)
            ratio = str(int(new_size / old_size * 100)) + "%"
            return json.dumps({"file": out_path, "old_size": old_size, "new_size": new_size, "ratio": ratio}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    elif tool_name == "batch_rename":
        try:
            import fnmatch as _fnmatch
            directory = args.get("directory", "").replace("\\", "/")
            pattern = args.get("pattern", "*")
            find_text = args.get("find", "")
            replace_text = args.get("replace", "")
            prefix = args.get("prefix", "")
            if not os.path.isdir(directory):
                return json.dumps({"error": "目录不存在: " + directory}, ensure_ascii=False)
            renamed = []
            for fname in os.listdir(directory):
                fpath = os.path.join(directory, fname)
                if not os.path.isfile(fpath):
                    continue
                if not _fnmatch.fnmatch(fname, pattern):
                    continue
                name, ext = os.path.splitext(fname)
                if find_text:
                    new_name = name.replace(find_text, replace_text)
                elif prefix:
                    new_name = prefix + name
                else:
                    continue
                if new_name == name:
                    continue
                new_fname = new_name + ext
                new_fpath = os.path.join(directory, new_fname)
                if os.path.exists(new_fpath):
                    renamed.append({"old": fname, "new": new_fname, "status": "跳过（已存在）"})
                    continue
                os.rename(fpath, new_fpath)
                renamed.append({"old": fname, "new": new_fname, "status": "成功"})
            return json.dumps({
                "directory": directory,
                "pattern": pattern,
                "renamed_count": len(renamed),
                "files": renamed
            }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "批量重命名失败: " + str(e)}, ensure_ascii=False)

    elif tool_name == "text_replace":
        try:
            import fnmatch as _fnmatch
            directory = args.get("directory", "").replace("\\", "/")
            file_pattern = args.get("file_pattern", "*")
            find_text = args.get("find", "")
            replace_text = args.get("replace", "")
            if not find_text:
                return json.dumps({"error": "查找文字不能为空"}, ensure_ascii=False)
            if not os.path.isdir(directory):
                return json.dumps({"error": "目录不存在: " + directory}, ensure_ascii=False)
            changed = []
            for root, dirs, files in os.walk(directory):
                dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules" and d != "__pycache__"]
                for fname in files:
                    if not _fnmatch.fnmatch(fname, file_pattern):
                        continue
                    fpath = os.path.join(root, fname)
                    try:
                        with open(fpath, "rb") as f:
                            raw = f.read()
                        try:
                            text = raw.decode("utf-8")
                        except:
                            text = raw.decode("gbk", errors="replace")
                        if find_text not in text:
                            continue
                        new_text = text.replace(find_text, replace_text)
                        with open(fpath, "w", encoding="utf-8") as f:
                            f.write(new_text)
                        changed.append({
                            "file": fpath,
                            "count": text.count(find_text)
                        })
                    except:
                        pass
                if len(changed) >= 100:
                    break
            return json.dumps({
                "directory": directory,
                "changed_count": len(changed),
                "files": changed
            }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": "文字替换失败: " + str(e)}, ensure_ascii=False)

    return None
