import os
import urllib.request, urllib.parse, json, sys

TOKEN = os.environ.get("BOT_TOKEN", "")
CHAT = "-1004450230956"

data = urllib.parse.urlencode({
    "chat_id": CHAT,
    "name": "\U0001F4AC Сообщения по заказам",
    "icon_color": 13338331,
}).encode("utf-8")
r = json.load(urllib.request.urlopen(f"https://api.telegram.org/bot{TOKEN}/createForumTopic", data=data))
if r.get("ok"):
    sys.stdout.write("CHAT_TOPIC=" + str(r["result"]["message_thread_id"]) + "\n")
else:
    sys.stdout.write("ERR " + str(r) + "\n")
