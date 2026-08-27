# Fix CMA Boss comparable extraction (Melissa's ticket)

## What the data shows

Melissa's ticket (opened 18:54 today from the CMA Boss page) reports two things: uploaded comparables not extracting, and the CloudCMA link not working. The two have different causes, and only one is currently proven.

**The CloudCMA link problem is confirmed and reproducible.** The link she submitted at 18:51 was:

```text
https://reports3.cloudcma.com/231222ec9086c24fa7403c6cc8d15bc6.pdf?1787854388
```

That is a **PDF file**, not a web page. The link extractor assumes every URL is HTML: it fetches the URL, strips script and style tags, and hands the remaining "text" to the AI. For a PDF it therefore feeds compressed binary garbage to the model, which finds nothing. It returned 0 comparables in 5.7 seconds.

This is not specific to her. Every link attempt ever recorded in the import log returned 0 comparables — four attempts across four different agents and five months, including one earlier CloudCMA PDF link and one shortened link. The link import path has never successfully extracted a single comparable.

**Two smaller defects make the failure look like nothing happened at all:**

1. When the extractor succeeds technically but finds nothing, the app still shows a green "Extracted 0 comps from link" success toast. Nothing tells the agent it failed or what to do next.
2. A failed extraction overwrites the comparables list with an empty array, so any comps already entered by hand disappear.

**The PDF upload problem is not yet proven.** Melissa has no PDF import records at all, because the import log is only written after a *successful* extraction — failures leave no trace. PDF uploads themselves are known to work: other agents have imported 5-7 comps from PDFs recently, and a test PDF extracted cleanly today. Most likely she downloaded the same CloudCMA PDF and hit something specific to that file, but that cannot be confirmed without the file itself.

## What to change

### 1. Make the link importer handle PDF links (the actual fix)

In `cma-scrape-link`, check the response `Content-Type` and the URL extension before assuming HTML.

- **PDF response**: extract real text from the PDF bytes server-side, then run the existing comp-extraction prompt against that text — the same path that already works for uploaded PDFs. This makes CloudCMA "share PDF" links work, which is the link format agents actually paste.
- **HTML response**: keep today's behaviour, plus detect a login or access-denied page (sign-in form markup, or a page under a few hundred characters of real text) and return a clear message: the link requires a CloudCMA login, so please use the public share link or download the PDF and upload it.
- **Anything else** (images, unknown types): return a plain "this link isn't a CMA report" message rather than silently returning nothing.

### 2. Stop reporting failure as success

In `CMAInputForm`:

- Only show the success toast when at least one comparable came back. Zero comps gets a warning that says nothing could be read from the file or link, and suggests uploading the PDF or adding comps manually.
- Never replace existing comparables with an empty list — a failed extraction leaves what the agent already has untouched.
- Apply the same treatment to both entry points that run extraction, so the wizard step and the re-extract button behave identically.

### 3. Record failed imports so the next ticket is diagnosable

Write a `cma_import_logs` row on failure as well as success, capturing the source type, the URL or file name, extracted text length, and the error. Without this, a report like Melissa's leaves nothing behind to investigate. No schema change is needed — the existing columns cover it, with the failure reason stored in the existing skip-reasons field.

### 4. Close the loop with Melissa

Reply on her ticket explaining that the CloudCMA link issue is fixed and that PDF links now work, and ask her to send the specific PDF she uploaded so the second half of her report can be reproduced. Leave the ticket open until she confirms.

## Verification

- Re-run her exact CloudCMA PDF link through the link importer and confirm comparables come back rather than zero.
- Run a CloudCMA login-required link and confirm the agent gets the "needs a public share link" message, not a green success toast.
- Confirm a failed run leaves manually entered comparables in place.
- Confirm both success and failure now appear in the import log.

## Technical notes

- Files touched: `supabase/functions/cma-scrape-link/index.ts` and `src/components/cma/CMAInputForm.tsx` (`runExtraction`, `runLinkExtraction`, `handleExtractComps`, `handleProceedToReview`, `handleReRunExtraction`).
- Server-side PDF text extraction runs in the edge function via a Deno-compatible PDF text library; the existing extraction prompt and response shape stay unchanged, so the review step and everything downstream keep working as-is.
- No database migration and no changes to `cma-analyze` or the report generator.
