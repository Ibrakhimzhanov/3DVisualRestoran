import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import CircleModuleDrawer
from qrcode.image.styles.colormasks import RadialGradiantColorMask
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

# === 1. QR код с круглыми точками ===
qr = qrcode.QRCode(
    version=5,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=20,
    border=3,
)
qr.add_data('https://armenu.shumtuber.uz/afra.html')
qr.make(fit=True)

# Цвета Afra Istanbul — тёплые красно-коричневые
color_main = (180, 50, 20)
color_dark = (40, 25, 50)

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

# === 2. Заменяем угловые квадраты на тарелочки ===
def draw_plate_finder(img, center_x, center_y, size):
    plate = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    cx, cy = size // 2, size // 2
    r = size // 2 - 2

    pd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color_main, width=int(r * 0.14))
    mr = int(r * 0.75)
    pd.ellipse([cx - mr, cy - mr, cx + mr, cy + mr], outline=color_dark, width=int(r * 0.06))
    ir = int(r * 0.5)
    pd.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=color_main)

    fork_h = int(ir * 0.7)
    fx = cx - int(ir * 0.25)
    fy = cy - fork_h // 2
    for t in range(-2, 3, 2):
        pd.line([(fx + t, fy), (fx + t, fy + fork_h // 2)], fill="white", width=1)
    pd.line([(fx - 3, fy + fork_h // 2), (fx + 3, fy + fork_h // 2)], fill="white", width=1)
    pd.line([(fx, fy + fork_h // 2), (fx, fy + fork_h)], fill="white", width=2)

    kx = cx + int(ir * 0.25)
    ky = cy - fork_h // 2
    pd.polygon([(kx - 2, ky), (kx + 3, ky + int(fork_h * 0.15)),
                (kx + 2, ky + fork_h // 2), (kx - 2, ky + fork_h // 2)], fill="white")
    pd.line([(kx, ky + fork_h // 2), (kx, ky + fork_h)], fill="white", width=2)

    dot_r = int(r * 0.04)
    for i in range(12):
        angle = math.radians(i * 30)
        dx = cx + int((r - int(r * 0.07)) * math.cos(angle))
        dy = cy + int((r - int(r * 0.07)) * math.sin(angle))
        pd.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=color_dark)

    px = center_x - size // 2
    py = center_y - size // 2
    bg = Image.new("RGBA", (size + 8, size + 8), (255, 255, 255, 255))
    img.paste(bg, (px - 4, py - 4))
    img.paste(plate, (px, py), plate)

finder_size_modules = 7
finder_px = finder_size_modules * box

cx1 = border * box + finder_px // 2
cy1 = border * box + finder_px // 2

matrix_size = qr.modules_count
cx2 = (border + matrix_size - finder_size_modules) * box + finder_px // 2
cy2 = border * box + finder_px // 2

cx3 = border * box + finder_px // 2
cy3 = (border + matrix_size - finder_size_modules) * box + finder_px // 2

draw_plate_finder(qr_img, cx1, cy1, finder_px + 10)
draw_plate_finder(qr_img, cx2, cy2, finder_px + 10)
draw_plate_finder(qr_img, cx3, cy3, finder_px + 10)


# === 3. Вставляем повара-картинку в центр ===
chef_src = Image.open("J:/Cloude/3D AXROR/turkish-chef.png").convert("RGBA")

# Размер повара — 30% от QR
chef_size = int(qr_w * 0.32)
chef_src = chef_src.resize((chef_size, chef_size), Image.LANCZOS)

# Белый круглый фон под повара чтобы QR точки не мешали
mask_size = chef_size + 20
center_bg = Image.new("RGBA", (mask_size, mask_size), (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(center_bg)
bg_draw.ellipse([0, 0, mask_size, mask_size], fill=(255, 255, 255, 255))

bg_x = (qr_w - mask_size) // 2
bg_y = (qr_h - mask_size) // 2
qr_img.paste(center_bg, (bg_x, bg_y), center_bg)

# Вставляем повара
paste_x = (qr_w - chef_size) // 2
paste_y = (qr_h - chef_size) // 2
qr_img.paste(chef_src, (paste_x, paste_y), chef_src)


# === 4. Финальная картинка ===
margin = 80
text_area = 130
final_w = qr_w + margin * 2
final_h = qr_h + margin + text_area + 50

final_img = Image.new("RGBA", (final_w, final_h), (255, 252, 245))
df = ImageDraw.Draw(final_img)

df.rounded_rectangle([12, 12, final_w - 12, final_h - 12],
                      radius=30, outline=color_main, width=4)
df.rounded_rectangle([22, 22, final_w - 22, final_h - 22],
                      radius=25, outline=(180, 50, 20, 80), width=1)

qr_x = (final_w - qr_w) // 2
qr_y = margin
final_img.paste(qr_img, (qr_x, qr_y), qr_img)


# === 5. Ресторанные элементы ===
color_light = (180, 50, 20, 120)

def draw_plate_small(x, y, size=22):
    df.ellipse([x - size, y - size, x + size, y + size], outline=color_main, width=3)
    df.ellipse([x - size + 6, y - size + 6, x + size - 6, y + size - 6],
               outline=color_light, width=2)
    df.ellipse([x - 3, y - 3, x + 3, y + 3], fill=color_main)


# === 6. Надпись ===
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

text = "Afra Istanbul"
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

# === Сохраняем ===
output = "J:/Cloude/3D AXROR/qr-code-afra-new.png"
final_img.save(output, "PNG", quality=95)
print(f"Done: {output} ({final_img.size[0]}x{final_img.size[1]})")
