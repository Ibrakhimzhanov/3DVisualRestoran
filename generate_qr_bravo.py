import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import CircleModuleDrawer
from qrcode.image.styles.colormasks import RadialGradiantColorMask
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

# === 1. QR код ===
qr = qrcode.QRCode(
    version=5,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=20,
    border=3,
)
qr.add_data('https://armenu.shumtuber.uz/bravo.html')
qr.make(fit=True)

# Цвета Bravo — тёплое дерево, кремово-коричневый
color_main = (90, 60, 30)        # тёмное дерево
color_dark = (50, 35, 20)        # глубокий коричневый
color_accent = (180, 140, 70)    # тёплое золото

qr_img = qr.make_image(
    image_factory=StyledPilImage,
    module_drawer=CircleModuleDrawer(),
    color_mask=RadialGradiantColorMask(
        back_color=(255, 255, 255),
        center_color=color_main,
        edge_color=color_dark,
    ),
).convert("RGBA")

qr_w, qr_h = qr_img.size
box = 20
border = 3

# === 2. Тарелочки в углах ===
def draw_plate_finder(img, center_x, center_y, box):
    """Позиционная метка QR: рамка 1 модуль, зазор 1 модуль, ядро 3x3.
    Пропорции сканирующей линии 1:1:3:1:1 обязательны по стандарту,
    декоративные кольца вместо них ломают распознавание."""
    d = ImageDraw.Draw(img)
    half = 3.5 * box
    d.rectangle([center_x - half, center_y - half, center_x + half, center_y + half],
                fill=(255, 255, 255, 255))
    d.rounded_rectangle([center_x - half, center_y - half, center_x + half, center_y + half],
                        radius=box * 1.2, outline=color_main, width=int(box))
    core = 1.5 * box
    d.rounded_rectangle([center_x - core, center_y - core, center_x + core, center_y + core],
                        radius=box * 0.5, fill=color_main)


finder_size_modules = 7
finder_px = finder_size_modules * box
cx1 = border * box + finder_px // 2
cy1 = border * box + finder_px // 2
matrix_size = qr.modules_count
cx2 = (border + matrix_size - finder_size_modules) * box + finder_px // 2
cy2 = border * box + finder_px // 2
cx3 = border * box + finder_px // 2
cy3 = (border + matrix_size - finder_size_modules) * box + finder_px // 2
draw_plate_finder(qr_img, cx1, cy1, box)
draw_plate_finder(qr_img, cx2, cy2, box)
draw_plate_finder(qr_img, cx3, cy3, box)

# === 3. Логотип Bravo в центре ===
logo_src = Image.open("J:/Cloude/3D AXROR/logobravo.png").convert("RGBA")
logo_size = int(qr_w * 0.22)
logo_src = logo_src.resize((logo_size, logo_size), Image.LANCZOS)

pad = 14
mask_w = logo_size + pad * 2
mask_h = logo_size + pad * 2
center_bg = Image.new("RGBA", (mask_w, mask_h), (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(center_bg)
bg_draw.rounded_rectangle([0, 0, mask_w, mask_h], radius=16, fill=(255, 252, 245, 255))

bg_x = (qr_w - mask_w) // 2
bg_y = (qr_h - mask_h) // 2
qr_img.paste(center_bg, (bg_x, bg_y), center_bg)

paste_x = (qr_w - logo_size) // 2
paste_y = (qr_h - logo_size) // 2
qr_img.paste(logo_src, (paste_x, paste_y), logo_src)

# === 4. Финальная картинка ===
margin = 80
text_area = 130
final_w = qr_w + margin * 2
final_h = qr_h + margin + text_area + 50
final_img = Image.new("RGBA", (final_w, final_h), (255, 252, 245))
df = ImageDraw.Draw(final_img)
df.rounded_rectangle([12, 12, final_w - 12, final_h - 12], radius=30, outline=color_main, width=4)
df.rounded_rectangle([22, 22, final_w - 22, final_h - 22], radius=25, outline=(90, 60, 30, 80), width=1)

qr_x = (final_w - qr_w) // 2
qr_y = margin
final_img.paste(qr_img, (qr_x, qr_y), qr_img)

# === 5. Надпись ===
color_light = (90, 60, 30, 120)

def draw_plate_small(x, y, size=22):
    df.ellipse([x - size, y - size, x + size, y + size], outline=color_main, width=3)
    df.ellipse([x - size + 6, y - size + 6, x + size - 6, y + size - 6], outline=color_light, width=2)
    df.ellipse([x - 3, y - 3, x + 3, y + 3], fill=color_main)

fonts_to_try = [
    ("C:/Windows/Fonts/georgiab.ttf", "C:/Windows/Fonts/georgiai.ttf"),
    ("C:/Windows/Fonts/timesbd.ttf", "C:/Windows/Fonts/timesi.ttf"),
    ("C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/ariali.ttf"),
]
font_main = font_sub = None
for fb, fr in fonts_to_try:
    try:
        font_main = ImageFont.truetype(fb, 58)
        font_sub = ImageFont.truetype(fr, 26)
        break
    except:
        continue
if not font_main:
    font_main = ImageFont.load_default()
    font_sub = font_main

line_y = qr_y + qr_h + 20
df.line([80, line_y, final_w // 2 - 40, line_y], fill=color_light, width=2)
df.line([final_w // 2 + 40, line_y, final_w - 80, line_y], fill=color_light, width=2)
draw_plate_small(final_w // 2, line_y, size=12)

text = "Bravo"
bbox = df.textbbox((0, 0), text, font=font_main)
tw = bbox[2] - bbox[0]
tx = (final_w - tw) // 2
ty = line_y + 22
df.text((tx + 2, ty + 2), text, fill=(0, 0, 0, 35), font=font_main)
df.text((tx, ty), text, fill=color_main, font=font_main)

sub = "Scan for AR Menu"
bbox2 = df.textbbox((0, 0), sub, font=font_sub)
stw = bbox2[2] - bbox2[0]
df.text(((final_w - stw) // 2, ty + 65), sub, fill=(140, 130, 120), font=font_sub)

output = "J:/Cloude/3D AXROR/qr-code-bravo.png"
final_img.save(output, "PNG", quality=95)
print(f"Done: {output} ({final_img.size[0]}x{final_img.size[1]})")
