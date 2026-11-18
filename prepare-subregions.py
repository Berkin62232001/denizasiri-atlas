"""Export documented subregions from Historical Basemaps for the atlas.

Source: André Ourednik and contributors, Historical Basemaps (GPL-3.0).
Snapshot outlines are simplified and displayed during a limited historical interval.
"""
import json
from functools import lru_cache
from pathlib import Path
from shapely import make_valid
from shapely.geometry import Point, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent
SOURCE = "https://github.com/aourednik/historical-basemaps"

# A source year identifies the outline. Date intervals are exclusive at the end.
CATALOG = """
1650|1650|1700|gb|virginia|Virginia|İngiliz Kuzey Amerikası|thirteen-colonies|Virginia|Chesapeake çevresindeki İngiliz yerleşimleri ve koloni iddiası.
1650|1650|1700|gb|massachusetts-bay|Massachusetts Körfezi Kolonisi|İngiliz Kuzey Amerikası|thirteen-colonies|Massachusetts Bay|Boston merkezli koloni ve yaklaşık tarihî sınırları.
1650|1650|1664|nl|new-amsterdam|Yeni Amsterdam|Yeni Hollanda||New Amsterdam|Hollanda Batı Hindistan Şirketi’nin Manhattan çevresindeki yerleşimi.
1715|1715|1776|gb|barbados|Barbados|Britanya Karayipleri||Barbados (UK)|Köleleştirilmiş emeğe dayanan şeker ekonomisinin merkezlerinden biri.
1715|1715|1763|gb|st-kitts-nevis|Saint Kitts ve Nevis|Britanya Karayipleri||Saint Kitts and Nevis (UK)|Britanya yönetimindeki Leeward Adaları kolonileri.
1715|1715|1776|gb|british-virgin-islands|Britanya Virjin Adaları|Britanya Karayipleri||Virgin Islands (UK)|Tortola çevresindeki Britanya ada yerleşimleri.
1783|1783|1793|gb|madras|Madras yönetim merkezi|Doğu Hindistan Şirketi|india|Madras|Şirketin Coromandel kıyısındaki erken toprağı. Sonraki Madras yönetim alanı çok daha genişti.
1783|1783|1793|gb|bengal-company|Bengal yönetim bölgesi|Doğu Hindistan Şirketi|india,bangladesh|Bengal|Şirketin Bengal bölgesindeki nüfuzunu gösteren yaklaşık sınır.
1815|1815|1825|gb|early-nsw|Yeni Güney Galler|Avustralya kolonileri|australia|New South Wales|Doğu Avustralya’daki geniş Britanya toprak iddiası. Yerleşimlerin kapsamı daha dardı.
1878|1878|1901|gb|western-australia|Batı Avustralya Kolonisi|Avustralya kolonileri|australia|Western Australia (UK)|Swan River yerleşiminden gelişen Batı Avustralya kolonisi.
1878|1878|1901|gb|south-australia|Güney Avustralya Kolonisi|Avustralya kolonileri|australia|South Australia (UK)|Adelaide merkezli koloni. Kuzey Toprakları bu dönemde aynı yönetimin ayrı parçasıydı.
1878|1878|1901|gb|northern-territory|Güney Avustralya’nın Kuzey Toprakları|Avustralya kolonileri|australia|Northern Territory (UK)|1863’ten beri Güney Avustralya’ya bağlı olan kuzey bölgesi.
1878|1878|1901|gb|victoria|Victoria Kolonisi|Avustralya kolonileri|australia|Victoria (UK)|Melbourne merkezli koloni 1851’de Yeni Güney Galler’den ayrıldı.
1878|1878|1901|gb|queensland|Queensland Kolonisi|Avustralya kolonileri|australia|Queensland (UK)|1859’da Yeni Güney Galler’den ayrılan koloni.
1878|1878|1901|gb|new-south-wales|Yeni Güney Galler Kolonisi|Avustralya kolonileri|australia|New South Wales (UK)|Queensland ve Victoria ayrıldıktan sonra Sidney merkezli koloni.
1878|1878|1901|gb|tasmania|Tazmanya Kolonisi|Avustralya kolonileri|australia|@tasmania|Van Diemen Toprakları adıyla 1825’te ayrı bir koloni oldu ve 1856’da Tazmanya adını aldı.
1914|1914|1916|de|togoland|Alman Togolandı|Alman Batı Afrikası||Togoland|Batı Afrika’daki Alman kolonisini savaşın başındaki sınırlarıyla gösterir.
1914|1914|1916|de|kamerun|Alman Kamerunu|Alman Batı Afrikası||Kamerun|1911’deki Alman-Fransız anlaşmasının ardından genişleyen koloni.
1920|1920|1946|fr|french-cameroons|Fransız Kamerunu|Fransa’nın Afrika manda yönetimleri||French Cameroons|Alman Kamerunu’nun büyük bölümünde Fransız manda idaresi.
1920|1920|1946|fr|french-togo|Fransız Togosu|Fransa’nın Afrika manda yönetimleri||Togo|Alman Togolandı’nın doğusundaki Fransız manda idaresi.
1920|1920|1932|gb|mesopotamia-mandate|Mezopotamya / Irak Mandası|Britanya’nın Orta Doğu mandaları||Mesopotamia (GB)|Osmanlı’dan ayrılan vilayetlerde Britanya manda dönemi.
1920|1920|1948|gb|palestine-mandate|Filistin Mandası|Britanya’nın Orta Doğu mandaları||Mandatory Palestine (GB)|1920 harita katmanı, Milletler Cemiyeti’nin 1922’de onayladığı manda dönemine ilişkin yaklaşık alanı gösterir.
1920|1920|1946|fr|syria-mandate|Suriye Fransız Mandası|Fransa’nın Orta Doğu mandaları||Syria (France)|Fransız manda yönetiminin haritada Suriye adıyla gösterilen kısmı.
1920|1920|1934|gb|newfoundland|Newfoundland Dominyonu|Britanya Kuzey Amerikası|canada|Dominion of Newfoundland|1907’de dominyon statüsü kazanan Newfoundland. Labrador sınırı 1927’de karara bağlandı.
1938|1938|1953|gb|northern-rhodesia|Kuzey Rodezya|Britanya Orta Afrikası|zambia|Northern Rhodesia|Britanya himaye bölgesi. 1953’te Orta Afrika Federasyonu’na katıldı.
1938|1938|1953|gb|southern-rhodesia|Güney Rodezya|Britanya Orta Afrikası|zimbabwe|Southern Rhodesia|1923’ten itibaren iç yönetim yetkileri bulunan Britanya kolonisi.
1945|1945|1953|gb|nyasaland|Nyasaland|Britanya Orta Afrikası||Nyasaland|Bugünkü Malavi’deki Britanya himaye bölgesi.
1945|1945|1958|fr|french-sudan|Fransız Sudanı|Fransız Batı Afrikası|west-africa|Mali|Fransız Batı Afrikası federasyonunun bugünkü Mali’deki birimi.
1945|1945|1958|fr|niger-colony|Nijer Kolonisi|Fransız Batı Afrikası|west-africa|Niger|Fransız Batı Afrikası federasyonunun iç kesimlerdeki kolonisi.
1945|1945|1958|fr|ivory-coast|Fildişi Sahili Kolonisi|Fransız Batı Afrikası|west-africa|Ivory Coast|Fransız Batı Afrikası’nın Gine Körfezi kıyısındaki kolonisi.
1945|1945|1958|fr|mauritania-colony|Moritanya Kolonisi|Fransız Batı Afrikası|west-africa|Mauritania|Federasyonun Sahra ile Senegal Nehri arasındaki kolonisi.
1945|1945|1958|fr|senegal-colony|Senegal Kolonisi|Fransız Batı Afrikası|west-africa,senegal|Senegal|Dakar ve Saint-Louis çevresindeki Fransız yönetim birimi.
1945|1945|1958|fr|french-guinea|Fransız Ginesi|Fransız Batı Afrikası|west-africa|Guinea|Konakri merkezli koloni 1958’de bağımsız oldu.
1945|1945|1958|fr|chad-colony|Çad Kolonisi|Fransız Ekvator Afrikası|french-equatorial-africa|Chad|Fransız Ekvator Afrikası federasyonunun kuzeydeki yönetim birimi.
1945|1946|1954|fr|tonkin|Tonkin|Fransız Çinhindi|vietnam|Tonkin|Hanoi ve Kızıl Nehir deltası çevresindeki eski Fransız himaye bölgesi. Savaş yıllarında yönetim ve denetim değişti.
1945|1946|1954|fr|annam|Annam|Fransız Çinhindi|vietnam|Annam|Huế merkezli eski Fransız himaye bölgesi. Savaş yıllarında yönetim ve denetim değişti.
1945|1946|1954|fr|cochinchina|Koşinşin|Fransız Çinhindi|vietnam|Cochin China|Saygon ve Mekong deltası çevresindeki eski Fransız kolonisi. 1949’da Vietnam Devleti’ne katıldı.
1945|1946|1953|fr|cambodia-protectorate|Kamboçya Himaye Bölgesi|Fransız Çinhindi|cambodia|Cambodia|Kamboçya Krallığı’nın Fransız idaresiyle bağlantısı 1953’te sona erdi.
1945|1946|1953|fr|laos-protectorate|Laos Himaye Bölgesi|Fransız Çinhindi|laos|Laos|1949’da Fransız Birliği’ne bağlı devlet statüsüne geçen Laos 1953’te tam bağımsız oldu.
1945|1945|1951|fr|fezzan|Fizan Askerî Yönetimi|Libya’nın müttefik işgal bölgeleri|libya|Fezzan (Frech Lybia)|İtalyan kontrolü sona erdikten sonra Fransa’nın yönettiği güneybatı Libya bölgesi.
1945|1945|1951|gb|cyrenaica|Sirenayka Askerî Yönetimi|Libya’nın müttefik işgal bölgeleri|libya|Cyraneica (UK Lybia)|İtalyan kontrolü sona erdikten sonra Britanya’nın yönettiği doğu Libya bölgesi.
1945|1945|1951|gb|tripolitania|Trablusgarp Askerî Yönetimi|Libya’nın müttefik işgal bölgeleri|libya|Tripolitana (UK Lybia)|İtalyan kontrolü sona erdikten sonra Britanya’nın yönettiği kuzeybatı Libya bölgesi.
"""


@lru_cache(maxsize=None)
def snapshot(year):
    path = ROOT / "historical" / f"{year}.json"
    return json.loads(path.read_text())["features"]


def matching_geometry(year, feature_name):
    features = snapshot(year)
    if feature_name == "@tasmania":
        # The source leaves this island unnamed in 1878. Its insular outline
        # is paired with the National Archives' documented colonial status.
        point = Point(147.2, -42)
        return [
            make_valid(shape(feature["geometry"]))
            for feature in features
            if feature["properties"]["NAME"] is None
            and feature["geometry"]
            and shape(feature["geometry"]).covers(point)
        ]
    return [
        make_valid(shape(feature["geometry"]))
        for feature in features
        if feature["properties"]["NAME"] == feature_name and feature["geometry"]
    ]


def polygon_rings(geometry):
    if geometry.geom_type == "Polygon" and geometry.area > 0.0005:
        return [[[round(x, 3), round(y, 3)] for x, y in ring.coords] for ring in [geometry.exterior, *geometry.interiors]]
    if hasattr(geometry, "geoms"):
        return [ring for child in geometry.geoms for ring in polygon_rings(child)]
    return []


subregions = []
for row in CATALOG.strip().splitlines():
    year, start, end, power, region_id, name, parent, parents, feature, label = row.split("|")
    geometries = matching_geometry(int(year), feature)
    if len(geometries) != 1:
        raise ValueError(f"{year} {feature}: expected a unique feature, got {len(geometries)}")
    geometry = unary_union(geometries)
    rings = polygon_rings(geometry)
    if not rings:
        raise ValueError(f"{year} {feature}: no polygon rings")
    subregions.append({
        "id": region_id,
        "name": name,
        "parentName": parent,
        "parentRegionIds": parents.split(",") if parents else [],
        "start": int(start),
        "end": int(end),
        "power": power,
        "rings": rings,
        "label": label,
        "sourceYear": int(year),
        "source": SOURCE,
    })

assert len({region["id"] for region in subregions}) == len(subregions)
(ROOT / "subregions.js").write_text(
    "// Outlines adapted from André Ourednik and contributors, Historical Basemaps (GPL-3.0).\n"
    "window.ATLAS_SUBREGIONS = " + json.dumps(subregions, ensure_ascii=False, separators=(",", ":")) + ";\n"
)
print(f"Exported {len(subregions)} historical subregions")
