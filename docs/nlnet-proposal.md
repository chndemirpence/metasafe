# NLnet / NGI Zero Proposal Draft — MetaSafe

> Source: https://nlnet.nl/propose/ (fields verified 2026-07-29)
> **Status: DRAFT, not submitted.** NLnet's general/open call is paused as of
> this writing; only NGI Taler and NGI Fediversity are open (neither fits),
> closing 2026-08-01. The general fund reopens "after summer 2026" under the
> reorganized "Open Internet Stack" effort. This draft is prepared now so
> submission can happen the day the call reopens.
>
> Scoped as a library-extraction effort (MetaSafe Core), distinct from the
> main MetaSafe application itself.

---

## Your name
Cihan Demirpençe

## Email address
ussstarfairy@gmail.com

## Organisation
None — applying as an individual.

## Country
Turkey

## Proposal name
MetaSafe Core — a reusable, standalone metadata-scrubbing library extracted from MetaSafe

## Website / wiki
https://github.com/chndemirpence/metasafe

## Abstract

MetaSafe is a free, open-source, 100% client-side tool (live, MIT-licensed, github.com/chndemirpence/metasafe) that strips identifying metadata — GPS coordinates, device serial numbers, author names, embedded photos inside documents/emails, cross-file GPS correlation — from 12 file formats before at-risk users share them. Every format cleaner was individually verified against crafted adversarial test files rather than assumed correct, which is what caught two real, shipped-looking-fine bugs: a TIFF cleaner that erased the *pointer* to GPS/EXIF data while leaving the coordinates themselves fully recoverable from the raw file, and an SVG cleaner that a broken CSS selector caused to silently do nothing at all. Both are fixed and verifiable in the public commit history: [70bc345](https://github.com/chndemirpence/metasafe/commit/70bc345) — "fix: verify every format processor end-to-end, fix real cleaning bugs."

Today the verified cleaning logic for all 12 formats lives inside one application, reachable only through MetaSafe's own UI. This proposal is to extract it into **MetaSafe Core**: a standalone, dependency-light, documented JavaScript library with a stable public API, published to npm and usable by *any* project — browser extensions, other privacy tools, CLI utilities, or non-JS ecosystems via a documented wire format — with no dependency on MetaSafe's UI at all. The concrete outcome: the next person building a metadata-scrubbing tool imports a maintained, audited, MIT-licensed dependency instead of rediscovering the same TIFF pointer bug and the same SVG selector bug from scratch.

## Prior involvement

I am the sole author and maintainer of MetaSafe, with ~34 years of solo programming experience (coding since 1992, certified 1991). I built MetaSafe's entire architecture myself: the strict Content-Security-Policy that makes its "zero upload" claim technically enforced rather than marketing copy, the WASM integrations (libheif for HEIC/HEIF, pdf.js for PDF), and all 12 format cleaners. Critically, I did not declare the project finished once it ran without errors — I ran an adversarial verification pass specifically designed to catch the gap between "should work" and "actually works," and that pass is what found the two bugs described above (commit [70bc345](https://github.com/chndemirpence/metasafe/commit/70bc345)). This same discipline — verify against crafted hostile input, not just happy-path testing — is what I intend to apply to the extracted library's public test suite under this grant.

I have shipped two other privacy/security-adjacent tools this year using the same methodology: USAFE (censorship/surveillance/secure-communication toolkit, github.com/chndemirpence/usafe, also proposed to NLnet separately, see USAFE Detectors) and two AGPL-licensed commons projects, Recourse and Attune (github.com/chndemirpence/recourse, /attune), likewise prepared for NLnet funding.

## Requested Amount (in Euro)

€18,000

## Milestones

**Milestone 1 — Extraction, API, test suite (4–6 weeks, €9,000).**
Extract all 12 format cleaners from the application into a standalone module with a stable, versioned public API (one function call for the common case; per-format options for advanced callers). Port the existing adversarial test files — the same ones that caught the TIFF and SVG bugs — into the library's own test suite, so the library is never released in a state weaker than the application it was extracted from. Publish an alpha to npm.
*Deliverable: public alpha release on npm; test suite green in CI; migration notes for MetaSafe itself to depend on the extracted library (dogfooding, not just publishing).*

**Milestone 2 — Independent security review (3–4 weeks, €5,000).**
Commission a third-party review of the extracted library specifically — its own attack surface as a standalone dependency (e.g. what happens if it's fed malformed/truncated input directly, without the application's own file-type gating in front of it). Remediate findings, tag a 1.0.
*Deliverable: public audit report; 1.0 release on npm.*

**Milestone 3 — Documentation and adoption (3–4 weeks, €4,000).**
Full API documentation, a migration guide for anyone currently using ad-hoc metadata-stripping code, at least one worked non-browser example (a Node CLI), and direct outreach to three or more potential adopter projects (browser-extension privacy tools, exiftool-GUI maintainers).
*Deliverable: published docs site; ≥1 real external adopter or a documented integration attempt if adoption takes longer than the funded period.*

## Other funding sources

No.

## Comparison with existing efforts

exiftool remains the standard for command-line metadata inspection/removal but is a native binary, not designed to run in-browser or be embedded as a small JS dependency, and — as our own adversarial testing found across the tools we surveyed (ExifCleaner, ImageOptim) — does not recurse into metadata embedded *inside* a container file (a photo pasted into a Word document, an SVG, an email attachment). That recursive-cleaning gap is exactly what MetaSafe's cleaners close, and no maintained JS library currently occupies that niche. MetaSafe Core is not trying to replace exiftool for power users; it targets the "embed this as a dependency, zero native bindings, works in a browser and in Node" use case that currently has no tested, audited occupant.

## Technical challenges

Two problems already solved once in the application, which the extraction must preserve without regressing — this is the core technical risk of any extraction, and the reason Milestone 1 explicitly ports the existing adversarial tests rather than writing new ones from scratch: (1) TIFF's nested sub-IFD structure, where a naive cleaner can zero the *pointer* to GPS/EXIF data while leaving the actual bytes fully recoverable elsewhere in the file — only caught by raw byte-level inspection after "cleaning," not by re-reading tags through the same library that wrote them; (2) recursive cleaning of container formats (Office documents, SVGs, EML), where embedded media carries its own independent metadata that survives even after the outer file's own metadata is stripped. The open technical challenge for the extraction itself is API design: keeping the common case to one function call with sane defaults, while still exposing the format-specific edge cases (like TIFF sub-IFD recursion) that a downstream consumer performing their own audit needs to be able to reason about.

## Ecosystem description

The natural adopters of MetaSafe Core are developers building privacy tooling who today either ship exiftool as a native binary dependency (heavy, platform-specific, hard to sandbox in a browser extension) or write their own partial metadata stripper — and, based on what our own adversarial testing found among existing tools in this space, frequently get it wrong in the same specific ways MetaSafe originally did. Publishing this as a small, audited, well-documented library is a direct instance of NLnet's stated funding preference for reusable components over one-off applications. Concrete engagement plan for Milestone 3: direct outreach to maintainers of comparable open-source metadata/privacy tools (starting with the exiftool-GUI and browser-extension privacy-tool ecosystems) once the library has a stable, audited 1.0 — not a vague "the community will find it" hope, but named outreach with a working, published package to point to.

## Generative AI usage

I have used generative AI (Claude, Anthropic) substantially in this project's development: for code review that directly found the TIFF pointer-zeroing bug and the SVG selector bug described above (in combination with adversarial test files I wrote), for implementation of individual format cleaners, and for drafting this proposal text, which I have reviewed and edited myself. Every factual claim in this proposal — the bugs found, the commit that fixed them, the test results, the architecture — is real and independently checkable in the public repository; nothing here was invented for the purpose of this application.

## PGP
Not provided.
