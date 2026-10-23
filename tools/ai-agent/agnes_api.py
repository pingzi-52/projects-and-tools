"""
Agnes API 直接调用工具
用法: python agnes_api.py <你的问题>
"""
import urllib.request, json, sys, io
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

API_KEY = os.getenv("API_KEY", "")
PROXY = "http://127.0.0.1:7892"

def call_agnes(prompt, system=None):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body = json.dumps({
        "model": "agnes-2.5-flash",
        "messages": messages,
        "max_tokens": 4096
    }).encode()

    req = urllib.request.Request(
        "https://apihub.agnes-ai.com/v1/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
    )
    req.set_proxy(PROXY, "https")

    resp = urllib.request.urlopen(req, timeout=120)
    data = json.loads(resp.read())
    return data['choices'][0]['message']['content']

if __name__ == "__main__":
    if len(sys.argv) < 2:
        prompt = input("请输入问题: ")
    else:
        prompt = sys.argv[1]

    print(f"\n问: {prompt}\n")
    result = call_agnes(prompt)
    print(f"答: {result}")
