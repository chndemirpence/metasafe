# OTF Internet Freedom Fund — Concept Note Taslağı (MetaSafe)

> Kaynak: https://apply.opentech.fund/internet-freedom-fund-concept-note
> Bu taslak, OTF'nin gerçek form alanlarına birebir uyacak şekilde hazırlandı.
> `[SEN DOLDUR]` işaretli yerler kişisel bilgi/tercih gerektiriyor — uydurmadım, boş bıraktım.

---

## Project Title

**MetaSafe — Offline Metadata Scrubber for At-Risk Users**

---

## Describe your project in 1-3 sentences.

MetaSafe is a free, 100% client-side, open-source browser tool that strips identifying metadata — GPS coordinates, device serial numbers, author names — from photos, documents, and emails before people share them, including metadata hidden *inside* embedded photos in Word documents, SVGs, and email attachments that single-file cleaners miss. It is built for journalists, activists, and at-risk individuals who need to share evidence or documents without revealing where they are or who they are. The project already has a working, security-hardened prototype (strict Content-Security-Policy enforcing zero network requests, verified metadata stripping across 12 file formats) live at github.com/chndemirpence/metasafe; this funding would go toward an independent security audit, expanding format coverage, and direct testing with the communities it's meant to serve.

---

## What problem will your project address?

People in repressive environments routinely share photos and documents as evidence — protest photos, leaked documents, screenshots of abuse — without realizing these files carry hidden data that can identify them or their location: GPS coordinates embedded in a photo's EXIF data, a camera or phone's serial number, a document's "last modified by" field, or an email's routing headers revealing an IP address.

Existing free metadata-cleaning tools (ExifCleaner, ImageOptim, exiftool-based GUIs) address only the file you directly hand them, which misses two categories of real risk we found while auditing MetaSafe's own code against these threats:

1. **Metadata nested inside a container.** A photo pasted into a Word document, embedded as a data URI inside an SVG, or attached to an email keeps its own GPS/EXIF data completely intact even after the *outer* file's own metadata (author, title) has been "cleaned" — because no tool we found recurses into the embedded media itself.
2. **Correlation across a batch.** Even when every individual file in a set is properly cleaned, sharing several together can still reveal a pattern: photos whose GPS points cluster within a couple of kilometers point to a "base of operations" (a home or office), and a shared camera serial number or document author name links files that were meant to look independent.

Both gaps mean a person can follow all the "right" advice — clean your photo before posting — and still be identified or located. The consequence in the environments OTF works in is not abstract: it is doxxing, arrest, or retaliation against the person or the people they're protecting.

---

## If this project is funded, what form will it take?

**Technical Development** — taking an existing, working, open-source internet freedom tool and improving upon its security, usability, and adaptability.

---

## Give a brief overview of the activities in this project.

MetaSafe already has a working prototype: 12 supported file formats (JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC/HEIF, PDF, DOCX/XLSX/PPTX, EML, MP3/WAV/M4A/FLAC, MP4), each independently verified end-to-end with crafted test files rather than just code review — a pass that caught and fixed several real "false-safety" bugs (e.g., an SVG cleaner that silently did nothing due to an invalid selector, a TIFF cleaner that zeroed a pointer to GPS data but left the actual coordinates recoverable). It also has a strict Content-Security-Policy that makes the "zero upload" privacy claim technically enforced rather than just promised, and two features we believe are novel in this space: recursive cleaning of metadata embedded inside container files, and a batch-level correlation-risk detector.

**Objective 1: Independent security audit.**
Activity 1.1: Commission a third-party security review of the CSP configuration, the WASM (libheif) integration, and the client-side cleaning logic across all 12 formats.
Activity 1.2: Remediate any findings and publish the audit report alongside the open-source code.
Deliverable: Public audit report; patched release.

**Objective 2: Expand format coverage to close known gaps.**
Activity 2.1: Add OGG Vorbis cleaning (currently refused rather than faked, pending a full container-safe rewrite).
Activity 2.2: Scope RAW format (CR2/NEF/ARW) support used by professional and prosumer cameras common among photojournalists.
Deliverable: OGG support shipped; RAW feasibility assessment and, if viable, initial implementation.

**Objective 3: Direct testing with target communities.**
Activity 3.1: Partner with [SEN DOLDUR — varsa bir gazetecilik/dijital güvenlik STK'sı, yoksa "digital security trainers and journalism organizations we identify during the project"] to test MetaSafe with actual journalists and activists, gathering feedback on usability, trust, and gaps we can't see from the maintainer's side.
Activity 3.2: Incorporate findings into the UI/UX and documentation.
Deliverable: Testing report; usability revisions.

**Objective 4: Sustainability.**
Activity 4.1: Write contributor documentation and a maintenance plan so the project can continue past the funded period regardless of funding outcome.

**Estimated timeline:** ~15–20 days of work per objective, sequenced rather than parallel given single-maintainer capacity — see funding period below.

---

## Are there similar projects that exist already? How is your project different or complementary to those projects?

Similar tools: [ExifCleaner](https://github.com/szTheory/exifcleaner), [ImageOptim](https://imageoptim.com/), [Metapho](https://metapho.io/), and exiftool-based GUIs. All are excellent at their core job — stripping a single file's own metadata — and MetaSafe doesn't aim to replace exiftool for power users who already know how to use it.

MetaSafe is complementary in three ways: (1) it targets non-technical at-risk users who need something that works with zero setup, in a browser, on any device, rather than a command-line tool; (2) none of the tools we surveyed recurse into embedded media inside a container (a photo inside a Word doc, an SVG, or an email attachment); (3) none check for cross-file correlation risk across a batch. We see this as filling a specific gap rather than competing for the same audience.

---

## How long do you estimate activities will take?

**6 months.**

---

## How much funding do you estimate you will need? (In US Dollars)

**[SEN DOLDUR]** — bir öneri: OTF'nin "ideal" aralığı $50k–$200k / 6-12 ay diyor, ama bu tek-geliştiricili bir tarayıcı aracı; bütçeyi şişirmek yerine gerçek kalemlere göre gerekçelendirmek daha güçlü bir başvuru olur:
- Bağımsız güvenlik denetimi (3. parti): ~$15,000–$25,000
- Format genişletme + geliştirici zamanı (6 ay, kısmi zamanlı): ~$15,000–$25,000
- Topluluk testi/kullanıcı araştırması (katılımcı ücretleri + ortak kuruluş desteği): ~$5,000–$10,000
- **Toplam öneri: ~$35,000–$60,000**

Bu, "ideal aralığın" altında ama OTF'nin değerlendirme kriterlerinden biri **"cost effective mi?"** — gerçek ihtiyaca göre istemek, şişirilmiş bir rakamdan daha güçlü bir sinyal.

---

## Who would benefit from this project?

Journalists, human rights defenders, activists, protesters, and whistleblowers who need to share photographic or documentary evidence without revealing their location or identity — plus, more broadly, anyone in a repressive environment who shares photos or documents and doesn't have the technical background to know metadata is a risk at all.

---

## Where are your intended users, or audiences located?

MetaSafe is a browser-based tool with no geographic restriction, but its 7 supported languages (Turkish, English, Farsi, Arabic, Russian, Chinese, Urdu) reflect the regions it's built with in mind: Turkey and the broader MENA region, Iran, Russophone countries, China, and Urdu-speaking South Asia (Pakistan) — regions OTF's own mission explicitly names. **Dürüst not:** bu dil kapsamı bir niyet göstergesi, henüz bu topluluklarla doğrudan kullanıcı araştırması yapılmadı — Objective 3'ün amacı tam olarak bu.

---

## What is your name?

**[SEN DOLDUR]**

---

## What email address should we use to contact you?

**[SEN DOLDUR]** — OTF ile iletişim bunun üzerinden yürüyecek, dikkatli seç.

---

## Why are you, and your team members, the right people to work on this project?

**[SEN DOLDUR — burayı kesinlikle uydurmayacağım.]** OTF özellikle şunu soruyor: hedef kitleyle (gazeteci/aktivist/at-risk kullanıcı) bağlantın var mı, onlardan biri misin, onlarla çalıştın mı? Ben bilmiyorum, sen yazmalısın. Teknik tarafı ben yazabilirim, örnek bir taslak:

> "Solo yazılımcı olarak MetaSafe'in tüm çalışan prototipini geliştirdim ve titiz bir test metodolojisiyle (her formatı gerçek, hazırlanmış zararlı metadata içeren dosyalarla uçtan uca doğrulama) güvenlik sertleştirme sürecini yürüttüm — bu süreçte SVG temizleyicisinin tamamen bozuk olduğu ve TIFF temizleyicisinin GPS verisini gerçekte silmediği gibi kritik 'sahte güvenlik' hatalarını buldum ve düzelttim. [BURAYA hedef kitleyle bağlantın/deneyimin/neden bu konuyu önemsediğin eklenmeli]"

---

## What is your proposed start date for this project?

N/A — bu soru sadece "Community Convenings" kategorisi için soruluyor, bizim kategorimizde (Technical Development) yok.

---

## Sıradaki adım

Yukarıdaki `[SEN DOLDUR]` alanlarını doldur (özellikle "neden sen" ve e-posta), bütçe rakamını onayla/değiştir, ben de son haliyle OTF'nin online formuna (apply.opentech.fund) birebir geçirmene yardım edeyim.
