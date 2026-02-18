import qrcode
from PIL import Image, ImageDraw

# === 1. Обычный чёрный QR код ===
qr = qrcode.QRCode(
    version=5,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=20,
    border=3,
)
qr.add_data('https://armenu.shumtuber.uz/afra.html')
qr.make(fit=True)

qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
qr_w, qr_h = qr_img.size

# === 2. Логотип Afra в центре ===
logo_src = Image.open("J:/Cloude/3D AXROR/turkish-chef.png").convert("RGBA")
logo_size = int(qr_w * 0.25)
logo_src = logo_src.resize((logo_size, logo_size), Image.LANCZOS)

pad = 10
mask_w = logo_size + pad * 2
mask_h = logo_size + pad * 2
center_bg = Image.new("RGBA", (mask_w, mask_h), (255, 255, 255, 255))

bg_x = (qr_w - mask_w) // 2
bg_y = (qr_h - mask_h) // 2
qr_img.paste(center_bg, (bg_x, bg_y))

paste_x = (qr_w - logo_size) // 2
paste_y = (qr_h - logo_size) // 2
qr_img.paste(logo_src, (paste_x, paste_y), logo_src)

# === 3. Сохраняем ===
output = "J:/Cloude/3D AXROR/qr-code-afra-new.png"
qr_img.save(output, "PNG", quality=95)
print(f"Done: {output} ({qr_img.size[0]}x{qr_img.size[1]})")
