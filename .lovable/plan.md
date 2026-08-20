# Module 10 — Slide 2 domain correction (homeworksinspections.com → .ca)

Content-only fix to `launchpad_slides`. No schema changes, no other slides or modules touched.

## Target

- Module 10 unified — `767ffb05-c72d-4a3f-9284-50841f3a5bfd`, slide_number 2 ("Home Inspectors & Staging").

## Change

A single in-place `UPDATE` scoped by `module_id` AND `slide_number = 2` that replaces the exact substring `homeworksinspections.com` with `homeworksinspections.ca` inside the HomeWorks line:

```text
before: HomeWorks Home Inspectors — 905-630-8775, dan@homeworksinspections.com, homeworksinspections.com
after:  HomeWorks Home Inspectors — 905-630-8775, dan@homeworksinspections.com, homeworksinspections.ca
```

The email `dan@homeworksinspections.com` stays `.com` — only the trailing website domain changes to `.ca`. The update uses `replace(body, 'homeworksinspections.com', 'homeworksinspections.ca')` is NOT safe here because it would also alter the email. Instead the full body is rewritten with the single character changed in the website domain only, leaving every other character (emails, phone, staging section, line breaks) byte-identical.

## Verification

After the fix, re-query slide_number 2 and paste the raw body verbatim so you can confirm the website domain is `.ca`, the email is still `.com`, and nothing else shifted. Also confirm slide 1 and 3 bodies are unchanged (same lengths as before: 732 / 587).
