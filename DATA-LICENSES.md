# Harita verilerinin kaynakları ve lisansları

| Dosyalar | Kaynak ve kullanım koşulları |
| --- | --- |
| historical/*.json, footprints.js, subregions.js | André Ourednik ve katkıcılar, Historical Basemaps, GPLv3. historical/ dizini kullanılan yılların düzenlenebilir girdilerini içerir. Atlas için seçili geometriler birleştirildi, koordinatlar yuvarlandı ve tarih aralıkları atandı. Dönüşümler prepare-footprints.py ve prepare-subregions.py içindedir. [Kaynak](https://github.com/aourednik/historical-basemaps) · [GPLv3](LICENSE) |
| assets/terrain/, assets/provinces.json | Natural Earth II, Natural Earth Admin 1. Raster yeniden projelendirilip karolara ayrıldı. İdarî sınırlar sadeleştirilip kodlandı. Natural Earth özgün verilerini kamu malı olarak sunar. [Kullanım koşulları](https://www.naturalearthdata.com/about/terms-of-use/) |
| source-world-10m.json, geography.js | Natural Earth tabanlı World Atlas TopoJSON ve Natural Earth 1:10m kıyı ve ülke geometrileri. Atlas veriyi Equal Earth projeksiyonuna dönüştürüp tarih değiştirme çizgisi çevresindeki geometrileri düzeltti. [World Atlas](https://github.com/topojson/world-atlas) · [ISC bildirimi](LICENSE-ISC.txt) |
| İsteğe bağlı optional/ çıktıları | Schvitz, Rüegger, Girardin, Cederman, Weidmann ve Gleditsch (2022), CShapes 2.0. Seçilen dönem sınırları dönüştürülüp yıllık görünüme uyarlandı. CShapes bileşenleri ve uyarlamaları atıf ve aynı lisansla, ticari olmayan amaçlarla paylaşılabilir. [ETH Zürich ve atıf bilgileri](https://icr.ethz.ch/data/cshapes/) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |

Özgün Atlas yazılımı GPL-3.0-only kapsamındadır. Geliştirme bağımlılıkları kendi lisanslarına tabidir. CShapes verisi ayrı edinilir.
