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
from telegram import Bot, Update
from telegram.ext import Application, CommandHandler, ContextTypes
from telegram.constants import ParseMode

# ═══════════════════════════════════════════════════
#  ✏️  CONFIGURACIÓN — EDITA ESTO
# ═══════════════════════════════════════════════════

BOT_TOKEN       = "8670599725:AAEhZBfjgSwxyFci_BaCUub5Zvqd4n6cRfo"   # ← Cambia
CHANNEL_ID      = "-1003990718761"                                  # ← Cambia

DEFAULT_QUERY   = "pussy"          
DEFAULT_INTERVAL_MINUTES = 15       # ← Intervalo por defecto en MINUTOS enteros (Ej: 15)

DATA_FILE = "xnxx_bot_data.json"   # Archivo de persistencia

# ═══════════════════════════════════════════════════

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO
)
log = logging.getLogger(__name__)

# Estado global
state = {
    "query": DEFAULT_QUERY,
    "interval_minutes": DEFAULT_INTERVAL_MINUTES,  # Guardamos internamente en minutos
    "active": False,
    "last_post": None,
    "total_posts": 0,
}

_bot_instance: Bot = None
posted_urls = set()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0"
}

# ═══════════════════════════════════════════════════
#  PERSISTENCIA (JSON)
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
            log.info(f"✅ Datos cargados: {len(posted_urls)} URLs posteadas | {state['total_posts']} posts totales")
        except Exception as e:
            log.error(f"Error cargando datos: {e}")
    else:
        log.info("📁 Archivo de datos no encontrado. Iniciando desde cero.")


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
#  FUNCIONES XNXX
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
            if not href or href in seen or not href.startswith('/video-'):
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

        return {
            "title": title[:200],
            "video_url": video_url,
            "page_url": page_url
        }
    except Exception as e:
        log.error(f"Error extrayendo {page_url}: {e}")
        return None


# ═══════════════════════════════════════════════════
#  PUBLICAR EN CANAL
# ═══════════════════════════════════════════════════

async def publish_now(bot: Bot, query: str) -> bool:
    log.info(f"📤 Intentando publicar: {query}")
    
    results = search_xnxx(query)
    if not results:
        log.warning("❌ No se encontraron resultados")
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
            f"🕒 Release Date {datetime.now().strftime('%d/%m/%Y')}\n"
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
            
            log.info("✅ Video publicado exitosamente")
            return True

        except Exception as e:
            log.error(f"Error enviando video: {e}")
            time.sleep(3)
            continue

    log.warning("❌ No se logró publicar ningún video")
    return False


# ═══════════════════════════════════════════════════
#  SCHEDULER
# ═══════════════════════════════════════════════════

def _run_sync():
    if not state["active"] or _bot_instance is None:
        return
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(publish_now(_bot_instance, state["query"]))
    finally:
        loop.close()


def _scheduler_loop():
    while True:
        schedule.run_pending()
        time.sleep(10)


def start_scheduler():
    schedule.clear()
    total_minutes = state["interval_minutes"]
    
    if total_minutes < 1:
        total_minutes = 1
        
    schedule.every(total_minutes).minutes.do(_run_sync)
    
    # Log formateado para consola
    log.info(f"⏰ Scheduler configurado: cada {total_minutes} minutos | Tema: {state['query']}")


def ensure_scheduler_thread():
    for t in threading.enumerate():
        if t.name == "xnxx_scheduler":
            return
    t = threading.Thread(target=_scheduler_loop, name="xnxx_scheduler", daemon=True)
    t.start()
    log.info("🔄 Hilo del scheduler iniciado")


def format_interval_text(total_minutes: int) -> str:
    """Traduce los minutos totales a texto entendible (Horas y minutos)"""
    if total_minutes < 60:
        return f"{total_minutes} minuto(s)"
    
    h = total_minutes // 60
    m = total_minutes % 60
    if m > 0:
        return f"{h} hora(s) y {m} minuto(s)"
    return f"{h} hora(s)"


# ═══════════════════════════════════════════════════
#  COMANDOS
# ═══════════════════════════════════════════════════

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🔥 **XNXX Auto-Bot 2026**\n\n"
        "Comandos:\n"
        "• `/post` → Publicar ahora\n"
        "• `/autopost` → Activar automático\n"
        "• `/setquery <tema>` → Cambiar búsqueda\n"
        "• `/setinterval <tiempo>` → Cambiar intervalo (Ej: `5m` o `1h` o `1.5h`)\n"
        "• `/status` → Ver estado\n"
        "• `/stop` → Detener\n",
        parse_mode=ParseMode.MARKDOWN
    )


async def cmd_post(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = " ".join(context.args) or state["query"]
    msg = await update.message.reply_text(f"🔍 Buscando *{query}*...", parse_mode=ParseMode.MARKDOWN)
    success = await publish_now(context.bot, query)
    if success:
        await msg.edit_text("✅ **Video publicado** en el canal.")
    else:
        await msg.edit_text("❌ No se encontró video válido. Prueba otro tema.")


async def cmd_autopost(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global _bot_instance
    _bot_instance = context.bot
    state["active"] = True
    start_scheduler()
    ensure_scheduler_thread()

    time_text = format_interval_text(state["interval_minutes"])
    await update.message.reply_text(
        "🚀 **AutoPost Activado**\n\n"
        f"Tema: `{state['query']}`\n"
        f"Intervalo: cada {time_text}\n"
        "Publicando primero ahora...",
        parse_mode=ParseMode.MARKDOWN
    )
    await publish_now(context.bot, state["query"])


async def cmd_setquery(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = " ".join(context.args)
    if not query:
        return await update.message.reply_text("❌ Ejemplo: `/setquery milf`")
    state["query"] = query
    if state["active"]:
        start_scheduler()
    save_data()
    await update.message.reply_text(f"✅ Tema cambiado a: **{query}**", parse_mode=ParseMode.MARKDOWN)


async def cmd_setinterval(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        return await update.message.reply_text(
            "❌ Ejemplo de uso:\n"
            "• `/setinterval 5m` (Cada 5 minutos)\n"
            "• `/setinterval 45m` (Cada 45 minutos)\n"
            "• `/setinterval 1h` (Cada 1 hora)\n"
            "• `/setinterval 2.5h` (Cada 2 horas y 30 minutos)"
        )

    raw_input = context.args[0].lower().strip()
    calculated_minutes = 0

    try:
        if raw_input.endswith('m'):
            # Formato en minutos: "5m" -> 5
            calculated_minutes = int(float(raw_input.replace('m', '')))
        elif raw_input.endswith('h'):
            # Formato en horas: "1.5h" -> 1.5 * 60 = 90
            calculated_minutes = int(float(raw_input.replace('h', '')) * 60)
        else:
            # Si no ponen letra, asumimos que son Horas como antes
            calculated_minutes = int(float(raw_input) * 60)

        if calculated_minutes < 1: 
            raise ValueError

    except Exception:
        return await update.message.reply_text("❌ Formato inválido. Usa por ejemplo: `5m` o `1h`")
    
    state["interval_minutes"] = calculated_minutes
    if state["active"]:
        start_scheduler()
    save_data()
    
    time_text = format_interval_text(calculated_minutes)
    await update.message.reply_text(f"✅ Intervalo cambiado a: **{time_text}**")


# ═══════════════════════════════════════════════════
#  STATUS Y STOP
# ═══════════════════════════════════════════════════

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    status = "🟢 Activo" if state["active"] else "🔴 Detenido"
    time_text = format_interval_text(state["interval_minutes"])
    await update.message.reply_text(
        f"📊 **Estado XNXX Bot 2026**\n\n"
        f"Estado: {status}\n"
        f"Tema: `{state['query']}`\n"
        f"Intervalo: {time_text}\n"
        f"Posts: {state['total_posts']}\n"
        f"URLs guardadas: {len(posted_urls)}\n"
        f"Último: {state['last_post'] or 'Ninguno'}",
        parse_mode=ParseMode.MARKDOWN
    )


async def cmd_stop(update: Update, context: ContextTypes.DEFAULT_TYPE):
    state["active"] = False
    schedule.clear()
    save_data()
    await update.message.reply_text("🛑 **AutoPost detenido**")


def main():
    print("🔥 XNXX Auto-Bot 2026 Iniciado (Soporte Inteligente m/h)")
    load_data()  

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("post", cmd_post))
    app.add_handler(CommandHandler("autopost", cmd_autopost))
    app.add_handler(CommandHandler("setquery", cmd_setquery))
    app.add_handler(CommandHandler("setinterval", cmd_setinterval))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("stop", cmd_stop))

    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
