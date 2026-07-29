# NLnet / NGI Zero Proposal Draft — MetaSafe

> Source: https://nlnet.nl/propose/ (fields verified 2026-07-29)
> **Status: DRAFT, not submitted.** NLnet's general/open call is paused as of
> this writing; only NGI Taler and NGI Fediversity are open (neither fits),
> closing 2026-08-01. The general fund reopens "after summer 2026" under the
> reorganized "Open Internet Stack" effort. This draft is prepared now so
> submission can happen the day the call reopens.
>
> Deliberately scoped DIFFERENT from MetaSafe's pending OTF Internet Freedom
> Fund application (#22833, concept-note stage) — see "Other funding sources"
> below for why, and why that's honest rather than double-dipping.

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

MetaSafe is a free, open-source, 100% client-side tool (live, MIT-licensed, github.com/chndemirpence/metasafe) that strips identifying metadata — GPS coordinates, device serial numbers, author names, embedded photos inside documents/emails, cross-file GPS correlation — from 12 file formats before at-risk users share them. Every format cleaner was individually verified against crafted adversarial test files, which caught real bugs (a TIFF cleaner that erased the GPS pointer but left the coordinates recoverable; an SVG cleaner that silently did nothing due to a broken CSS selector) that would otherwise have left users with a false sense of protection.

Today the verified cleaning logic for all 12 formats lives inside one application. This proposal is to extract it into **MetaSafe Core**: a standalone, dependency-light, documented JavaScript library with a stable API, published to npm and usable by *any* project — browser extensions, other privacy tools, CLI utilities, or non-JS ecosystems via a documented wire format — without needing MetaSafe's UI at all. The goal is that the next person building a metadata-scrubbing tool doesn't have to rediscover the same TIFF/SVG bugs we already found and fixed; they can depend on a maintained, audited component instead.

## Prior involvement

I am the sole author and maintainer of MetaSafe. I have ~34 years of solo programming experience (coding since 1992, certified 1991), and have built and shipped several other privacy/security-adjacent tools this year, including USAFE (censorship/surveillance/secure-communication toolkit, github.com/chndemirpence/usafe) and two AGPL-licensed commons projects, Recourse and Attune (github.com/chndemirpence/recourse, /attune), the latter two also prepared for NLnet funding separately.

## Requested Amount (in Euro)

€18,000

## Budget usage explanation

- €9,000 — extracting the 12 format-cleaners from the application into a standalone library with a stable, documented public API, a proper test suite (building on the adversarial test files already written for the app), and packaging for npm.
- €5,000 — an independent security review of the extracted library specifically (the audit requested from OTF, if funded, covers the *application*; this covers the *library* as a separately-consumable artifact, which is a different, non-duplicate review surface — see below).
- €4,000 — documentation (API docs, a migration guide for anyone currently using ad-hoc metadata-stripping code, and worked examples for at least one non-browser consumer, e.g. a Node CLI).

## Other funding sources

Yes — full disclosure. MetaSafe also has a pending concept-note application to the Open Technology Fund's Internet Freedom Fund (#22833, submitted 2026-07-29, no decision yet), requesting $28,000 USD for: an audit of the *application's* CSP/WASM integration, closing two format gaps (OGG Vorbis, RAW), and real-world testing with activists.

These two asks are deliberately scoped not to overlap: OTF's ask is about hardening and testing the *end-user application*; this NLnet ask is about extracting and hardening a *reusable library* other projects can depend on — a different artifact, a different audit surface, and a different kind of deliverable (NLnet's own guidance favors reusable components over polished single applications, which is exactly this gap). If both were funded, no milestone here would duplicate a milestone there. If asked, I will provide the OTF concept note in full for cross-reference.

## Comparison with existing efforts

exiftool remains the standard for command-line metadata inspection/removal but is not designed to run in-browser or be embedded as a small dependency, and doesn't recurse into metadata embedded inside a container file (a photo inside a Word document, an SVG, an email attachment) — which is the specific gap MetaSafe's cleaners close and none of exiftool, ExifCleaner, or ImageOptim address. MetaSafe Core is not trying to replace exiftool for power users; it's filling the "embed this as a dependency, zero native bindings, works in a browser and in Node" niche that currently has no maintained, tested occupant.

## Technical challenges

The two hardest problems already solved in the application, which the extraction has to preserve without regressing: (1) TIFF's nested sub-IFD structure, where a naive cleaner can zero the *pointer* to GPS/EXIF data while leaving the actual bytes fully recoverable elsewhere in the file — caught only by raw byte-level inspection after "cleaning," not by re-reading tags through the same library that wrote them; (2) recursive cleaning of container formats (Office documents, SVGs, EML) where the embedded media has its own independent metadata that survives even after the outer file's own metadata is stripped. The remaining open technical challenge is designing a public API surface that stays simple for the common case (one function call, sane defaults) while still exposing the per-format edge cases (like the TIFF sub-IFD recursion) that a downstream consumer might need to reason about for their own audit purposes.

## Ecosystem description

The natural users of MetaSafe Core are other people building privacy tooling who currently either ship exiftool as a native binary dependency (heavy, platform-specific, hard to sandbox) or write their own partial metadata stripper (and, based on what MetaSafe's own adversarial testing found among existing tools, often get it wrong in the same ways MetaSafe originally did). Publishing this as a small, audited, well-documented library is a direct instance of NLnet's stated preference for reusable components over one-off applications. I intend to engage the browser-extension privacy-tool community (uBlock Origin-adjacent developer channels, r/privacy tool threads) once the library has a stable 1.0 API and the independent audit is complete.

## Generative AI usage

I have used generative AI (Claude, Anthropic) substantially in this project's development: for code review and bug-finding (it was involved in identifying the TIFF pointer-zeroing bug and the SVG selector bug described above, alongside my own adversarial test files), for implementation of individual format cleaners, and for drafting this proposal text itself, which I have reviewed and edited. All claims of fact in this proposal (bugs found, test results, architecture) reflect real, verified work — the adversarial test files and their results are in the repository's history, not invented for this application.

## Prior involvement (continued) / PGP
Not provided.
