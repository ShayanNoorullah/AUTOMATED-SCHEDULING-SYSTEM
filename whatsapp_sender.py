"""WhatsApp Web automation — opens a chat (by group name or phone) and sends a message.

Kept separate from the web app so the storage layer can evolve independently.
`log` is a callback receiving strings like "info:...", "success:...", "error:...".
"""
import os, time


def send_to_target(target_name, message, headless=False, phone=None, log=print):
    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.keys import Keys
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        import pyperclip
    except ImportError as e:
        log(f"error:Missing dependency: {e}")
        return False

    base = os.path.dirname(os.path.abspath(__file__))
    session_dir = os.path.join(base, "whatsapp_session")
    debug_dir = os.path.join(base, "debug")
    os.makedirs(session_dir, exist_ok=True)
    os.makedirs(debug_dir, exist_ok=True)

    options = uc.ChromeOptions()
    options.add_argument(f"--user-data-dir={session_dir}")
    options.add_argument("--profile-directory=Default")
    if headless:
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1280,900")

    def save_debug(driver, label):
        try:
            driver.save_screenshot(os.path.join(debug_dir, f"{label}.png"))
        except Exception:
            pass

    def wait_app_ready(driver, timeout=90):
        end = time.time() + timeout
        while time.time() < end:
            try:
                ready = driver.execute_script("""
                    var hasSide=!!document.getElementById('side');
                    var hasPane=!!document.querySelector('[data-testid="chat-list"]');
                    var hasQR=!!document.querySelector('canvas[aria-label]');
                    var loadingGone=!document.querySelector('progress');
                    return (hasSide||hasPane||hasQR) && loadingGone;
                """)
                if ready:
                    return True
            except Exception:
                pass
            time.sleep(1)
        return False

    def click_use_here(driver):
        try:
            btns = driver.execute_script("""
                return Array.from(document.querySelectorAll('button'))
                    .filter(b => b.innerText.match(/use here|continue|use whatsapp/i));
            """)
            if btns:
                driver.execute_script("arguments[0].click();", btns[0])
                time.sleep(3)
        except Exception:
            pass

    def find_search_box(driver):
        for sel in ['input[aria-label="Search or start a new chat"]', '#side input[type="text"]',
                    '#side input', 'input[data-tab="3"]', '[role="textbox"][data-tab="3"]',
                    '#side div[contenteditable="true"]', 'div[contenteditable="true"][data-tab="3"]']:
            try:
                els = driver.find_elements(By.CSS_SELECTOR, sel)
                if els:
                    return els[0]
            except Exception:
                pass
        return None

    def find_message_box(driver):
        for sel in ['footer div[contenteditable="true"]', 'div[contenteditable="true"][data-tab="10"]',
                    'div[aria-label="Type a message"]', 'footer [role="textbox"]',
                    'footer input', 'footer textarea']:
            try:
                els = driver.find_elements(By.CSS_SELECTOR, sel)
                if els:
                    return els[0]
            except Exception:
                pass
        return None

    def open_chat_by_name(driver, name):
        search_el = find_search_box(driver)
        if not search_el:
            log(f"error:[{name}] Search box not found.")
            return False
        search_el.click(); time.sleep(0.5)
        search_el.send_keys(Keys.CONTROL + "a"); search_el.send_keys(Keys.DELETE); time.sleep(0.2)
        for ch in name:
            search_el.send_keys(ch); time.sleep(0.05)
        time.sleep(2.5)
        try:
            span = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, f'//span[@title="{name}"]')))
            driver.execute_script("""
                var s=arguments[0];
                var row=s.closest('[role="listitem"]')||s.closest('[role="row"]')||
                        s.closest('div[tabindex]')||s.closest('div[data-testid]')||
                        s.parentElement.parentElement.parentElement;
                row.click();
            """, span)
            time.sleep(2.5)
            if find_message_box(driver):
                return True
            search_el.send_keys(Keys.ENTER); time.sleep(2.5)
            return True
        except Exception as ex:
            log(f"error:[{name}] Group not found in results: {ex}")
            return False

    def send_message(driver, msg):
        box = None
        for _ in range(12):
            box = find_message_box(driver)
            if box:
                break
            time.sleep(0.5)
        if not box:
            log("error:Message box not found.")
            return False
        box.click(); time.sleep(0.3)
        pyperclip.copy(msg)
        box.send_keys(Keys.CONTROL, "v"); time.sleep(0.8)
        box.send_keys(Keys.ENTER); time.sleep(2)
        return True

    driver = None
    try:
        driver = uc.Chrome(options=options, use_subprocess=True, version_main=148)
        log(f"info:Opening WhatsApp Web for [{target_name}]…")
        driver.get("https://web.whatsapp.com")

        log(f"info:[{target_name}] Waiting for WhatsApp to load (scan QR if prompted)…")
        if not wait_app_ready(driver, timeout=90):
            save_debug(driver, "failed_load")
            log(f"error:[{target_name}] WhatsApp did not load in 90 seconds.")
            return False

        time.sleep(2)
        click_use_here(driver)

        if phone:
            digits = "".join(ch for ch in str(phone) if ch.isdigit())
            log(f"info:[{target_name}] Opening direct chat (+{digits})…")
            driver.get(f"https://web.whatsapp.com/send?phone={digits}")
            time.sleep(6)
            click_use_here(driver)
        else:
            log(f"info:[{target_name}] Opening chat…")
            if not open_chat_by_name(driver, target_name):
                save_debug(driver, "failed_search")
                return False

        log(f"info:[{target_name}] Sending message…")
        if not send_message(driver, message):
            save_debug(driver, "failed_send")
            log(f"error:[{target_name}] Could not send message.")
            return False

        log(f"success:✓ Sent to [{target_name}]")
        return True
    except Exception as e:
        if driver:
            save_debug(driver, "exception")
        log(f"error:✗ [{target_name}] {type(e).__name__}: {e}")
        return False
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
