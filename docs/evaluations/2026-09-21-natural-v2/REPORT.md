# Gerçek checker karşılaştırması ve uygulama değişiklikleri

21 Eylül 2026. **Bu çalışmada, ekran görüntüsündeki metin için uygulamanın ZeroGPT sonucunu düşüren bir profil doğrulanamadı.** Ölçülen dört uygulama varyantı da %100 AI gösterdi. Dolayısıyla 1.2.0 sürümü “detector sorunu çözüldü” veya “en iyi humanizer” diye sunulmuyor. Önceki rapor yazım/koruma testiydi; dış checker ölçümü içermiyordu. Bu rapor o eksikliği gerçek arayüz testleriyle giderir.

## Gerçek ZeroGPT sonuçları

Her satır, herkese açık web arayüzündeki gerçek bir gönderimin görünen sonucudur. Sonuç metni ve ekran görüntüsü saklandı. Değerler yazarlık olasılığı veya yazım kalitesi ölçümü olarak yorumlanmamalı; burada yalnızca ürünün gösterdiği skor aktarılır. ZeroGPT ile GPTZero farklı ürünlerdir.

| Girdi | ZeroGPT'nin gösterdiği AI oranı | Ham kanıt |
|---|---:|---|
| Kullanıcının ekran görüntüsünden aktarılan kaynak | %100 | [Sonuç](zerogpt-source.json) · [Ekran](zerogpt-source.png) |
| Qwen3.5 · Natural · ikinci geçiş | %100 | [Sonuç](zerogpt-qwen-natural-review.json) · [Ekran](zerogpt-qwen-natural-review.png) |
| Qwen3.8 · Natural · Strong · ikinci geçiş | %100 | [Sonuç](zerogpt-qwen38-natural-strong.json) · [Ekran](zerogpt-qwen38-natural-strong.png) |
| Gemma · Conversational · Strong · ikinci geçiş | %100 | [Sonuç](zerogpt-gemma-conversational.json) · [Ekran](zerogpt-gemma-conversational.png) |
| Qwen3.8 · sade dil · tek geçiş | %100 | [Sonuç](zerogpt-qwen38-plain.json) · [Ekran](zerogpt-qwen38-plain.png) |
| ZeroGPT Basic Humanizer çıktısı | %0 | [Sonuç](zerogpt-competitor-basic.json) · [Ekran](zerogpt-competitor-basic.png) |
| Sentetik, zaten doğal kontrol metni | %27.8 | [Sonuç](zerogpt-control.json) · [Ekran](zerogpt-control.png) |

**Rakibin %0 sonucu kalite üstünlüğü göstermedi.** ZeroGPT Basic çıktısı profesyonel yaşam kapsamını düşürdü, veri mahremiyeti ifadesini eksiltti ve bazı cümleleri dilbilgisel olarak bozdu. Örneğin `a part of both daily life` ve `if it is used the way` ifadeleri tamamlanmış doğal İngilizce değildir. Tam çıktı [competitor-output.txt](competitor-output.txt), arayüz kaydı [zerogpt-humanizer.json](zerogpt-humanizer.json) dosyalarında bulunur. Bunlar otomatik bir rakip yeniden yazımının ham çıktılarıdır; uygulamaya örnek metin olarak gömülmedi veya kopyalanmadı. Ücretli Advanced sürüm denenmedi.

Kontrol metni de bu ajan tarafından yazılmış sentetik bir metindir; %27.8 sonucu gerçek insan yazarlığına ilişkin false-positive ölçümü değildir. Metinler farklı uzunlukta olduğu için bu satırdan genel karşılaştırmalı doğruluk oranı çıkarılamaz. Tekrarlar ve birden çok checker üzerinde doğrulanmış başarı oranı yoktur.

## Araştırma ve değişen yazılım

[Birincil kaynaklar ve araştırma notları](RESEARCH.md): QuillBot, Grammarly, iki açık kaynak proje, GPTZero açıklamaları ve DAMAGE araştırması incelendi. İncelenen yaklaşım ve kodlar arasında ayrım yapıldı; yeni bir üçüncü taraf runtime paketi eklenmedi.

- **Tone**: Original, Natural, Conversational, Formal. Natural gündelik ve sade anlatımı ister; diğer seçenekler farklı kayıt düzeylerini belirler. Daha yoğun yeniden yazım otomatik olarak daha iyi anlam koruması demek değildir.
- **Extra editor review**: isteğe bağlı bir ek geçiş. İlk taslak, özgün kaynakla birlikte tekrar incelenir; kaynak belirleyicidir. Her iki çıktıda da yerel koruma kontrolleri çalışır. Kaynak işaretleri aynı kalır; önceki taslağın yeni gerçek veya talimat sağlamasına izin verilmez. Ek çağrı ve süre arayüzde belirtilir. Kanıtlanmış genel kalite kazanımı olmadığı için varsayılan kapalıdır.
- **Gereksiz yanlış alarm düzeltmesi**: düzyazıda AI/API gibi saf büyük harfli kısaltmaların tekrar sayısı değişebilir; kısaltmanın kimliği yine korunur. Sayılar, tarih/tutarlar, karma tanımlayıcılar ve korunan kod/alıntılar sıkı kontrolde kalır. Bu bir semantik garanti değildir; örneğin bir neden-sonuç kayması sayaçtan kaçabilir.
- **Biçim düzeltmesi**: modelin eklediği dış boş satırlar, kaynakta o boş satırlar yoksa temizlenir; kod girintisi kırpılmaz.
- **Gizlilik**: uygulama yine yalnızca yapılandırılmış LLM endpoint'ine gider. Checker tarayıcı testleri uygulamadan ayrı, bu talep için elle başlatılmış araştırma komutlarıdır. Kullanıcı metinlerine otomatik dış checker gönderimi eklenmedi.

İkinci geçişin hatası/kesilmesi başarılı sonuç olarak gösterilmez. Stop aynı iptal sinyalini iki geçişe de iletir. Timeout her model çağrısına uygulanır; toplam işlem süresi açık incelemede daha uzun olabilir. Mevcut kullanıcı bağlantısı, anahtarı, model/generation tercihleri ve skill'ler güncellemede korunur. Bu ölçümlerden dayanaksız bir “en iyi ayar” seçip kullanıcı ayarları üzerine yazılmadı.

## Model denemeleri

**30 uygulama denemesi** ve ayrıca **2 izole kısa-prompt denemesi** yapıldı. Uygulama denemeleri genel AI metni, araştırma özeti, teknik kod/Markdown ve zaten doğal kontrol türlerini kapsıyor. Bir hata dahil tüm kayıtlar korundu. İnceleme açık denemeler normalde bölüm başına iki model çağrısı yapar; aşağıdaki sayılar kullanıcı düzeyindeki deneme sayısıdır.

| Profil | Kabul edilen / deneme | Ortalama tamamlanma süresi |
|---|---:|---:|
| `v111-qwen` | 3/3 | 15.2 sn |
| `qwen-natural-review` | 4/4 | 31.1 sn |
| `gemma-natural-review` | 3/4 | 1.8 sn |
| `gemma-natural-strong` | 2/2 | 1.5 sn |
| `qwen38-natural-strong` | 2/2 | 12.6 sn |
| `qwen-natural-strong` | 2/2 | 39.4 sn |
| `qwen38-conversational` | 3/3 | 16.4 sn |
| `gemma-conversational` | 3/3 | 1.8 sn |
| `qwen38-single` | 1/1 | 25.0 sn |
| `qwen38-plain` | 3/3 | 7.7 sn |
| `gemma-plain` | 3/3 | 1.0 sn |

“Kabul edilen”, yalnızca uygulamanın sayısal/biçimsel kontrollerinin geçtiği anlamına gelir. Aşağıdaki bağımsız inceleme, bu kontrolleri geçen kimi metinlerde anlam kaymaları buldu. Temperature, strength, skills ve prompt varyantları birlikte değiştirildi; bu çalışma bir değişkenin nedensel etkisini izole eden deney veya genel model sıralaması değildir. İlk baseline eski 1.1.1 prompt'u ile, sonraki gruplar kaydedilen araştırma aşamalarında güncellenen prompt'larla çalıştırıldı. Rastgelelik nedeniyle yeniden çalıştırma aynı çıktıyı garanti etmez.

[Kör editör incelemesi](blind-editor-review.md) modelleri ve detector sonuçlarını görmeden yapıldı. Etiketler: D = önceki Qwen3.5 profili; C = Qwen3.8 Natural/Strong; A = Qwen3.8 Conversational; B = Gemma Conversational. Sonuç: D en temkinli anlam korumasını sağladı; C genel metinde sınırlı bir iyileştirme gösterdi. Hiçbir aday genel AI girişini belirgin ölçüde özgünleştirmedi. B, “çalışma alanı olduğunu bildirenler” ifadesini “çalışma alanı olanlar” yaparak öz bildirimi kesin olguya çevirdi; A doğal kontrolde rica/eleştiri nüansını değiştirdi. Bu nedenle daha çok kelime değişmesini tek başına kazanım saymadık.

Sade dilin son turunda Qwen3.8 araştırma örneğinin belirsizliklerini korudu, fakat genel metindeki “integral” ifadesini daha zayıf bir “part of” ifadesine çevirdi ve doğal kontrolün tonuna gereksiz müdahale etti. Gemma'nın daha kısa prompt denemeleri kapsam ve belirsizlik kaybına yol açtı. Bu sonuçlar [plain-candidates.json](plain-candidates.json) ve [concise-probes.json](concise-probes.json) dosyalarında tutulur; seçilmiş başarılı örnekler gibi sunulmaz.

## Ekrandaki metin: önceki sürüm ve son sade dil denemesi

**Önceki sürüm:**

~~~~text
Artificial intelligence is now integral to both professional and everyday life. By automating repetitive tasks and supporting complex decision-making, AI technologies are transforming how individuals and organizations operate.

Improved efficiency is a key benefit of artificial intelligence. Tasks once requiring significant time and manual effort can now be completed faster with intelligent systems, allowing employees to focus on more creative, strategic, and high-value activities.

However, the growing use of artificial intelligence raises important concerns. Issues such as data privacy, algorithmic bias, job displacement, and the reliability of automated decisions continue to generate debate. Organizations should carefully consider both the opportunities and potential risks associated with adopting AI technologies.

Artificial intelligence has the potential to create significant value when implemented responsibly. By combining technological innovation with ethical considerations and human oversight, organizations can use AI while reducing potential negative effects.
~~~~

**Son sade dil denemesi — hâlâ %100 AI:**

~~~~text
Artificial intelligence has become part of professional work and daily life. It handles repetitive tasks and helps with complex decisions, changing how people and organizations do their work.

One major benefit is efficiency. Work that used to take a lot of time and manual effort can now be done faster with intelligent systems, giving employees more room for creative, strategic, and high-value tasks.

But the wider use of artificial intelligence also raises serious concerns. Data privacy, algorithmic bias, job displacement, and the reliability of automated decisions are still debated. Organizations need to weigh the opportunities against the potential risks when they adopt AI.

When used responsibly, artificial intelligence can create significant value. By pairing technological innovation with ethical considerations and human oversight, organizations can use AI while reducing possible negative effects.
~~~~

## Doğrulama ve dosyalar

- **1.2.0 yayında:** http://localhost:3002 sağlık kontrolü geçti; yeni kontroller servis ediliyor. Üretim ayar ve anahtar dosyalarının SHA-256 değerleri güncelleme öncesi/sonrası aynı. Yeni tercihler Original ve ek inceleme kapalı olarak açılır.
- Tam Node suite: **46/46** test geçti; host ve nihai Docker imajında, Docker testleri ağ kapalı çalıştırıldı.
- Tarayıcı kabul testi geçti: ton ve inceleme tercihlerinin kaydı, yeniden yükleme, iki çağrılı akış, önceki editör/settings/skills akışları ve mobil görünüm. Dış tarayıcı isteği olmadan local mock ile test edildi.
- Bağımsız kod incelemesinde bloklayıcı bulgu yoktu. Skill açıklamasındaki “ek çağrı yok” cümlesi ikinci geçişle karışmaması için düzeltildi.
- Yeni davranışlar için önce başarısız olan testler yazıldı, sonra düzeltmelerle geçti. Test sayısı detector başarısı anlamına gelmez.
- Korpus: [corpus.json](corpus.json). Ham uygulama sonuçları: [baseline](baseline.json), [ilk adaylar](candidates.json), [güçlü adaylar](strong-candidates.json), [konuşma tonu](final-candidates.json), [tek geçiş](single-pass.json), [sade dil](plain-candidates.json). Her gruba karşılık gelen `*-plan.json` dosyasında gerçek ayarlar vardır.

Canlı model değerlendirmesini yeniden çalıştırmak için `scripts/evaluate-quality.mjs` ve `EVALUATION_DIR=docs/evaluations/2026-09-21-natural-v2` kullanılır; gerçek sağlayıcı çağrıları yaptığı için otomatik test suite'ine bağlı değildir. `scripts/check-public-detector.mjs` ise geçici Playwright container'ı için araştırma betiğidir; açıkça çalıştırıldığında yalnızca bu değerlendirme örneklerini ZeroGPT'ye gönderir. Uygulamanın runtime'ına dahil değildir.

**Açık kalan hedef:** Bu metni anlamını ve düzgün İngilizcesini koruyarak ticari checker'larda güvenilir biçimde daha düşük skora taşıyan bir çözüm doğrulanmış değil. Bu çalışmanın çıktısı çalışan yazım seçenekleri, düzeltilmiş kontroller ve dürüst bir dış karşılaştırmadır; evrensel detector geçişi iddiası değildir.
