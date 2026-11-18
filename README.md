# Denizaşırı Atlas

1402–2026 arasında seçilmiş sömürge yönetimlerini incelemek ve iki yılı aynı haritada karşılaştırmak için Türkçe etkileşimli tarih atlası. Sınırlar ve zaman aralıkları mevcut kaynakların izin verdiği ölçüde yaklaşık gösterilir.

## Çalıştırma

Python 3.9 veya üstüyle depo kökünde çalıştırın. Varsayılan paketleme hazır coğrafi katmanları kullanır.

```sh
python3 package.py
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Tarayıcıda http://127.0.0.1:8000 adresini açın. Tek dosyalık çevrimdışı sürüm outputs/Yeryuzu-Atlasi.html konumunda oluşur.

## Veri katmanlarını yeniden üretme

Tarihsel girdiler historical/ içinde yıl bazında yer alır. Python ortamınıza shapely==2.0.7 kurduktan sonra sırasıyla python3 prepare-footprints.py, python3 prepare-subregions.py ve python3 package.py komutlarını çalıştırın.

Modern kıyı ve idarî sınırlar için Natural Earth 1:10m Land, Admin 0 Countries ve Admin 1 States Provinces shapefile dosyalarını sırasıyla land/, countries/ ve provinces/ altına açın. NumPy, Shapely 2 ve PyShp 2.3.1 gerekir. Aşağıdaki ilk iki komut aynı temel coğrafi katmanı birlikte üretir.

```sh
node prepare-geography.cjs source-world-10m.json geography.js
python3 fix-seams.py
python3 prepare-provinces.py
python3 package.py
```

Rölyef için Natural Earth II'nin NE2_LR_LC_SR_W.tif dosyasını depo köküne koyun. Apple Silicon ve Python 3.13 ortamında python3 -m pip install --require-hashes -r raster-macos-arm64-py313.lock ile bağımlılıkları kurup python3 project_relief.py ve python3 package.py çalıştırın. Üretici girdi özetini doğrular.

## İsteğe bağlı CShapes katmanı

Ticari olmayan kullanım için [ETH Zürich](https://icr.ethz.ch/data/cshapes/) sayfasından CShapes 2.0 shapefile verisini edinip cshapes/CShapes-2.0.shp ve eşlik eden dosyaları yerleştirin. PyShp 2.3.1 ve Shapely 2 kurulu ortamda python3 prepare-cshapes.py ardından python3 package.py --with-cshapes çalıştırın. Ayrı çıktı optional/dist/ ve optional/outputs/ içinde oluşur.

## Testler

```sh
python3 package.py
npm ci --prefix qa
node test-full.cjs
node test-comparison.cjs
node test-compare-ui.cjs
node tests/decoder.cjs
```

## Lisans

Özgün uygulama kodu, arayüz ve üretim betikleri GPL-3.0-only lisanslıdır. Harita katmanlarının kendi lisansları ve değişiklik açıklamaları veri bildiriminde yer alır. [GPLv3](LICENSE) · [Veri kaynakları ve lisansları](DATA-LICENSES.md)

Arayüzün sağ üstündeki TR / EN anahtarı ile dil değiştirilebilir. Dil tercihi tarayıcı izin verdiğinde cihazda saklanır. Dil geçiş testini çalıştırmak için `node tests/language.cjs` komutunu kullanın.
