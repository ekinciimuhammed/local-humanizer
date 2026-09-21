# Yeni yöntem ve arka plan checker kararı

Tarih: 21 Eylül 2026. Durum: **araştırma tamamlandı; aşağıdaki yeni model ve checker entegrasyonu henüz uygulanmadı.** Public repo: https://github.com/ekinciimuhammed/local-humanizer. Mevcut 1.2.0 çalışmaya devam eder.

## Karar

Bir sonraki pilot için **Qwen3-4B-Base + yayımlanmış HIP adaptörünü** seçiyoruz. Bu, genel sohbet modeline daha uzun skill/prompt vermekten farklı bir model değişikliğidir. Önce tek geçişi ölçmek, yalnızca önceden belirlenmiş sınır içinde ikinci geçişi karşılaştırmak gerekir. Ürün başarısı henüz doğrulanmış değildir.

Arka plan checker fikri uygulanabilir. Yazım motorundan ayrı, kullanıcı tarafından açılan bir ölçüm seçeneği olmalı. İlk ürün bağlantısı için **GPTZero resmî API** daha net belgelenmiş; kullanıcının ekran görüntüsündeki **ZeroGPT.com** ise ayrı bir sağlayıcı olarak korunmalı. İkisi aynı ürün değildir. Skorlar birleştirilerek ortak bir “AI yüzdesi” hesaplanmamalı.

## Önceki döngüden çıkarılan sonuç

[Önceki deneyde](../evaluations/2026-09-21-natural-v2/REPORT.md) 30 uygulama denemesi yapıldı; dış checker'a gönderilen dört uygulama çıktısı da ZeroGPT'de %100 AI aldı. Ton, model, sıcaklık ve skill seçimleri birlikte değiştiği için bu deney hangi bileşenin neden etkisiz kaldığını izole etmiyor. Birkaç prompt daha denemek için yeterli yeni hipotez yok.

Yerel ifade sayacı detector hedefi değildi. Anlam/biçim kontrollerinden geçmek de gerçek anlam eşdeğerliği göstermedi. Bundan sonraki deneyde **yazım kalitesi, anlam koruması ve dış detector sonucu ayrı sonuçlar** olarak tutulacak; başarısız örnekler çıkarılmayacak.

## Birincil kaynakların gösterdiği yollar

### HIP: hazır özel modelle en somut pilot

[19 Mayıs 2026 çalışması](https://arxiv.org/abs/2605.19516), temel model ile instruction-tuned model çıktılarının GPTZero ve Pangram'da farklı puanlandığını ölçüyor. HIP, insan metinlerinin AI paraphrase'lerinden özgün insan metnine dönüşü LoRA ile öğreniyor. Araştırma 256 değerlendirme metni ve 10 yeniden yazım turu kullanıyor. Tur sayısı artarken anlam sadakati düşebiliyor; bu yüzden sonuç yalnızca düşük detector skoru olarak okunamaz. Qwen ailesinde 4B'ye kadar büyüme yararlı, daha büyük model her durumda daha iyi değil.

Bu kanıt “sohbet şablonunu kapatmak yeter” demiyor: chat-template ablation'ında etki büyük ölçüde sürüyor; yalnızca son çıktı katmanını eğitmek ise temel sonucu yeniden üretmiyor. Önemli bileşen eğitilmiş paraphraser. Çalışmanın doğruladığı ticari servisler **GPTZero ve Pangram**; bizim ZeroGPT.com örneğimiz için doğrudan kanıt değil. Türkçe, kod ve alıntı koruması için de kendi testimiz gerekli.

[Resmî kod](https://github.com/YixuanEvenXu/humanization-by-iterative-paraphrasing) MIT; [4B adaptör kartı](https://huggingface.co/YixuanEvenXu/Qwen3-4B-Base-HIP-adapter) ve temel model Apache-2.0 bildiriyor. Yayımlanmış adaptör kullanılabildiği için ilk pilotta yeniden eğitim gerekmiyor. Kaynak kod çalıştırılmadı; kart, yapılandırma ve inference kodu incelendi.

### MASH: eğitim gerektiren alternatif

[MASH makalesi](https://arxiv.org/abs/2601.08564) style-injection SFT, DPO ve isteğe bağlı refinement kullanıyor. Yazarlar altı veri kümesi/beş detector için %92 ortalama ASR bildiriyor. Bu, bizim uygulamamızın başarı oranı değil. [Resmî repo](https://github.com/githigher/MASH) eğitim betikleri sunuyor; incelenen README'de indirilebilir eğitilmiş checkpoint bağlantısı görülmedi. Lisans açıklaması research-only; kaynak kodunu ürüne kopyalamak için açık bir MIT/Apache izni varsayılmadı. Hazır HIP adaptörü varken ilk pilot için daha fazla eğitim/yeniden üretim işi çıkarıyor.

### Detector ile yönlendirilen üretim: ayrı altyapı

[Adversarial Paraphrasing](https://arxiv.org/abs/2506.07001), üretim sırasında olası sonraki token'ları gerçek bir detector ile değerlendiriyor. Bu, tamamlanmış metni tekrar tekrar bir chat API'ye göndermekle aynı algoritma değil. Token düzeyinde üretim kontrolü ve uygun detector gerekir; mevcut `/chat/completions` bağlantımıza birkaç prompt ekleyerek bu çalışmayı uygulamış sayamayız. [Resmî kod](https://github.com/chengez/Adversarial-Paraphrasing) ayrı araştırma alternatifi olarak kaydedildi.

### Deterministik kuralların doğru yeri

[GPTZero'nun güncel açıklaması](https://support.gptzero.me/articles/9585228410-how-do-i-interpret-burstiness-or-perplexity), perplexity/burstiness'i 2023 sonbaharında bıraktığını söylüyor. [2026 teknik raporu](https://arxiv.org/abs/2602.13042) paraphrase, çeviri ve humanizer örnekleriyle dayanıklılık eğitimi açıklıyor. Dolayısıyla sabit cümle uzunluğu, eşanlamlı sözcük veya noktalama kuralı için genel başarı varsaymıyoruz.

Deterministik katman yine değerli: sayı/ad/alıntı kontrolü, Unicode bütünlüğü, kaynak-çıktı sürüm eşleştirmesi, istek bütçesi, iptal ve aynı metni gereksiz tekrar göndermeme. Bunlar detector yerine geçmez. Anlam kayması için ayrıca kaynakla karşılaştırmalı inceleme gerekir.

## Yerel çalışma uygulanabilirliği

Hugging Face dosya metadata'sında temel model ağırlıkları **8.045 GB**, adaptör **1.057 GB**; toplam yaklaşık **9.10 GB**. Bunlar disk indirme boyutlarıdır, çalışma belleği gereksinimi değil. Model revision'ları [kaynak manifestinde](2026-09-21-method-sources.json) sabitlendi. İndirme yapılmadı.

İncelenen HIP inference kodu, `device_map` verilmezse CUDA veya CPU seçiyor; otomatik Apple MPS yolu yok. Apple Silicon için native MPS/MLX uyarlaması ya da ayrı uyumlu model sunucusu gerekir. Mevcut Linux Docker container'ının Mac GPU'sunu otomatik kullanacağını varsayamayız. Quantization veya model dönüşümü yapılırsa kaliteyi ayrıca ölçmek gerekir.

Mevcut uygulama chat mesajları ve özel koruma işaretleri gönderiyor. HIP'in yayımlanan kaynak/hedef metin formatı için ayrı inference yolu gerekir. Skill metnini HIP girişine yığmak, modelin eğitim formatıyla uyumlu olduğu kanıtlanmış bir yöntem değil. İlk pilot normal İngilizce düzyazı ile sınırlı olmalı; koruma işaretleri, Markdown ve uzun parça desteği ayrı kabul testleri olmadan açılmamalı.

## Arka plan checker seçeneğinin somut davranışı

Bu bir **önerilen tasarım**, çalışan 1.2.0 özelliği değil:

1. Varsayılan kapalı `Check with external services` seçeneği. Kullanıcı sağlayıcıyı ve hangi metnin gönderileceğini görür; API bilgileri sunucuda ayrı şifrelenir. Açılması metnin seçilen dış servise gideceğini açıkça belirtir.
2. Başarılı yeniden yazımdan sonra ayrı istek başlar; yazma/copy işlemi checker beklemez. İstenirse kaynak ve sonuç aynı sağlayıcıda karşılaştırılır. Akış sırasında her token için tarama yapılmaz.
3. Her kartta sağlayıcı adı, ölçümün adı, yüzde/sınıf, zaman ve taranan metin sürümü bulunur. Metin değişirse sonuç eski olarak işaretlenir. Başarısız veya desteklenmeyen tarama **0%** diye gösterilmez.
4. GPTZero `class_probabilities.ai` değerini AI-only sınıf olasılığı olarak; `mixed` ve `human` alanlarını ayrı gösteririz. ZeroGPT `fakePercentage` kendi tanımına göre gösterilir. Ortalama alınmaz; AI olasılığı ile AI olarak işaretlenen sözcük oranı aynı ölçek değildir.
5. Belge/sağlayıcı başına bir kaynak ve bir sonuç taraması; otomatik retry veya yeniden yazım döngüsü yok. Metin sessizce kırpılmaz. Limit aşımı, 401/403, kota/429, timeout ve desteklenmeyen dil açık durumlar olur.
6. İptal ve metin değişimi eski yanıtın yeni metne bağlanmasını engeller. Oturum içi önbellek metin hash'i + sağlayıcı + detector sürümü ile çalışır. Uygulama varsayılan olarak ham metin/tarama geçmişini diske yazmaz.

Resmî bağlantı durumu:

| Servis | Doğrulanan arayüz | Eksik canlı doğrulama |
|---|---|---|
| GPTZero | [Resmî örnek](https://gptzero.me/machine-learning): `POST https://api.gptzero.me/v2/predict/text`, `x-api-key`, JSON `document`. [API hesabı rehberi](https://support.gptzero.me/articles/5840144813-how-can-i-get-the-api-and-request-code-samples). | Bu çalışma için detector hesabı/anahtarı kullanılmadı; başarılı ücretli API çağrısı yapılmadı. |
| ZeroGPT.com | [Business Swagger](https://api.zerogpt.com/docs/), [OpenAPI](https://api.zerogpt.com/openapi.json): `POST /api/detect/detectText`, JSON `input_text`; `fakePercentage`, `aiWords`, `textWords`, `h`. | Şema text endpoint'inde JWT güvenliği bildiriyor; diğer endpoint'lerde ayrıca ApiKey var. Bloglardaki “yalnız ApiKey yeter” örneğiyle üretim entegrasyonu doğrulanmış sayılmaz. Hesabın resmî örneği ve gerçek cevapla sözleşme testi gerekir. |

ZeroGPT dokümanı API'yi ücretli Business hizmeti olarak tanımlıyor. Ücretsiz web arayüzüne erişim, ücretsiz otomatik API hakkı anlamına gelmez. Aynı isimli `.org`, `.net` ve benzer domain'ler bu incelemede ZeroGPT.com yerine kullanılmadı. Tarayıcıyla herkese açık sayfada yapılan önceki testler gerçekti; değişebilen UI/CAPTCHA/kota nedeniyle ürünün sürekli arka plan bağlantısı olarak önerilmiyor.

## Döngüye girmeyen pilot protokolü

Bu bölüm bizim önerimizdir; makalenin sonuçlarını yeniden üretmiş olduğumuz iddiası değildir. Makaledeki 10 tur yerine aşağıdaki sınırlı pilot farklı bir deneydir.

- **Hipotez:** yayımlanmış 4B HIP adaptörü, mevcut sabit 1.2.0 profilinden daha düşük dış detector skoru üretirken önemli anlam kaybı yaratmayabilir.
- **Ön kontrol:** bir genel İngilizce örnek, bir HIP turu; süre, tamamlanma, dil ve temel anlam korunması. Uyumsuzluk varsa toplu deneye geçilmez. Modelin yerelde çalışması başarı oranı kanıtı değildir.
- **Dondurulmuş örneklem:** 4 geliştirme + 12 yeni, hiç ayar yapılmamış değerlendirme metni. Kaynağı doğrulanmış insan metinleri ayrı kontrol olur; ajan yazımı “insan ground truth” sayılmaz. Kalite kriterleri örnekler görülmeden yazılır.
- **Sabit kollar:** önceki 1.2.0 profili, HIP 1 tur, HIP 2 tur. Aynı checkpoint ve generation ayarları; sonuca göre gizlice prompt/model değişimi yok. Geliştirme tamamlandığında sürüm/hash kaydı alınır.
- **Bütçe:** her belge için bir baseline çağrısı ve en fazla iki HIP çağrısı. Değerlendirme aşaması 12 × 3 = en fazla 36 yazım çağrısıdır. Kaynak + üç adayın iki detector'a birer gönderimi en fazla 96 tarama eder. Ön kontrol ve geliştirme çağrıları ayrıca kaydedilir; tekrarlar ve üçüncü detector otomatik eklenmez.
- **Öncelikli eşik:** sayı/ad/atıf kontrolleri; bağımsız incelemede yeni iddia, atlanan ana bilgi, kip/olumsuzluk/neden-sonuç kayması olmaması. Detector puanı iyi olsa bile önemli anlam kaybı varsa aday başarısızdır. Başarısızlar toplam paydada kalır.
- **Karar kuralı:** ayar yapılmamış 12 örneğin en az 9'unda her iki detector'da baseline'dan daha düşük AI ölçümü ve sıfır önemli anlam hatası; aksi halde varsayılan motor değişmez. Bu pratik pilot eşiği genel bir başarı oranı garantisi değildir. Sınıf olasılığı/oran, mutlak fark ve hatalar sağlayıcı bazında raporlanır.
- **Durdurma:** ön kontrolde uyumsuzluk, süre/istek bütçesi, kota veya anlam eşiği aşılırsa dur. Başarısızlığı yeni bir prompt döngüsüyle gizleme. İkinci tur birinci turdan kötüyse ilk tur korunur; hedef skora ulaşana kadar sınırsız çalışma yok.

İlk pilotun sonucu çıkmadan mevcut kullanıcı modeli, skill'leri ve ayarları değiştirilmez. HIP yerelde çalıştırılmadığı ve yeni checker API bağlantıları doğrulanmadığı için bu rapor bir entegrasyon teslimi veya “artık checker geçiyor” beyanı değildir.
