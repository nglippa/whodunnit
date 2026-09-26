# Third-party notices

## no-ai-slop (Peter Yang), MIT

Whodunnit's `anti-slop` rule pack (`data/rules/packs/anti-slop.json`) and one imported rule (`data/rules/packs/imported.json`) adapt the patterns in https://github.com/petergyang/no-ai-slop. Pattern names, word lists and guidance are adapted; each rule records its source in `source`.

```
MIT License

Copyright (c) 2026 Peter Yang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Sources consulted, not copied

- **realrossmanngroup/no_ai_slop_writing_rules.** This repository publishes no licence, so all rights are reserved. It is registered as `reference-only` in `data/sources/library.json`, and the compiler refuses to turn its text into rules. None of its text or voice is included here.
- **Wikipedia: "Signs of AI writing"** (CC BY-SA 4.0). It is registered as `derived-rules-only`. Its text is not stored in the repository: normalised extractions and candidates are gitignored. No rule has been activated from it.
- **book-to-skill.** Principles only (source-grounded rules, provenance, candidate review). No code or text was copied, and it is not a runtime dependency.

## Runtime and tooling dependencies

npm and Python dependencies keep their own licences; see `package.json`, `pnpm-lock.yaml` and `tools/source-ingestion/uv.lock`. Scrapling (BSD-3-Clause) is used only in the developer ingestion tool.
