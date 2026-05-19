import asyncio
import logging
import requests
from bs4 import BeautifulSoup
import re
import schedule
import time
import threading
import json
import os
from datetime import datetime
from telegram import Bot
from telegram.ext import Application, CommandHandler, ContextTypes
from telegram.constants import ParseMode

# ═══════════════════════════════════════════════════
#  CONFIGURACIÓN (Variables de Entorno)
# ═══════════════════════════════════════════════════

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_ID = os.getenv("CHANNEL_ID")

if not BOT_TOKEN or not CHANNEL_ID:
    raise ValueError("Faltan BOT_TOKEN o CHANNEL_ID en variables de entorno")

DEFAULT_QUERY = os.getenv("DEFAULT_QUERY", "pussy")
DEFAULT_INTERVAL_MINUTES = int(os.getenv("DEFAULT_INTERVAL_MINUTES", "15"))

DATA_FILE = "/data/xnxx_bot_data.json"  # Ruta persistente en Render

# ═══════════════════════════════════════════════════

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO
)
log = logging.getLogger(__name__)

# Estado global
state = {
    "query": DEFAULT_QUERY,
    "interval_minutes": DEFAULT_INTERVAL_MINUTES,
    "active": False,
    "last_post": None,
    "total_posts": 0,
}

_bot_instance: Bot = None
posted_urls = set()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0"
}

# Crear carpeta de datos si no existe
os.makedirs("/data", exist_ok=True)

# ═══════════════════════════════════════════════════
#  PERSISTENCIA
# ═══════════════════════════════════════════════════

def load_data():
    global posted_urls, state
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            posted_urls = set(data.get("posted_urls", []))
            state.update({
                "query": data.get("query", DEFAULT_QUERY),
                "interval_minutes": data.get("interval_minutes", DEFAULT_INTERVAL_MINUTES),
                "total_posts": data.get("total_posts", 0),
                "last_post": data.get("last_post"),
            })
            log.info(f"✅ Datos cargados: {len(posted_urls)} URLs | {state['total_posts']} posts")
        except Exception as e:
            log.error(f"Error cargando datos: {e}")
    else:
        log.info("📁 Iniciando desde cero.")

def save_data():
    try:
        data = {
            "posted_urls": list(posted_urls),
            "query": state["query"],
            "interval_minutes": state["interval_minutes"],
            "total_posts": state["total_posts"],
            "last_post": state["last_post"],
        }
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        log.error(f"Error guardando datos: {e}")

# ═══════════════════════════════════════════════════
#  FUNCIONES XNXX (sin cambios importantes)
# ═══════════════════════════════════════════════════

def search_xnxx(query: str, limit: int = 8):
    try:
        url = f"https://www.xnxx.com/search/{requests.utils.quote(query)}"
        res = requests.get(url, headers=HEADERS, timeout=30)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, "html.parser")

        results = []
        seen = set()

        for link in soup.select("a[href^='/video-']"):
            href = link.get("href", "")
            if not href or href in seen:
                continue
            full_url = "https://www.xnxx.com" + href
            title = link.get_text(strip=True) or "XNXX Video"
            if len(title) < 15:
                title = full_url.split('/')[-1].replace('-', ' ').title()

            results.append({"title": title[:180], "link": full_url})
            seen.add(href)
            if len(results) >= limit:
                break

        log.info(f"✅ Encontrados {len(results)} videos para '{query}'")
        return results
    except Exception as e:
        log.error(f"Error en búsqueda: {e}")
        return []


def get_direct_video_url(page_url: str):
    try:
        res = requests.get(page_url, headers=HEADERS, timeout=35)
        text = res.text
        soup = BeautifulSoup(text, "html.parser")

        title = soup.select_one('meta[property="og:title"]')
        title = (title["content"].replace(" - XNXX.COM", "").strip() 
                if title else "XNXX Video")

        video_url = None
        patterns = [
            r"setVideoUrlHigh\(['\"](.*?)['\"]",
            r"setVideoUrlLow\(['\"](.*?)['\"]",
            r"(https?://[^\s'\"]+\.mp4[^\s'\"]*)",
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                video_url = match.group(1)
                if video_url.startswith('//'):
                    video_url = 'https:' + video_url
                if '.mp4' in video_url.lower():
                    break

        return {"title": title[:200], "video_url": video_url, "page_url": page_url}
    except Exception as e:
        log.error(f"Error extrayendo {page_url}: {e}")
        return None


# ═══════════════════════════════════════════════════
#  PUBLICACIÓN
# ═══════════════════════════════════════════════════

async def publish_now(bot: Bot, query: str) -> bool:
    log.info(f"📤 Publicando: {query}")
    results = search_xnxx(query)
    if not results:
        return False

    for video in results:
        if video["link"] in posted_urls:
            continue

        info = get_direct_video_url(video["link"])
        if not info or not info.get("video_url"):
            time.sleep(2)
            continue

        caption = (
            f"🔥 **{info['title']}**\n\n"
            f"🕒 {datetime.now().strftime('%d/%m/%Y')}\n"
            f"🔗 https://youtube.com/@loveclubyt"
        )

        try:
            await bot.send_video(
                chat_id=CHANNEL_ID,
                video=info["video_url"],
                caption=caption,
                parse_mode=ParseMode.MARKDOWN,
                supports_streaming=True,
                read_timeout=120,
                write_timeout=120,
                connect_timeout=60
            )
            
            posted_urls.add(video["link"])
            state["last_post"] = datetime.now().strftime("%d/%m/%Y %H:%M")
            state["total_posts"] += 1
            save_data()
            
            log.info("✅ Video publicado")
            return True

        except Exception as e:
            log.error(f"Error enviando video: {e}")
            time.sleep(3)
            continue

    return False


# ═══════════════════════════════════════════════════
#  SCHEDULER
# ═══════════════════════════════════════════════════

def _run_sync():
    if not state["active"] or _bot_instance is None:
        return
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(publish_now(_bot_instance, state["query"]))
    except Exception as e:
        log.error(f"Error en _run_sync: {e}")
    finally:
        loop.close()


def start_scheduler():
    schedule.clear()
    minutes = max(1, state["interval_minutes"])
    schedule.every(minutes).minutes.do(_run_sync)
    log.info(f"⏰ Scheduler: cada {minutes} minutos | Query: {state['query']}")


def _scheduler_loop():
    while True:
        schedule.run_pending()
        time.sleep(10)


# ═══════════════════════════════════════════════════
#  COMANDOS
# ═══════════════════════════════════════════════════

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🔥 **XNXX Auto-Bot 2026** listo en Render!", parse_mode=ParseMode.MARKDOWN)

# ... (mantengo los demás comandos igual: post, autopost, setquery, setinterval, status, stop)

# (El resto de comandos se mantienen igual que en tu código original)

def main():
    print("🔥 XNXX Auto-Bot 2026 - Iniciado en Render")
    load_data()

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("post", cmd_post))
    app.add_handler(CommandHandler("autopost", cmd_autopost))
    app.add_handler(CommandHandler("setquery", cmd_setquery))
    app.add_handler(CommandHandler("setinterval", cmd_setinterval))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("stop", cmd_stop))

    # Iniciar scheduler si estaba activo
    if state.get("active"):
        global _bot_instance
        _bot_instance = Bot(token=BOT_TOKEN)
        start_scheduler()
        threading.Thread(target=_scheduler_loop, daemon=True, name="xnxx_scheduler").start()

    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()