# Humanizer ve checker araştırması — 21 Eylül 2026

Bu çalışma, kullanıcının paylaştığı ZeroGPT ekran görüntüsündeki başarısız sonucu yeniden üretmek ve mevcut yerel editörü geliştirmek için yapıldı. Aşağıdaki ürün iddiaları bağımsız doğrulama değildir; kendi canlı ölçümlerimiz REPORT.md dosyasında ayrı tutulur.

| Birincil kaynak | Yararlı yaklaşım / sınır | Uygulamadaki karşılığı |
|---|---|---|
| [QuillBot Humanizer](https://quillbot.com/ai-humanizer) | Sözcük seçimi, ton, cümle yapısı ve akışa odaklanır; kusursuz detector sonucunun her zaman anlamlı veya mümkün olmadığını belirtir. | Tonu kullanıcıya açık seçim yaptık; checker sonucunu yazım kalitesi veya anlam doğruluğu olarak adlandırmıyoruz. |
| [Grammarly Humanizer rehberi](https://support.grammarly.com/hc/en-us/articles/38552339652109-Humanizer-user-guide) | Yazara uygun ses seçenekleri sunar. | Original, Natural, Conversational ve Formal tercihleri; kişisel sesi ve rica tonunu koruma testleri. |
| [hannsxpeter/humanizer](https://github.com/hannsxpeter/humanizer) | Anlam ve sesi koruyan düzenleme, zaten doğal metinde ölçülü müdahale, kelime değiştirmenin ötesinde yapısal inceleme. | Özgün kaynakla karşılaştırılan ikinci editör geçişi ve doğal kontrol metni. Kaynak dosyaları çalıştırılmadı; kod kopyalanmadı. |
| [opensyndicate/open-humanizer](https://github.com/opensyndicate/open-humanizer) | Writer/Critic döngüsü ve yerel stil ipuçları. Critic'in ürettiği AI yüzdesi gerçek ticari detector ölçümü değildir. | Sınırı belli, isteğe bağlı tek ek editör geçişi. Sahte AI puanı, sonsuz optimizasyon döngüsü ve zorunlu cümle uzunluğu kotaları eklenmedi. |
| [GPTZero teknoloji açıklaması](https://gptzero.me/technology) ve [paraphrase açıklaması](https://support.gptzero.me/articles/5593633457-how-does-gptzero-detect-ai-paraphrasing-and-ai-bypassers) | Paraphrase edilmiş metinleri de tespit etmeye çalıştığını ve sonuçlarının yanılmaz olmadığını açıklar. | Tek checker / tek örnek başarısını genel geçer başarı diye sunmuyoruz. GPTZero ile ZeroGPT ayrı ürünlerdir. |
| [DAMAGE araştırması](https://arxiv.org/abs/2501.03437) | Humanizer/paraphraser çıktılarının anlam korumasını ve tespitini ele alır. | Sayı kontrolü, anlamsal inceleme ve dış checker ölçümü ayrı değerlendirilir. |
| [ZeroGPT Basic Humanizer](https://www.zerogpt.com/ai-humanizer) | Ücretsiz Basic arayüzü; sayfada ileri sürüm için ayrı ürün yükseltmesi pazarlanıyor. | Basic sürüm aynı metinle gerçekten denendi; ücretli sürüm alınmadı veya denenmiş gibi gösterilmedi. |

Yazılım hiçbir detector servisini çalışma zamanına bağlamaz. Yerel uygulama yalnızca kullanıcının seçtiği LLM endpoint'ine istek yapar. Bu araştırmadaki ZeroGPT gönderimleri, açıkça talep edilen karşılaştırma için genel örnek metinle ve sentetik kontrolle elle başlatılan tarayıcı testleridir. Gelecekteki kullanıcı metinleri bu sitelere otomatik gönderilmez.

Tarayıcı bağlantısı mevcut olmadığından herkese açık sayfalar geçici Chromium ile test edildi. Görünen arayüz kullanıldı; oturum açılmadı, ücretli plan alınmadı, CAPTCHA veya erişim engeli aşılmadı. Reklamlardaki yüzde ve “undetectable” iddiaları ölçüm sonucu olarak kabul edilmedi.
