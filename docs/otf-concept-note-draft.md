# OTF Internet Freedom Fund — Concept Note (MetaSafe)

> Kaynak: https://apply.opentech.fund/internet-freedom-fund-concept-note
> Bu taslak OTF'nin gerçek form alanlarına birebir uyacak şekilde hazırlandı.
> Aşağıdaki her cümle gerçek, doğrulanmış çalışmaya dayanıyor — hiçbir şey uydurulmadı.
> Doğrudan kopyala-yapıştır ile forma geçirilebilir durumda.

---

## Project Title

**MetaSafe — The Only Metadata Cleaner That Checks What Others Miss**

---

## Describe your project in 1-3 sentences.

MetaSafe is a free, open-source, 100% client-side tool that strips identifying metadata — GPS coordinates, device serial numbers, author names, routing headers — from photos, documents, and emails before at-risk users share them, with two capabilities we believe are unique in this space: it recursively cleans metadata hidden *inside* embedded photos (a picture pasted into a Word doc, an email attachment, an SVG) that every other tool we tested leaves untouched, and it detects cross-file correlation risk — when several individually "clean" photos still reveal a home or office location because their GPS points cluster together. The working prototype is live and open source (github.com/chndemirpence/metasafe), hardened with a strict Content-Security-Policy that makes its "zero upload" promise technically enforced rather than merely claimed, and every one of its 12 supported file formats has been individually verified end-to-end against real, crafted test files rather than assumed correct. This funding supports the final step from a rigorously-tested prototype to a professionally audited, community-validated release.

---

## What problem will your project address?

People in repressive environments routinely share photos and documents as evidence — protest photos, leaked documents, screenshots of abuse, proof of a police stop — without realizing these files carry hidden data that can identify them or their location: GPS coordinates in a photo's EXIF data, a camera or phone's serial number, a document's "last modified by" field, an email's routing headers revealing an IP address, or simply a face, license plate, or name that's plainly visible in the image itself.

The advice "clean your metadata before you post" is widely given and widely followed — and it still isn't enough, for two reasons we found no other free tool addressing:

1. **Metadata nested inside a container.** A photo pasted into a Word document, embedded as a data URI inside an SVG, or attached to an email keeps its own GPS/EXIF data completely intact even after the outer file's own metadata (author, title) has been "cleaned" — because no tool we surveyed (ExifCleaner, ImageOptim, exiftool-based GUIs) recurses into the embedded media itself. MetaSafe does.
2. **Correlation across a batch.** Even when every individual file is properly cleaned, sharing several together can still reveal a pattern: photos whose GPS points cluster within a couple of kilometers point to a "base of operations" — a home, an office, a safehouse — and a shared camera serial number or document author name links files meant to look independent. MetaSafe checks the whole batch for exactly this, before anything is shared.

We also want to be candid about a related discovery, because we think it's directly relevant to OTF's mission of digital security for at-risk communities: while building MetaSafe's own redaction capability, we found that the most common way people try to hide sensitive information in a PDF — drawing a black box over text — usually does not remove the underlying text at all. It's still fully copy-pasteable by anyone who receives the file. This is not a hypothetical; it is a well-documented, recurring cause of real leaks. MetaSafe now detects this "fake redaction" pattern in any PDF a user uploads, and provides a genuine fix: a true redaction tool that fully rasterizes only the pages that are redacted (so there is no text layer left to extract), while leaving every other page's text fully searchable.

The consequence of any of these gaps, in the environments OTF works in, is not abstract: it is doxxing, arrest, or retaliation against the person or the people they were trying to protect.

---

## If this project is funded, what form will it take?

**Technical Development** — taking an existing, working, open-source internet freedom tool from a rigorously self-tested prototype to a professionally audited, community-validated release.

---

## Give a brief overview of the activities in this project.

**Where the project stands today (already built and verified, not proposed):**
- 12 file formats supported end-to-end — JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC/HEIF, PDF, DOCX/XLSX/PPTX, EML, MP3/WAV/M4A/FLAC, MP4 — each individually verified by cleaning a crafted test file containing real sensitive metadata and confirming it is actually gone, not just assumed. This process caught and fixed genuine bugs that would have left users falsely believing they were protected — for example, a TIFF cleaner that erased the pointer to a photo's GPS data but left the coordinates themselves fully recoverable from the raw file, and an SVG cleaner that a broken selector caused to silently do nothing at all. Both are fixed and re-verified.
- **Deep Clean**: recursive metadata removal from photos embedded inside Office documents, SVGs, and email attachments.
- **Batch Correlation Risk**: cross-file analysis for GPS clustering, shared device fingerprints, and shared document authorship across a set of files about to be shared together.
- **Manual Redaction**: draw-to-redact for images (baked into the pixels, not a removable overlay) and true page-level flattening for PDFs, so a redacted page provably has no extractable text underneath — closing the "fake redaction" gap described above.
- **Panic Wipe**: an emergency one-click / triple-key-press action that instantly clears all loaded files and session data, for border-crossing or device-search scenarios.
- **Real fingerprint resistance**: an optional mode that measurably resists reverse-image-search matching (validated against a real perceptual-hash implementation, not just claimed), clearly scoped and honestly documented for what it does and doesn't protect against.
- A strict Content-Security-Policy enforcing zero external network requests — the "your files never leave your device" promise is a technical guarantee, not marketing copy.

**What this funding accomplishes over a 3-month period:**

**Objective 1 — Independent security audit (Month 1).**
Activity 1.1: Commission a third-party security review of the CSP configuration, the WASM (libheif, pdf.js) integrations, and the client-side cleaning logic across all 12 formats.
Activity 1.2: Remediate findings and publish the audit report alongside the open-source code, so the "zero upload" and "verified clean" claims are independently checkable, not just self-reported.
Deliverable: Public audit report; patched release.

**Objective 2 — Real-world validation with the community it serves (Months 1–2).**
Activity 2.1: Structured testing with journalists and activists — including individuals I have direct, existing relationships with — using MetaSafe on their actual workflows, gathering feedback on trust, usability, and gaps invisible from a maintainer's chair.
Activity 2.2: Incorporate findings into the interface, documentation, and translations (currently 7 languages: Turkish, English, Farsi, Arabic, Russian, Chinese, Urdu — chosen to match communities under active censorship/surveillance pressure).
Deliverable: Testing report; revised release informed by real at-risk users, not assumptions about them.

**Objective 3 — Close the two known format gaps (Months 2–3).**
Activity 3.1: OGG Vorbis metadata cleaning. Currently MetaSafe refuses to fake success here rather than risk corrupting the file (Ogg's page/CRC framing makes a naive fix unsafe) — this objective funds doing it properly.
Activity 3.2: RAW format (CR2/NEF/ARW) feasibility assessment, used heavily by photojournalists specifically, and initial implementation if viable within scope.
Deliverable: OGG support shipped; RAW assessment delivered, with implementation if feasible.

**Objective 4 — Sustainability (throughout).**
Activity 4.1: Contributor documentation and a maintenance plan so the project continues on its own beyond the funded period.

---

## Are there similar projects that exist already? How is your project different or complementary to those projects?

Similar tools: [ExifCleaner](https://github.com/szTheory/exifcleaner), [ImageOptim](https://imageoptim.com/), [Metapho](https://metapho.io/), and exiftool-based GUIs. Each is genuinely good at its core job — stripping a single file's own metadata — and MetaSafe isn't trying to replace exiftool for power users who already know how to drive it.

MetaSafe is complementary in ways we verified aren't already covered elsewhere: (1) it targets non-technical at-risk users who need something that works with zero setup, in any browser, on any device — not a command-line tool; (2) it is, as far as our research found, the only free tool that recurses into metadata embedded inside a container file; (3) it is the only one that checks cross-file correlation risk across a batch before sharing; (4) it is the only free tool we found that both detects fake PDF redactions and provides a genuinely safe way to fix them. We see this as filling a specific, real gap rather than competing for the same users as existing tools.

---

## How long do you estimate activities will take?

**3 months.** The compressed timeline reflects that the hardened prototype and its novel features already exist and are verified today — this funding covers independent validation (audit + real user testing) and closing the two remaining, clearly-scoped format gaps, not building the core product from scratch.

---

## How much funding do you estimate you will need? (In US Dollars)

**$28,000**, itemized rather than rounded to fit a range:
- Independent third-party security audit: **$15,000**
- Developer time for Objective 3 (OGG fix + RAW assessment/implementation) and Objective 2 revisions, 3 months part-time: **$9,000**
- Community testing — participant time/compensation for activist and journalist testers, translation QA: **$4,000**

This is below OTF's stated ideal range because the core engineering is already done and verified; we'd rather ask for what the remaining, well-defined work actually costs than round up to fit a bracket.

---

## Who would benefit from this project?

Journalists, human rights defenders, activists, protesters, and whistleblowers who need to share photographic or documentary evidence without revealing their location or identity — and, more broadly, anyone in a repressive environment sharing photos or documents who has no technical background to know metadata (or a visible face, or a fake redaction) is a risk at all. The redaction and fake-redaction-detection features specifically target the moment someone is preparing to publish or hand over a sensitive document — exactly where a mistake is hardest to undo.

---

## Where are your intended users, or audiences located?

MetaSafe is browser-based with no geographic restriction, and its 7 supported languages (Turkish, English, Farsi, Arabic, Russian, Chinese, Urdu) were chosen to match regions under active censorship and surveillance pressure: Turkey and the broader MENA region, Iran, Russophone countries, China, and Urdu-speaking South Asia. I also have direct, existing relationships with 7 activists who will be engaged as real-world testers under Objective 2 — this project's validation isn't starting from a cold outreach list.

---

## What is your name?

**Cihan Demirpençe**

---

## What email address should we use to contact you?

**ussstarfairy@gmail.com**

---

## Why are you, and your team members, the right people to work on this project?

I am a solo developer and the sole maintainer of MetaSafe, and I built its entire working prototype myself — not just the core cleaning logic, but the security posture around it: the enforced Content-Security-Policy, the WASM integrations for HEIC and PDF handling, and the newer redaction, panic-wipe, and correlation-risk features. Critically, I didn't declare the project finished and move on — I ran every format through an adversarial verification pass using deliberately crafted files containing real sensitive metadata, specifically to catch the gap between "should work" and "actually works." That pass found and fixed genuine bugs that would otherwise have left users with a false sense of protection, including a TIFF cleaner that looked correct but left GPS coordinates fully recoverable, and an SVG cleaner that silently did nothing due to a broken selector. I treat that kind of bug as the single most serious failure mode this project could have, because the people relying on it are trusting their safety to it.

I also have direct, existing relationships with 7 activists who will take part in real-world testing under this grant — this isn't a cold-start connection to the community the project serves; it's people I already know and can put the tool in front of quickly, with feedback that reflects how it holds up outside a developer's own testing.

---

## What is your proposed start date for this project?

N/A — this field only applies to the Community Convenings category; this application is Technical Development.

---

## Sonraki adım

Bu hâliyle doğrudan apply.opentech.fund'daki forma kopyalanabilir. Tek kontrol noktası: e-posta olarak `ussstarfairy@gmail.com` kullandım — istersen `cihan@calcoras.com` ile değiştiririm, ama calcoras.com tamamen ayrı (finans/AdSense) bir proje olduğu için incelemeciye karışık gelebilir diye nötr olanı seçtim.
