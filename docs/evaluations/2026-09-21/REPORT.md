# İngilizce kalite ayarı ve gerçek model denemesi

21 Eylül 2026. Metinlerin tamamı bu çalışma için yazılmış kurgusal örneklerdir. İsimler, kuruluşlar, araştırma ve teknik sürüm bilgileri gerçek olay iddiası değildir. İstekler yalnızca kullanıcının zaten bağladığı LLM endpoint'ine gönderildi; ayrı bir detector servisi kullanılmadı.

## Uygulanan profil

| Ayar | Kayıtlı değer |
|---|---|
| Model | `Qwen3.5-122B-A10B` |
| Strength | `Balanced` |
| Temperature | `0.30` |
| Top P | `0.95` |
| Max tokens | `8192` |
| Streaming | Açık |
| Timeout | `120 saniye` |
| Chunk size | Mevcut `6000 karakter` |
| Skills | Natural writing + Structure & clarity + Türkçe açıklık |

Bu tercih kaliteyi hızın önüne koyar. İngilizce için Türkçe açıklık yönergesi uygulanmaz; Türkçe kullanım için açık bırakıldı. Voice & rhythm denemesi belirgin bir kazanım sağlamadı. Temperature 0.30 son doğrulamada başarılı oldu; 0.45'e karşı istatistiksel üstünlük gösterildiği iddia edilmiyor. Token sınırı kesilen çıktılar gözlendiği için yükseltildi. Bağlantı, API anahtarı, model açma/kapama tercihleri, korunan terimler ve özel skill'ler değişmedi; bunlar kayıt öncesi/sonrası bellekte karşılaştırıldı. Ayrıntı: [kaydedilen ayarlar](applied-settings.json).

## Yöntem ve sonuçlar

İş e-postası, ihtiyatlı araştırma özeti, kod ve bağlantı içeren sürüm notları, birinci şahıs anlatısı ve zaten doğal yazılmış kontrol metni kullanıldı. Aynı beş örnek seçilen ayarla yeniden üretildi. Uygulamanın gerçek HTTP yolu, skill çözümlemesi, streaming, koruma işaretleri ve olgu kontrolleri kullanıldı. Deneyler üretim ayarlarını değiştirmeyen geçici uygulamalarda sırayla yürütüldü.

| Deneme | Tamamlanan / istek | Ortalama süre (başarılı) | Yorum |
|---|---|---|---|
| `gemma-baseline` | 0/2 | — | İlk sürüm: bir ad kontrolü yanlış alarmı; bir rakamın sözcük olarak yazılması. |
| `qwen-baseline` | 0/2 | — | İlk sürüm: aynı ad yanlış alarmı; 4096 token ile kesilme. |
| `deepseek-baseline` | 0/2 | — | İki istekte de 403 erişim hatası; yazım kalitesi değerlendirilemedi. |
| `gemma-repaired` | 5/5 | 0.9 sn | Düzeltmeden sonra hızlı ve okunabilir; bazı kurumsal kalıplar ve gereksiz ton değişiklikleri kaldı. |
| `qwen-expanded` | 5/5 | 14.7 sn | 8192 token, temperature 0.45; kör değerlendirmede en iyi profil. |
| `gemma-voice-030` | 5/5 | 0.8 sn | Ek ritim profili + temperature 0.30; anlamlı kalite kazancı görülmedi. |
| `qwen-confirmation-030` | 5/5 | 15.2 sn | Kaydedilen profil: beş örneğin tamamı kabul edildi. |
| `qwen-strong-030` | 2/3 | 13.1 sn | Araştırma örneğinde 8192 token sınırı doldu; kontrolde paragraf birleştirme görüldü. |

Ana karşılaştırma toplam **29 gerçek model isteği** içerir; başarısız denemeler de yukarıda gösterilir. Seçilen son profilde **5/5** metin uygulamanın olgu koruma kontrolünden geçti. Bu beş metindeki sınırlı kalıp ifade sayacı **17 → 0** oldu. Bu sayı yalnızca tanımlı dil kalıplarını sayar; AI olasılığı, genel kalite puanı veya tüm anlamın korunduğunun kanıtı değildir. Gemma da bu sayacı sıfırlayabildiği hâlde elle incelemede daha kurumsal kaldı: sayaç tek başına model seçmek için yeterli değildir.

Bağımsız bir editör ajan, model kimliklerini görmeden A/B/C çıktılarının anlamını ve doğallığını değerlendirdi. **A > B ≈ C** sıralaması verdi. A = Qwen 0.45 / 8192; B = Gemma 0.30 + Voice & rhythm; C = Gemma 0.45. A özellikle doğal kontrolün rica tonunu ve araştırmanın ihtiyat kayıtlarını daha iyi korudu. [Kör değerlendirme ve gerekçeler](blind-editor-review.md). Son 0.30 çıktıları ayrıca bu çalışmayı yürüten ajan tarafından özgün metinler ve kontrol maddeleriyle karşılaştırıldı; belirgin yeni olgu veya anlam kaybı görülmedi. Bu bir insan paneli değerlendirmesi değildir.

Qwen çıktılarında iki baştaki boş satır kaldı. Ham JSON kayıtları aynen saklanmıştır; aşağıdaki sunumda yalnızca dış boşluklar gösterilmez. Doğal kontrolde küçük bir contraction değişikliği de vardır; tamamen değişikliksiz bırakma davranışı kusursuz değildir.

## Canlı denemede bulunan düzeltmeler

- Ad kontrolü, özgün `Northstar Labs` adını çıktıda `The Northstar Labs` olarak ayrıştırıp yanlışlıkla değişti sayıyordu. Artık kaynakta bulunan adı, sözcük sınırlarıyla çıktıda doğrudan sayıyor. Gerçek değiştirme, silme, çoğaltma ve benzer ekli adlar yine reddediliyor.
- Sayıların yazılışı açıkça sabitlendi: `3`, `three` olmamalı. Bu, mevcut birebir sayı kontrolüyle editör talimatını uyumlu kılıyor.
- Bağımsız kod incelemesinde deney aracının özel skill içerebilme olasılığı bulundu; araç artık yalnızca hazır skill'lerle çalışıyor. Yapılan denemelerde zaten yalnızca hazır skill'ler etkindi.
- Üç regresyon testi önce başarısız çalıştırıldı, düzeltmelerden sonra geçti. Tam **43/43** Node testi hem makinede hem 1.1.1 Docker ortamında geçti. Docker doğrulamasında ağ kapalıydı. Uygulama 1.1.1 olarak güncellendi.

## Yeni metinle canlı kontrol

Ayarlar kaydedildikten sonra, önceki beş örnekten ayrı yeni bir kurgusal metin çalışan uygulamaya gönderildi. 12% tahmini, 6 haftalık pilot, 16 katılımcı, rastgele olmayan dağılım, ölçülmeyen erişilebilirlik ve tamamlanmamış inceleme koşulu korundu. [İlk canlı çıktı](production-check.json) olgu kontrolünü geçti; elle inceleme korunan alıntıdan sonra fazladan nokta buldu: `"promising, but unproven.".`. Bu örnek otomatik kontrolün anlam ve dil doğruluğu için tek başına yeterli olmadığını da gösterdi.

Düzeltme, alıntının kendisine dokunmadan modelin koruma işaretinden sonra eklediği fazladan noktayı kaldırır; yalnızca kaynakta böyle bir dış nokta yoksa ve alıntı zaten cümle sonu işaretiyle bitiyorsa uygulanır. Kaynaktaki dış noktalar, kod ve üç nokta korunur. Regresyon testi önce hatayı gösterdi, sonra geçti.

Düzeltme sonrası aynı yeni metin çalışan uygulamada **12.6 saniyede** tamamlandı. Alıntı birebir kaldı ve fazladan nokta yok. Tahminin gözlem olmadığı, örneklemin rastgele seçilmediği ve erişilebilirlik incelemesi tamamlanmadan yayılım yapılmaması gerektiği korundu. [Nihai canlı çıktı](production-confirmation.json). Böylece toplam **6 farklı İngilizce metin ve 31 gerçek model isteği** kayda alındı (29 karşılaştırma + 2 canlı kontrol).

## İngilizce önce / sonra örnekleri

### Workplace email

**Önce — bilerek kalıplı yazıldı; kontrol metni zaten doğal:**

~~~~text
Hi Maya Chen,

It is important to note that the Northstar Labs pilot is scheduled to begin on 14 October 2026. The current budget is $18,500, and the pilot will involve 24 volunteers. Furthermore, participation is optional, and managers must not treat a decision to decline as a performance issue.

In order to facilitate a seamless process, please send the draft schedule by Friday. The schedule should identify who will cover support while volunteers attend the sessions. Moreover, we may need to postpone the start if the security review is not complete; approval has not yet been granted.

I appreciate the work you have already put into the plan. Please flag any gaps rather than assuming another team will cover them. In conclusion, the immediate priority is a workable schedule, not a wider rollout.
~~~~

**Sonra — modelin gerçek çıktısı (7.3 sn):**

~~~~text
Hi Maya Chen,

The Northstar Labs pilot is scheduled to begin on 14 October 2026. The current budget is $18,500, and the pilot will involve 24 volunteers. Participation is optional, and managers must not treat a decision to decline as a performance issue.

Please send the draft schedule by Friday. The schedule should identify who will cover support while volunteers attend the sessions. We may need to postpone the start if the security review is not complete; approval has not yet been granted.

I appreciate the work you have already put into the plan. Please flag any gaps rather than assuming another team will cover them. The immediate priority is a workable schedule, not a wider rollout.
~~~~

**Anlam kontrolleri:**

- Pilot scheduled, not already started; 14 October 2026; $18,500; 24 volunteers
- Participation optional; declining must not affect performance assessment
- Draft schedule due Friday and must identify support coverage
- Security approval still pending; incomplete review may postpone start
- Appreciation, flagging gaps and schedule-over-rollout priority preserved

### Cautious research summary

**Önce — bilerek kalıplı yazıldı; kontrol metni zaten doğal:**

~~~~text
It is worth noting that a fictional survey by Elena Ruiz included 240 respondents from 3 offices. Employees who reported having a quiet workspace also reported fewer interruptions. This association does not establish that quiet workspaces caused the difference, and the survey did not measure productivity.

Furthermore, 38% of respondents preferred working remotely, while 42% preferred a hybrid arrangement. The remaining 20% preferred working in the office. These preferences describe the respondents, not the wider workforce. Participation was voluntary, so selection bias may have affected the results.

Moreover, the report states, "The results are preliminary and should not guide staffing decisions." A follow-up survey could help determine whether preferences change over time, but it would not, by itself, establish causation. In conclusion, the findings offer a limited description of this sample rather than proof that one working arrangement is better.
~~~~

**Sonra — modelin gerçek çıktısı (19 sn):**

~~~~text
A fictional survey by Elena Ruiz included 240 respondents from 3 offices. Employees who reported having a quiet workspace also reported fewer interruptions. This association does not establish that quiet workspaces caused the difference, and the survey did not measure productivity.

38% of respondents preferred working remotely, while 42% preferred a hybrid arrangement. The remaining 20% preferred working in the office. These preferences describe the respondents, not the wider workforce. Participation was voluntary, so selection bias may have affected the results.

The report states, "The results are preliminary and should not guide staffing decisions." A follow-up survey could help determine whether preferences change over time, but it would not, by itself, establish causation. The findings offer a limited description of this sample rather than proof that one working arrangement is better.
~~~~

**Anlam kontrolleri:**

- Fictional survey; Elena Ruiz; 240 respondents; 3 offices
- Association is not causation; productivity not measured
- 38% remote, 42% hybrid, 20% office; applies only to respondents
- Voluntary participation and possible selection bias retained
- Quotation verbatim; follow-up could assess change but cannot alone prove causation

### Technical release notes with protected Markdown

**Önce — bilerek kalıplı yazıldı; kontrol metni zaten doğal:**

~~~~text
## Release notes

It is important to note that version 2.4.1 introduces an optional request timeout. This capability plays a pivotal role in helping callers stop waiting for a response, but it does not cancel work that the server has already started.

- Set `request_timeout_ms` to `2500` to stop waiting after 2500 ms.
- Leave `request_timeout_ms` unset to retain the existing behavior.
- Requests that time out may still finish on the server; retrying can create duplicate work.

Furthermore, the example below demonstrates how to configure the client. The example does not add retry logic.

```js
const client = new Client({ request_timeout_ms: 2500 });
await client.send({ job_id: "demo-7" });
```

Moreover, the [migration guide](https://example.com/migrate/v2.4.1) describes the compatibility limits. The API response format has not changed. In conclusion, callers should decide whether retrying is safe for their own operation before enabling automatic retries.
~~~~

**Sonra — modelin gerçek çıktısı (17.3 sn):**

~~~~text
## Release notes

Version 2.4.1 introduces an optional request timeout. This allows callers to stop waiting for a response, but it does not cancel work the server has already started.

- Set `request_timeout_ms` to `2500` to stop waiting after 2500 ms.
- Leave `request_timeout_ms` unset to retain the existing behavior.
- Requests that time out may still finish on the server; retrying can create duplicate work.

The example below shows how to configure the client. It does not include retry logic.

```js
const client = new Client({ request_timeout_ms: 2500 });
await client.send({ job_id: "demo-7" });
```

The [migration guide](https://example.com/migrate/v2.4.1) describes the compatibility limits. The API response format has not changed. Callers should decide whether retrying is safe for their operation before enabling automatic retries.
~~~~

**Anlam kontrolleri:**

- 2.4.1 optional client wait timeout, not server cancellation
- Unset option retains behavior; timed-out requests may finish; retries can duplicate work
- All headings, bullets, code, inline identifiers and Markdown link preserved
- Example adds no retries; API response format unchanged
- Automatic retries require operation-specific safety decision

### First-person reflection

**Önce — bilerek kalıplı yazıldı; kontrol metni zaten doğal:**

~~~~text
It is worth mentioning that I began keeping a paper notebook after I missed a deadline. I had been putting reminders in several apps, and I often forgot which app held the note I needed. The notebook did not solve every problem, but it gave me a single place to look during the workday.

Furthermore, I found that writing a short list before opening my inbox helped me choose where to start. I still changed the list when urgent work arrived. I cannot tell whether the improvement came from the notebook itself or from taking a moment to plan.

Moreover, the approach has a clear limitation: I sometimes leave the notebook at home. On those days, I use a note on my phone and copy it over later. In conclusion, I intend to keep using the notebook because it is useful to me, not because I believe everyone should organize their work this way.
~~~~

**Sonra — modelin gerçek çıktısı (15.3 sn):**

~~~~text
I began keeping a paper notebook after I missed a deadline. I had been putting reminders in several apps and often forgot which app held the note I needed. The notebook did not solve every problem, but it gave me a single place to look during the workday.

Writing a short list before opening my inbox helped me choose where to start. I still changed the list when urgent work arrived. I cannot tell whether the improvement came from the notebook itself or from taking a moment to plan.

The approach has a clear limitation: I sometimes leave the notebook at home. On those days, I use a note on my phone and copy it over later. I intend to keep using the notebook because it is useful to me, not because I believe everyone should organize their work this way.
~~~~

**Anlam kontrolleri:**

- Existing first-person experience only; missed deadline precedes notebook
- Scattered app reminders and single daytime reference retained
- List before inbox helps choose start; urgent work changes it
- Cause of improvement uncertain; notebook versus planning
- Sometimes forgotten at home; phone notes later copied; personal preference not universal advice

### Already natural control

**Önce — bilerek kalıplı yazıldı; kontrol metni zaten doğal:**

~~~~text
I left the draft on your desk. The opening still feels slow, but the example in the middle works. Could you cut the repeated explanation and keep the last paragraph? I want the ending to sound like a person making a decision, not a brochure asking for applause.

No rush tonight. Send it back when you have had a chance to read it properly.
~~~~

**Sonra — modelin gerçek çıktısı (17.2 sn):**

~~~~text
I left the draft on your desk. The opening still feels slow, but the example in the middle works. Could you cut the repeated explanation and keep the last paragraph? I want the ending to sound like a person making a decision, not a brochure asking for applause.

No rush tonight. Send it back when you've had a chance to read it properly.
~~~~

**Anlam kontrolleri:**

- Draft on recipient's desk; opening slow; middle example works
- Cut repetition but keep last paragraph
- Desired ending and figurative brochure criticism retained
- No rush tonight; send after proper reading
- Do not add facts, deadlines or corporate framing

## Sınırlar ve tekrar çalıştırma

Bu küçük, elle hazırlanmış İngilizce örneklem genel başarı oranı değildir. Her koşul ve örnek için tek üretim yapıldı; son profil aynı örneklerle tekrarlandı. Model ve sağlayıcı davranışı, yük ve rastgelelik sonucu etkiler. Düşük temperature tek başına anlam güvencesi vermez. Uzun belgelerin gerçek LLM ile geniş kapsamlı semantik doğrulaması veya Türkçe kalite sıralaması yapılmadı. Model adları endpoint'in bildirdiği kimliklerdir; modelin kaynağı ayrıca doğrulanmadı. Kesilen veya otomatik koruma kontrolüne takılan çıktılar başarılı sonuç olarak sunulmadı. Otomatik kontrolden geçmek, elle incelemede dil kusuru bulunmayacağı anlamına gelmez.

Ham kanıtlar: [korpus](corpus.json), [ilk tarama](screening.json), [model/profil karşılaştırması](comparison.json), [son profil doğrulaması](confirmation.json), [Strong denemesi](strength.json), [kör girdi](blind-review-input.json). İlk tarama düzeltme öncesi, sonraki deneyler düzeltme sonrası kodla yapıldı. Dolayısıyla ilk tarama ile sonraki denemeler saf bir model kıyaslaması değildir.

Aşağıdaki komut **gerçek bağlı LLM'ye istek gönderir** ve sağlayıcınız ücretlendiriyorsa maliyet yaratabilir. Mevcut Docker kurulumuyla, proje klasöründe açıkça çalıştırın; önceki `confirmation.json` dosyasını yeniler. Değerlendirme kodu üretim verisini salt okunur bağlar; şifreli ayarlar ve anahtar yalnızca geçici container tmpfs alanına kopyalanır, çıkışta silinir. Sadece sentetik sonuçlar proje klasörüne yazılır.

```sh
docker run --rm --tmpfs /tmp:rw,noexec,nosuid,size=32m   --mount type=volume,source=humanizer_humanizer-data,target=/source-data,readonly   --mount type=bind,source="$PWD",target=/workspace   --workdir /workspace --entrypoint node local-humanizer:1.1.1   scripts/evaluate-quality.mjs docs/evaluations/2026-09-21/confirmation-plan.json
```

Bu komut runtime çevrimdışı kullanımını değiştirmez; uygulama yalnızca yapılandırılan LLM'yle haberleşir. API adresi ve anahtarı değerlendirme kayıtlarında bulunmaz.
