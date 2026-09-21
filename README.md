# Humanizer

Kendi OpenAI-compatible LLM sunucunuzla çalışan, tamamen yerel bir metin düzenleme uygulaması. İki metin alanı, otomatik model keşfi ve üç yeniden yazım seviyesi. Amaç anlamı koruyarak daha doğal yazmak; AI detector atlatmak değildir.

**1.4.0:** Önce ham metin, ardından ayrı bir ikinci modelle noktalama önerisi. Ham/düzeltilmiş sürümler ayrı tutulur; HIP için 1/2/4 sabit geçiş seçilebilir. [Yeni gerçek ölçümler](docs/evaluations/2026-09-21-followup/REPORT.md): aynı örnekte dört geçişli ham metin %45,9, kaynakla karşılaştırmalı araştırma düzeltmesi %66,5 AI aldı. Ham metinde anlam kaymaları var; genel başarı kanıtı yok.

**1.3.0:** İsteğe bağlı yerel HIP motoru ve dış checker bağlantıları eklendi. HIP deneysel İngilizce düzyazı desteğidir; mevcut LLM bağlantısı varsayılan kalır. [Gerçek doğrulama raporu](docs/evaluations/2026-09-21-hip/REPORT.md): tek örnekte ZeroGPT %74,8 AI verdi, ancak anlam kontrolü başarısız oldu. Genel kalite veya detector geçiş başarısı gösterilmedi. [Ön araştırma](docs/research/2026-09-21-method-decision.md), uygulama öncesindeki kararı ve sınırları kaydeder.

Ana uygulamanın Node.js dışında **çalışma zamanı bağımlılığı yoktur**. İsteğe bağlı HIP worker ayrıca Python/model ağırlıkları kullanır. Frontend, backend ve bütün font/asset kullanımı yereldir. Telemetry, analytics, cloud database veya zorunlu dış servis bulunmaz. Açıkça etkinleştirilen checker, metni seçilen dış servise gönderir.

## Docker ile başlatma

1. Projeyi indirin ve proje klasörüne girin.
2. İsteğe bağlı port ayarını oluşturun:

   ```bash
   cp .env.example .env
   ```

   Varsayılan port `3000`. Doluysa `.env` içindeki `HUMANIZER_PORT` değerini değiştirin.
3. Başlatın:

   ```bash
   docker compose up -d --build
   ```

4. Tarayıcıda **http://localhost:3000** adresini açın (portu değiştirdiyseniz o portu kullanın).
5. **Base URL** ve gerekiyorsa **API key** girip **Connect** seçin. Modeller otomatik bulunur.

İlk build sonrasında `docker compose up -d` yeterlidir. Container yalnızca `127.0.0.1` üzerinde yayınlanır. Bu çalışma alanındaki `.env`, makinedeki port çakışması nedeniyle `3002` kullanır.

```bash
# Durum / sağlık kontrolü
docker compose ps

# Durdur; ayarları koru
docker compose down

# Tekrar başlat; aynı ayarlar yüklenir
docker compose up -d

# Kod değişikliklerini uygula
docker compose up -d --build
```

Ayarlar `humanizer-data` adlı Compose named volume'ünde tutulur. `docker compose down -v` bu volume'ü ve ayarları siler; normal durdurmada `-v` kullanmayın. Yedek alırken `/app/data` dizininin tamamını, özellikle `settings.json` ve `credential.key` dosyalarını birlikte alın. Sadece biri geri yüklenirse anahtar çözülemez.

### Docker'dan bilgisayarınızdaki LLM'ye bağlanma

Container içindeki `localhost`, container'ın kendisidir. Host üzerinde çalışan LLM için örneğin:

```text
http://host.docker.internal:11434/v1
http://host.docker.internal:8000/v1
http://host.docker.internal:1234/v1
```

Compose, Linux için `host.docker.internal:host-gateway` eşlemesini de içerir. Linux'ta LLM yalnızca host'un `127.0.0.1` adresini dinliyorsa bridge üzerinden erişilemez; LLM'yi Docker bridge'den erişilen host arayüzünde dinleyecek şekilde ayarlayın. Yerel firewall erişimine de izin verin. Docker Desktop'ta host bağlantısını **Test Connection** ile doğrulayabilirsiniz.

LLM başka bir container'daysa iki uygulamayı aynı Docker ağına alın; Base URL olarak LLM servis adını ve container portunu kullanın. Kurum içi sunucularda doğrudan o sunucunun URL'sini girin.

### İnternetsiz kullanım

Yerel LLM/HIP kullanıp dış checker'ı kapalı tuttuğunuzda uygulama çalışma sırasında internet istemez. Uzak LLM veya dış checker seçilirse ilgili servis için bağlantı gerekir. İlk Docker build için sabitlenmiş Node base imajı, Docker olmadan kullanımda ise Node kurulumu önceden bulunmalıdır. Hazır imajı bağlı bir makinede oluşturup çevrimdışı makineye taşıyabilirsiniz:

```bash
docker save local-humanizer:1.4.0 -o humanizer-image.tar
# Dosyayı çevrimdışı makineye taşıdıktan sonra:
docker load -i humanizer-image.tar
docker compose up -d --no-build
```

Proje/Compose dosyasını da taşıyın. Model ağırlıkları ve LLM sunucusu ayrıca yerelde hazır olmalıdır. UI hiçbir CDN, web fontu veya uzaktaki JavaScript kaynağı kullanmaz.

## Docker olmadan

Node.js **22 veya üzeri** gerekir. `npm install` gerekmez.

```bash
npm start
# http://localhost:3000
```

Ayarlar varsayılan olarak çalışma klasöründeki `data/` altında tutulur. Örnek:

```bash
PORT=3002 HUMANIZER_DATA_DIR=/path/to/private-data npm start
npm run dev  # Kaynak değişikliklerinde sunucuyu yeniden başlatır
```

`.env` yalnızca Compose tarafından okunur. Doğrudan Node kullanımında ortam değişkenlerini yukarıdaki gibi verin.

## Kullanım

1. **Connect**: Base URL + isteğe bağlı API key. Bağlantı denenir ve `GET /models` çağrılır.
2. **Settings → Models**: Kullanmak istediğiniz modelleri açın. Kapatılan modeller ana dropdown'dan hemen çıkar.
3. Metni **Original** alanına yapıştırın; model ve strength seçin.
4. **Humanize** veya `⌘/Ctrl + Enter`. Sonuç **Humanized** alanında görünür.
5. Yerel kontroller tamamlandıktan sonra **Copy** ile sonucu alın. Üretimi **Stop** veya `Escape` ile durdurabilirsiniz.

**Light** az müdahale eder; varsayılan **Balanced** doğallık ve sadakati dengeler; **Strong** cümle yapısını daha fazla değiştirir. Her seviyede aynı bilgi koruma kuralları geçerlidir. Kaynak dil korunması modele açıkça söylenir; ayrı bir çeviri çağrısı yapılmaz.

`Refresh Models`, yeni modelleri ekler, kaybolanları “No longer on this server” olarak işaretler ve aynı endpoint için önceki aç/kapat seçimlerini korur. Yeniden gelen bir model önceki tercihini alır. Açıkça embedding/reranker/speech/OCR/guard/image-generation görünen modeller varsayılan kapalıdır. Metin de üretebilen vision modelleri açık gelebilir. Sınıflandırma isim/metadata sezgisidir; kullanılabilir her model manuel açılabilir.

Boş model listesi bir çökme sebebi değildir: LLM sunucusunda bir model yükleyin ve listeyi yenileyin. Kapalı ya da kaldırılmış modelle üretim engellenir.

## Önce ham çıktı, sonra ikinci model

Yeniden yazım tamamlanınca **Second model · punctuation** bölümü açılır. Bağlı sunucudaki etkin modellerden birini seçip **Suggest punctuation** düğmesine basın. Bu aşama bir ek çağrıdır ve ham metni korur. **Displayed output** alanından `Raw rewrite` veya `Punctuation suggestion` seçilir. Yeni metin yazdırmak iki geçici sürümü de sıfırlar; sürümler diske kaydedilmez.

İkinci aşama yalnızca noktalama, tire ve büyük/küçük harf önerir; sözcük ekleme/çıkarma, yeniden yazım, sayı/ad/kısaltma değişiklikleri reddedilir. 6.000 karaktere kadar düz metin desteklenir; alıntı/kod/URL/atıf/yapılı metin ve özel korunan terimler bu aşamada reddedilir. Anlam hatalarını düzeltmez ve dilbilgisel yeniden yazım yapmaz. Qwen3.5 için resmî thinking kapatma parametresi kullanılır; diğer model ailelerine bu alan gönderilmez.

İptal, kota veya model hatasında mevcut çıktı korunur. Sürüm değiştirildiğinde eski detector sonucu temizlenir. **Her sürümü ayrı kontrol edin:** gerçek denemede yalnızca iki tire ve bir büyük harf düzeltmesinden sonra gösterilen skor %52,4'ten %100'e çıktı. Bu tek çift, değişikliğin her zaman aynı etkiyi yaratacağını kanıtlamaz; düzeltme öncesi skoru düzeltilmiş metne taşımak doğru değildir. API anahtarı yoksa uygulama skor üretmez.

## Local HIP engine

**Engine → Local HIP · experimental**, `Qwen/Qwen3-4B-Base` üzerine yayımlanmış HIP LoRA adaptörünü kullanır. Yerel worker ayrı çalışır; mevcut LLM endpoint'i ve anahtarı değiştirilmez. Temiz kurulumda Connect yerine **Use local HIP instead** seçilebilir.

Mac'te proje klasöründe kurulum:

```bash
python3 -m venv data/hip/.venv
data/hip/.venv/bin/pip install -r scripts/hip-requirements.txt
data/hip/.venv/bin/python scripts/setup-hip.py
data/hip/.venv/bin/python scripts/hip_worker.py
```

Python 3.11+ gerekir; bu kurulum Python 3.14 üzerinde doğrulanmıştır. İlk kurulum yaklaşık **9.1 GB model ağırlığı** indirir; ortam/cache ek alan kullanır. Revision'lar sabittir, safetensors SHA-256 değerleri doğrulanır. Worker her başlangıçta dosyaları denetler, yalnızca yerel dosyaları açar; remote model code çalıştırmaz ve inference sırasında indirme yapmaz. `data/` Git/Docker build dışında kalır.

Worker `127.0.0.1:18081` üzerinde çalışır. Apple GPU/MPS, NVIDIA CUDA veya CPU otomatik seçilir; GPU'da yayımlanmış bfloat16, CPU'da float32 kullanılır. Modelin disk boyutu çalışma belleği gereksinimi değildir; CPU kullanımı daha fazla bellek ve süre isteyebilir. Worker açık olduğu sürece model bellekte kalır; terminalinde Ctrl+C ile durdurulur. Mac Docker Desktop'taki uygulama `host.docker.internal:18081` üzerinden bağlanır. Node doğrudan çalışıyorsa `127.0.0.1:18081` kullanılır. Linux Docker bridge'in host loopback'e erişimi varsayılmaz; Linux'ta en basit yol uygulamayı ve worker'ı host üzerinde çalıştırmaktır. Gerekirse `HUMANIZER_HIP_URL` yerel HTTP worker origin'ini değiştirir.

HIP yalnızca **İngilizce düz yazı**, belge başına en fazla **6.000 karakter / 1.024 input token** destekler. Kod, alıntı, citation, bağlantı, belirgin Markdown veya eşleşen protected term içeren metinlerde Connected LLM kullanılır. Kaynak sessizce kesilmez. Metni otomatik bölerek bağlamı kaybetmemek için HIP'te chunking yapılmaz.

Bir, iki veya dört sabit geçiş seçilebilir. Dört geçiş deneysel bir seçenektir; daha düşük bir skor uğruna kapsam ve anlam kaybı yaşanabilir. Otomatik hedef-skora-kadar döngü yoktur. Her geçiş 180 saniye ve 1.024 yeni token ile sınırlıdır; tamamlanmayan çıktı reddedilir. Stop native worker'a iptal iletir. HIP eğitimindeki source/target formatını kullanır; genel chat prompt'u, tone/strength, skill metni veya ek editör çağrısı bu yola eklenmez. Bu kontroller Connected LLM için korunur. Her HIP geçişi özgün metne karşı yerel bilgi kontrollerinden geçer; bu kontroller anlam eşdeğerliğini kanıtlamaz. Deneysel model önemli iddiaları değiştirebilir; çıktıyı inceleyin.

Kaynaklar: [HIP kodu (MIT)](https://github.com/YixuanEvenXu/humanization-by-iterative-paraphrasing), [adaptör (Apache-2.0)](https://huggingface.co/YixuanEvenXu/Qwen3-4B-Base-HIP-adapter). Tam upstream uygulaması ürüne kopyalanmadı; worker bu modelin eğitim formatını uygulayan küçük bir yerel servis olarak yazıldı.

## İsteğe bağlı dış checker

**Settings → External checker** altında GPTZero veya ZeroGPT.com seçilir. Varsayılan kapalıdır. Bu servislerin kendi API hesapları gerekir; LLM anahtarınız checker anahtarı olarak kullanılmaz. Anahtarları Settings'e girin; sohbete veya Git'e yazmayın. [GPTZero API kurulumu](https://support.gptzero.me/articles/5840144813-how-can-i-get-the-api-and-request-code-samples), [ZeroGPT Business API](https://api.zerogpt.com/docs/).

- **Enable external checking:** seçilen servise çıktı gönderimini açar. **Also send and check the original text:** kaynak metni de gönderir. Dış servisin kullanım ücreti ve veri saklama politikası geçerlidir.
- **Check automatically after a successful rewrite:** yerel rewrite bittikten sonra ayrı bir tarama başlatır. Yazmayı veya Copy'yi bekletmez. Manuel kontrol, sonuç altındaki External checker panelindedir. Cancel check yalnızca taramayı durdurur.
- GPTZero'nun AI-only, mixed ve human-only sınıf olasılıkları ayrı gösterilir. ZeroGPT.com'un `fakePercentage` ölçümü kendi adıyla gösterilir; ortak/ortalama bir AI skoru üretilmez.
- Skorlar metnin hash'i, zaman ve bildirilmişse detector sürümüne bağlıdır. Metin değişince eski sonuç kaldırılır. Başka sekmede servis/izin değişirse eski sekme gönderim yapamaz; yenileyerek yeni ayarı yükleyin.
- Bir işlemde en fazla kaynak ve sonuç için birer tarama; otomatik retry/yeniden yazım yok. Aynı metin için 10 dakikalık bellekte önbellek vardır. En fazla 50 kayıt; metin diske yazılmaz. Detector sürümü servis tarafından değişebilir; önbellekli sonucun zamanı görünür.
- Metin başına 50.000 karakter, işlem başına 30 saniye; servis hesabının daha düşük limitleri ayrıca geçerlidir. Limit/kota/izin/ağ hatası skor değildir; **0%** olarak sunulmaz. Metin kırpılmaz.

Checker credential'ları ana LLM ayarlarından ayrı `data/detectors/` altında AES-256-GCM ile şifrelenir; dosyalar `0600`, dizin `0700` olur. Backup için bu klasördeki ayar ve key dosyalarını birlikte koruyun. API credential'ı olmadan başarılı canlı detector API doğrulaması yapılmış sayılmaz. ZeroGPT Business şeması JWT bildirir; hesap örneğiniz gerektiriyorsa ayrıca ApiKey girilebilir. Hesaba özgü auth uyumluluğu gerçek bir taramayla sınanmalıdır.

## OpenAI-compatible protokol

Provider SDK veya provider başına entegrasyon yoktur. Şu iki endpoint kullanılır:

```text
GET  {Base URL}/models
POST {Base URL}/chat/completions
```

- `http://localhost:8000` → `http://localhost:8000/v1`
- `http://localhost:8000/v1/` → `http://localhost:8000/v1`
- `http://gateway/internal/v1` → olduğu gibi
- `http://gateway/custom-prefix` → olduğu gibi; `/custom-prefix/models` çağrılır

Root URL'ye `/v1` eklenir; özel gateway path'leri korunur. `/v1/v1` oluşturulmaz. URL içinde kullanıcı/parola, query veya fragment kabul edilmez. Key varsa `Authorization: Bearer …` gönderilir. Key yoksa Authorization başlığı gönderilmez.

Ollama, vLLM, LM Studio, llama.cpp server, LocalAI, LiteLLM ve kurum içi gateway'ler standart models/chat-completions şemasını destekledikleri ölçüde kullanılabilir. Her biriyle canlı model doğrulaması yapılmış olduğu iddia edilmez. Endpoint'in modelleri `{"data":[{"id":"model-name"}]}` biçiminde döndürmesi beklenir.

Streaming SSE ile işlenir. Sunucu streaming isteğine JSON döndürürse normal sonuç da kabul edilir. Sunucu streaming'i açıkça desteklemediğini belirten `400`, `422` veya `501` döndürürse bir kez `stream:false` denenir. Kimlik doğrulama, context veya yarıda kesilen akış hatalarında otomatik tekrar yapılmaz. Diğer uyumsuz sunucular için Settings'ten streaming'i kapatın.

## Skills: açık kaynak yazım profilleri

**Settings → Skills** altında dört yerel profil bulunur:

| Profil | Kaynak / güçlü yön | Varsayılan |
|---|---|---|
| **Natural writing** | [blader/humanizer](https://github.com/blader/humanizer): tekrar eden anlatım kalıpları, şişirilmiş ifadeler, yapay giriş/sonuçlar | Açık |
| **Structure & clarity** | [andreaskonopka/humanizer](https://github.com/andreaskonopka/humanizer): fikirler arası ilişki, paragraf düzeni, belirsizlik ve atıfları koruma | Kapalı |
| **Voice & rhythm** | [harshaneel/humanize](https://github.com/harshaneel/humanize): cümle ritmi, açık fiiller, tutarlı terimler ve kaynak metnin üslubu | Kapalı |
| **Türkçe açıklık** | Bu uygulama için hazırlanmış Türkçe düzenleme: gereksiz bürokratik anlatım, çeviri kokan yapılar, kip/kişi/olumsuzluk tutarlılığı | Açık; yalnızca Türkçe metinlerde uygulanır |

Bu profiller kaynak projelerin **kısaltılmış ve uygulamaya uyarlanmış sürümleridir**. Orijinal kuralları aynen yığmak yerine bilgi koruma ilkeleriyle uyumlu editoryal teknikler seçildi. Uydurma kişisel deneyim/örnek ekleme, detector optimizasyonu, yapay hata üretme, zorunlu cümle uzunluğu kotaları ve koşulsuz noktalama yasakları alınmadı. Üç kaynak MIT lisanslıdır. Sabit commit'ler, kaynak dosya hash'leri ve değişiklik kapsamı [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) ve [skills/catalog.json](skills/catalog.json) içinde bulunur.

Aynı anda en fazla **3 profil** etkin olabilir. Etkin profiller tek yeniden yazım çağrısına eklenir; ekstra model çağrısı veya runtime internet indirmesi yapılmaz. Kaynak dil, gerçekler, belirsizlik, teknik adlar, Markdown ve korunan işaretler bütün skill tercihlerinden önce gelir. Profiller o belge için üretim başında sabitlenir. Hepsini kapatırsanız temel editör çalışmaya devam eder.

### Kendi SKILL.md dosyanız

1. Settings → Skills → **Import or write a skill** bölümünü açın.
2. Yerel `.md` dosyasını seçin veya içeriği yapıştırın/yazın.
3. **Preview skill** ile adı, açıklamayı ve yönergeleri inceleyin.
4. **Import skill** ile saklayın; yeni skill başlangıçta kapalıdır.
5. Listeden açın. Sonraki Humanize işleminde kullanılır.

```markdown
---
name: support-editor
description: Edit support emails clearly while keeping their original tone.
---
Keep the writer's point of view. Preserve every fact, qualification and actionable step.
Prefer plain verbs. Keep real greetings and sign-offs. Return only the edited text.
```

Standart `name`, `description` ve isteğe bağlı `license` alanları okunur; düz, tırnaklı ve çok satırlı YAML scalar değerleri ile satır sonu yorumlar desteklenir. Karmaşık YAML özellikleri desteklenmez. Diğer metadata alanları yürütme izni vermez. İçe aktarma **yalnızca dosyadaki metni** alır: script, tool, shell komutu veya bağlı referans dosyası çalıştırılmaz/yüklenmez. Çok dosyalı agent skill paketleri bu editör için ilgili yazım yönergelerine indirgenmelidir. Skill'ler Codex'in global kurulumuna eklenmez; bu uygulamanın yazım profilleridir.

Sınırlar: dosya başına **32 KiB**, en fazla **12 özel skill**, etkin yönergeler toplamında **24.000 karakter**. Büyük profiller modelin context window'undan yer tüketir; daha küçük bir modelde daha az/kısa profil kullanın. Bir skill, sayı kontrolleri geçse bile anlamı olumsuz etkileyebilir; yönergeleri ve üretilen metni inceleyin. Kaynak modellerle karşılaştırmalı yazım kalitesi üstünlüğü iddia edilmez.

Özel skill'ler ayarlarla birlikte yerel veri volume'ünde saklanır. Skill yönergeleri şifrelenmez; API key ayrı şekilde şifrelenmeye devam eder. Var olan bağlantı, model ve generation ayarları güncellemede korunur.

### Skill'leri indirme

- Her profilde **Download SKILL.md**: tek dosya; uyarlama kaynağı ve tam lisans bildirimi dahil.
- **Download all 4 skills + source licenses**: dört profil, orijinal kaynak referansları, sabit commit/hash manifesti ve lisanslar birlikte.
- Hazır paket: [`public/humanizer-skills.zip`](public/humanizer-skills.zip). Uygulama çalışırken `/humanizer-skills.zip` adresinden de indirilir.

Paket yalnızca dağıtılan dört profili içerir; sizin özel skill'lerinizi veya bağlantı bilgilerinizi içermez. Paket kaynakları değiştiğinde geliştirme ortamında `python3 scripts/package_skills.py` ile yeniden üretilebilir. Python uygulamanın çalışma zamanı bağımlılığı değildir.

### Writing notes

Tamamlanan bir sonucun altındaki kapalı **Writing notes** bölümünde önce/sonra karşılaştırması bulunur: kalıp geçişler, törensel ifadeler, abartılı anlatım, asistan giriş/kapanışları, art arda tekrarlanan cümle başlangıçları ve cümle uzunlukları. Hesaplar deterministic yerel kodla yapılır; korunan kod, alıntı, bağlantı ve terimler sayılmaz. İngilizce/Türkçe kalıp listeleri sınırlıdır. Bu bir yazarlık tespiti, AI skoru veya anlam doğrulama sistemi değildir; sırf sayıyı düşürmek için doğru ifadeleri silmeyin.

## Ayarlar ve bilgi koruması

Generation varsayılanları: temperature `0.45`, top P `0.95`, max tokens `4096`, streaming açık, her LLM isteği için timeout `120 saniye`. Bağlantı/model keşfi timeout'u `15 saniye`dir.

### Ton ve ikinci editör geçişi

Editörün **Tone** alanında Original, Natural, Conversational veya Formal seçilebilir. Original mevcut üslubu korur; Natural daha gündelik ve sade anlatım ister; Conversational konuşma tonunu, Formal profesyonel tonu tercih eder. Strength değişikliğin kapsamını ayrıca belirler. Strong, düz metin paragraflarını yeniden kurabilir; başlıklar, liste maddeleri, kod ve alıntılar koruma altında kalır. Yoğun düzenleme özgün tonun bazı nüanslarını değiştirebilir; özellikle araştırma ve teknik metinlerde sonucu okuyun.

**Extra editor review** isteğe bağlıdır ve varsayılan olarak kapalıdır. Açılırsa her bölüm için aynı modele bir ek çağrı yapılır: özgün kaynak ve ilk taslak birlikte gönderilir; model anlam kaymalarını ve kalan üslup sorunlarını gözden geçirir. Her iki geçişin çıktısı da yerel koruma kontrollerinden geçmelidir. İkinci geçiş başarısızsa sonuç tamamlanmış gibi sunulmaz. Stop iki geçişi de durdurur. Timeout her model çağrısına uygulanır; bu seçenek toplam süreyi ve sağlayıcı kullanımını artırır. İnceleme bir anlam doğruluğu veya detector geçiş garantisi değildir.

21 Eylül'deki sonraki araştırmada gerçek [ZeroGPT karşılaştırmaları ve başarısız denemeler](docs/evaluations/2026-09-21-natural-v2/REPORT.md) kaydedildi. Bu yeni seçenekler detector başarısı kanıtlanmış bir yükseltme olarak sunulmaz. Otomatik koruma artık düzyazıdaki AI/API gibi harflerden oluşan kısaltmaların kimliğini korur; tekrar sayısının değişmesine izin verir. Sayılar, diğer tanımlayıcılar ve korunan kod/alıntı işaretleri önceki sıkı kontrollerden geçmeye devam eder.

LLM yalnızca yeniden yazım yapar. Model listesi işleme, ayarlar, kelime sayıları, parçalama ve koruma kontrolleri normal kodla yürütülür:

- Kod blokları, inline code, Markdown bağlantıları, URL/e-postalar, alıntılar, yaygın citation biçimleri ve özel protected terms geçici işaretlerle korunur. İşaretler geri konurken eksik/çoğaltılmış içerik reddedilir.
- Sayı, yüzde, para değeri, sayısal tarih, Türkçe/İngilizce yazılı tarih, olası çok kelimeli özel ad, kısaltma ve teknik identifier değişimleri karşılaştırılır.
- Markdown başlık/liste/alıntı/tablo işaretleri temel düzeyde kontrol edilir.
- Kritik değişiklik bulunursa **sonuç atılır**; orijinal metin korunur. Ek bir LLM kontrol/onarım çağrısı yapılmaz.
- Streaming sırasında görülen metin **geçici önizlemedir**. Copy ancak tamamlanma ve kontroller sonrasında açılır; iptal ve hatalarda kısmi sonuç silinir.

Bu kontroller anlam eşdeğerliğini kanıtlayamaz. Bütün dillerdeki tarih/özel adları veya karmaşık Markdown biçimlerini eksiksiz tanıyan bir parser/NER sistemi değildir. Sözcükle yazılmış sayılar, aynı sayıların farklı olgulara bağlanması veya anlamsal uydurmalar gözden kaçabilir; sezgiler bazen doğru bir yeniden yazımı da reddedebilir. Önemli tek kelimeli adları ve terimleri **Settings → Protected names & terms** alanına ekleyin ve sonucu okuyun. “Local checks passed” yalnızca uygulanan kontrollerin geçtiğini belirtir.

### Uzun metinler

Belge başına sınır `200.000` karakterdir. Varsayılan parça boyutu `6.000` karakter; Settings'ten `1.000–30.000` aralığında değişir. Bölme cümle cümle değil, paragraf sınırlarında yapılır; kod blokları ve korunan çok satırlı alıntılar bölünmez. Her parçaya önceki özgün parçanın son `1.500`, sonraki parçanın ilk `750` karakteri bağlam olarak verilir. Aradaki paragraf ayırıcıları korunur.

Tek paragraf/kod bloğu limiti aşıyorsa açık bir hata gösterilir. Paragraf sonları ekleyin veya parça boyutunu artırın. Karakter sınırı token sayısının garantisi değildir: küçük context window'larda parça boyutu ve max tokens değerini düşürün. Sağlayıcı token sınırında cevabı keserse tamamlanmış sonuç kabul edilmez.

## Gizlilik ve yerel depolama

Metin tarayıcı/uygulama belleğinde, yeniden yazım sırasında seçtiğiniz LLM endpoint'inde veya yerel HIP worker'da bulunur. Dış checker'ı açarsanız taranacak metin ayrıca seçilen servise gider. Uygulama metin geçmişi, request body logu veya hata içeriği logu tutmaz. Sayfa yenilenince metin alanları sıfırlanır. Bağladığınız sunucu ve dış servisin kendi log/veri saklama politikası ayrıca geçerlidir.

Key tarayıcı localStorage'ına yazılmaz ve Settings API'sinden geri dönmez. Sunucuda AES-256-GCM ile şifrelenir; `credential.key` ve `settings.json` dosyaları `0600`, veri dizini `0700` izniyle saklanır. İşletim sistemi keychain bağımlılığı yoktur. **Tüm veri dizinine erişimi olan kişi key'i çözebilir**; bu çözüm ele geçirilmiş kullanıcı hesabına karşı koruma değildir. Başka bir Base URL'ye geçildiğinde eski key otomatik taşınmaz. Key'i silmek için “Remove the saved API key” seçip kaydedin.

Uygulama tek kullanıcıya yönelik yerel bir araçtır; kullanıcı hesabı veya çok kullanıcılı yetkilendirme içermez. Varsayılan loopback bind, same-origin/custom-header ve Host kontrolleri vardır. Upstream redirect'leri takip edilmez; metin/key başka hedefe yönlendirilmez. TLS doğrulaması kapatılmaz. Özel CA gerekiyorsa Node'un `NODE_EXTRA_CA_CERTS` değişkenini kullanın.

## Hata çözümü

| Mesaj | Yapılacak işlem |
|---|---|
| Connection refused | LLM'yi başlatın; Docker/host adresini ve dinlenen arayüzü kontrol edin. |
| 401 Unauthorized / 403 Forbidden | Key'i ve model erişim yetkisini kontrol edin. |
| 404 Models endpoint not found | Base URL/path doğruluğunu kontrol edin. |
| Model unavailable / chat endpoint not found | Refresh Models; chat destekleyen bir model seçin. |
| Context length exceeded | Chunk size ve gerekirse max tokens değerini düşürün. |
| Token limit / truncated | Max tokens artırın veya Chunk size düşürün. |
| Empty answer | Chat destekleyen başka model deneyin; reasoning modellerinde max tokens artırın. |
| Stream interrupted | LLM sunucusunu kontrol edip yeniden deneyin; eksik çıktı kaydedilmez. |
| Timeout | Timeout değerini artırın veya daha küçük model/parça kullanın. |
| 429 Rate limit / 5xx | LLM kapasitesini kontrol edip daha sonra deneyin. |
| Fact preservation check failed | Light seçin, özel adları korunan terimlere ekleyin veya başka model deneyin. |

## Geliştirme ve doğrulama

```bash
npm test
node --check src/server.mjs
node --check public/app.js
docker compose config --quiet
```

Testler gerçek bir yerel HTTP mock-provider başlatır; dış servis, ücretli API veya gerçek kullanıcı metni kullanmaz. Model discovery/refresh, ayarların saklanması, SSE/JSON/fallback, iptal, hata durumları, bilgi koruması, Unicode ve eşzamanlı güncelleme senaryolarını kapsar. Mock semantik bir LLM değildir; gerçek yazım kalitesi seçtiğiniz modelle değerlendirilmelidir.

Bu kurulumda gerçek bağlı modellerle yapılan **sentetik İngilizce kalite denemesi**, seçilen ayarlar ve önce/sonra örnekleri [kalite raporunda](docs/evaluations/2026-09-21/REPORT.md) bulunur. Bağımsız kör editör değerlendirmesi de rapora bağlıdır. Bu küçük örneklem bir AI detector ölçümü veya genel model sıralaması değildir. Ölçüm bu kurulumun ayarlarını değiştirmiştir; temiz kurulumun genel varsayılanları aynı kalır.

`scripts/evaluate-quality.mjs` isteğe bağlı, **gerçek LLM çağrısı yapan** bir değerlendirme aracıdır; `npm test` tarafından çalıştırılmaz. Yalnızca depodaki kurgusal örnekleri ve seçilen hazır yazım yönergelerini gönderir; özel skill seçimini reddeder. Tekrar çalıştırma komutu ve geçici veri izolasyonu raporda açıklanır. Değerlendirme çıktıları yalnızca bu sentetik metinler için dosyaya yazılır; uygulama kullanıcı metinlerini kaydetmez.

Tarayıcı kabul testi isteğe bağlıdır: `tests/browser-check.mjs`. `playwright-core` test ortamında bulunmalı; gerekirse `PLAYWRIGHT_MODULE` ile paket giriş dosyasını, `CHROMIUM_PATH` ile tarayıcı yolunu belirtin. Ürün çalışma zamanına bu bağımlılık eklenmez. Test ilk bağlantı, modeller, rewrite, copy, ayarlar, iptal/hata ve mobil yerleşimi denetler; `docs/screenshots/` altına görüntü kaydeder.

Manuel arayüz denemesi için ayrı terminalde `npm run test:mock` kullanabilirsiniz. Endpoint `http://localhost:18080/v1`; sahte model yalnızca belirli giriş ifadelerini kaldırır. Gerçek kullanım için kendi LLM'nizi bağlayın.

```text
src/
  server.mjs        Yerel HTTP API, statik dosyalar ve rewrite akışı
  provider.mjs      OpenAI-compatible HTTP, SSE, timeout ve hata dönüşümleri
  models.mjs        URL normalizasyonu, model sınıflandırması ve refresh birleştirmesi
  config.mjs        Atomik ayar yazımı, geçişler ve credential şifreleme
  skills.mjs        SKILL.md ayrıştırma, katalog, içe aktarma ve seçim sınırları
  prompt.mjs        Ortak koruma kuralları ve seçili yazım profilleri
  style-analysis.mjs Yerel editoryal önce/sonra notları
  preservation.mjs  Korunan içerik, deterministic kontroller, paragraf parçalama
public/             Bağımlılıksız HTML/CSS/JavaScript arayüz ve indirilebilir skill paketi
skills/             Dört profil, kaynak referansları, manifest ve lisanslar
tests/              Node testleri, mock-provider ve opsiyonel browser kabul testi
```
