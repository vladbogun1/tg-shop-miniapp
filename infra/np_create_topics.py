import os
import urllib.request, urllib.parse, json, sys

TOKEN = os.environ.get("BOT_TOKEN", "")
CHAT = "-1004450230956"

def create(name, color):
    data = urllib.parse.urlencode({"chat_id": CHAT, "name": name, "icon_color": color}).encode("utf-8")
    r = json.load(urllib.request.urlopen(f"https://api.telegram.org/bot{TOKEN}/createForumTopic", data=data))
    if r.get("ok"):
        res = r["result"]
        sys.stdout.write(f"{res['message_thread_id']} | {res['name']}\n")
        return res["message_thread_id"]
    sys.stdout.write(f"ERR {r}\n")
    return None

ids = {}
ids["NEW"] = create("\U0001F195 Новые заказы", 7322096)
ids["PROCESSING"] = create("\U0001F6E0 В обработке", 16766590)
ids["SHIPPED"] = create("\U0001F4E6 Отправленные", 13338331)
ids["CLOSED"] = create("✅ Завершённые", 9367192)
ids["REJECTED"] = create("❌ Отклонённые", 16749490)
sys.stdout.write("IDS=" + json.dumps(ids) + "\n")
