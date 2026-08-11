#!/usr/bin/env python3
"""印刷用画像をプリンターに送る。

    python3 tools/print_letter.py records/2026-08-11/print/3.png
    python3 tools/print_letter.py --all records/2026-08-11

Phase 0〜1（プリンター未購入）では --backend preview のままで構いません。
画像の確認だけを行い、印刷はしません。

プリンターを買ったら --backend を切り替え、下の設定を実機に合わせます。
"""

import argparse
import sys
from pathlib import Path

# --- 接続設定（実機に合わせて書き換える） --------------------------------
# escpos-usb: `lsusb` で確認した値。例) ID 0416:5011 → 0x0416, 0x5011
USB_VENDOR_ID = 0x0416
USB_PRODUCT_ID = 0x5011

# escpos-serial: Windows は "COM3"、macOS/Linux は "/dev/rfcomm0" など
SERIAL_PORT = "/dev/rfcomm0"
SERIAL_BAUDRATE = 9600

# phomemo-ble: アプリやスキャンで確認したBluetoothアドレス
PHOMEMO_ADDRESS = "XX:XX:XX:XX:XX:XX"

HAS_CUTTER = False   # オートカッター搭載機なら True
# -------------------------------------------------------------------------


def print_preview(image_path):
    from PIL import Image

    with Image.open(image_path) as img:
        print(f"👀 プレビュー: {image_path}  ({img.width}x{img.height}px)")
    print("   （--backend preview は印刷しません。画像を開いて確認してください）")


def print_escpos(image_path, connection):
    """58mm ESC/POS プリンタ（USB / Bluetoothシリアル）。

        pip install python-escpos
    """
    from escpos.printer import Serial, Usb

    if connection == "usb":
        printer = Usb(USB_VENDOR_ID, USB_PRODUCT_ID)
    else:
        printer = Serial(devfile=SERIAL_PORT, baudrate=SERIAL_BAUDRATE)

    printer.image(str(image_path))
    if HAS_CUTTER:
        printer.cut()
    else:
        printer.text("\n\n")     # 手で切るための紙送り
    print(f"🖨  印刷しました: {image_path}")


def print_phomemo(image_path):
    """Phomemo M02系（BLE）。

        pip install bleak pillow

    プロトコルはOSS実装が参考になります:
      https://github.com/vivier/phomemo-tools
      https://github.com/theacodes/phomemo_m02s
    ここでは phomemo-tools 相当のコマンドを直接送ります。
    """
    import asyncio

    from bleak import BleakClient
    from PIL import Image

    CHARACTERISTIC = "0000ff02-0000-1000-8000-00805f9b34fb"
    INIT = bytes([0x1B, 0x40, 0x1B, 0x61, 0x01, 0x1F, 0x11, 0x02, 0x04])
    FEED = bytes([0x1B, 0x64, 0x02, 0x1F, 0x11, 0x08, 0x1F, 0x11, 0x0E])

    with Image.open(image_path) as src:
        img = src.convert("1")
        if img.width != 384:
            sys.exit(f"画像の幅が384pxではありません: {img.width}px")
        width_bytes = img.width // 8
        raster = bytearray()
        data = img.tobytes()
        for row in range(img.height):
            line = data[row * width_bytes:(row + 1) * width_bytes]
            raster += bytes([0x1D, 0x76, 0x30, 0x00, width_bytes, 0x00, 0x01, 0x00])
            raster += bytes(b ^ 0xFF for b in line)   # 1bit画像は白=1なので反転

    async def send():
        async with BleakClient(PHOMEMO_ADDRESS) as client:
            await client.write_gatt_char(CHARACTERISTIC, INIT, response=False)
            for i in range(0, len(raster), 128):      # BLEのMTUに合わせて分割
                await client.write_gatt_char(
                    CHARACTERISTIC, raster[i:i + 128], response=False
                )
            await client.write_gatt_char(CHARACTERISTIC, FEED, response=False)

    asyncio.run(send())
    print(f"🖨  印刷しました: {image_path}")


def dispatch(image_path, backend):
    if backend == "preview":
        print_preview(image_path)
    elif backend == "escpos-usb":
        print_escpos(image_path, "usb")
    elif backend == "escpos-serial":
        print_escpos(image_path, "serial")
    elif backend == "phomemo-ble":
        print_phomemo(image_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="画像、または --all のときは records/YYYY-MM-DD")
    ap.add_argument("--all", action="store_true", help="その日の分をまとめて印刷")
    ap.add_argument(
        "--backend",
        default="preview",
        choices=["preview", "escpos-usb", "escpos-serial", "phomemo-ble"],
        help="出力先（既定: preview = 印刷しない）",
    )
    args = ap.parse_args()

    if args.all:
        images = sorted(Path(args.path).glob("print/*.png"), key=lambda p: int(p.stem))
        if not images:
            sys.exit(f"印刷用画像がありません: {args.path}/print/*.png\n"
                     f"先に python3 tools/render_letter.py --all {args.path} を実行してください。")
    else:
        images = [Path(args.path)]

    for image in images:
        dispatch(image, args.backend)


if __name__ == "__main__":
    main()
