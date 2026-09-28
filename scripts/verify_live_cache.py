import re
import time
import urllib.request

time.sleep(2)
print(urllib.request.urlopen("https://ssies-schedule.duckdns.org/health", timeout=25).read().decode())
t = urllib.request.urlopen("https://ssies-schedule.duckdns.org/login", timeout=25).read().decode("utf-8", "ignore")
print("cache", re.findall(r"app\.css\?v=[^\"']+", t))
