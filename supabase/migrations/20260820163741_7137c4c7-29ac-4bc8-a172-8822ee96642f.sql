
-- Park PA/KC rows
UPDATE launchpad_slides SET slide_number = 106 WHERE id = '472252e3-adff-4510-b5f0-debffb483412';
UPDATE launchpad_slides SET slide_number = 107 WHERE id = '157bc4ad-5cb4-4cea-a981-ac6eb3e734a2';
UPDATE launchpad_slides SET slide_number = 106 WHERE id = '9f4b79a7-2e2d-49c6-ab30-d6e008e9207e';
UPDATE launchpad_slides SET slide_number = 107 WHERE id = 'dff954ce-0e8a-4c7b-afbf-ad42f2fa6325';

-- ===== JUNIOR =====
UPDATE launchpad_slides SET title = 'Learning Objectives', body = $b$By the end of this module, the agent can:
- Identify the core forms used in a typical Ontario resale transaction and what each one does
- Walk through the key sections of the Agreement of Purchase and Sale (Form 100) and explain what to watch for in each
- Correctly handle conditions — drafting, waiving, and what happens if a deadline is missed
- Know which document to reach for when a deal changes, a condition is removed, or a deal falls through
- Know where every document gets signed and filed, and avoid the most common new-agent paperwork mistakes$b$ WHERE id = '13cf2884-2f19-46fa-9798-d340a0768c23';

UPDATE launchpad_slides SET title = 'The Core Forms Ecosystem', body = $b$- Buyer/Seller Representation Agreement + our LUXE Schedule A — the relationship-establishing paperwork that must be signed before representation begins.
- Agreement of Purchase and Sale (APS) — Form 100 for freehold residential resale, Form 101 for condos, the core transaction contract.
- Confirmation of Co-operation and Representation — discloses which brokerage/agent represents which side and the commission arrangement between them.
- Amendment to Agreement of Purchase and Sale — used any time a signed agreement's terms change after acceptance.
- Waiver / Notice of Fulfillment of Condition(s) — used to formally remove a condition once satisfied.
- Mutual Release — used if a deal falls through, to formally release both parties and direct what happens to the deposit.
- Status Certificate — condo-specific document reviewed during the conditional period.
- FINTRAC identification record — required alongside every file, for the client and, since October 2025, any unrepresented party too.$b$ WHERE id = '1905f27f-9d58-4f90-bff4-6a57aeb9d3f3';

UPDATE launchpad_slides SET title = 'Anatomy of the APS, Part 1', body = $b$- Parties & property — legal names, correct legal description/address.
- Purchase price & deposit — deposit amount, confirmation it will be certified funds delivered to the brokerage (no escrow — deposits go to the brokerage trust account).
- Chattels included / fixtures excluded — items not permanently affixed that are included must be listed explicitly; fixtures that are excluded must also be listed. When in doubt, list it — ambiguity here is one of the most common sources of post-closing disputes.
- Rental items — anything rented (hot water tank, furnace) that the buyer will assume must be disclosed.
- Irrevocability — the window during which the offer can't be withdrawn. Calculate this precisely; getting it wrong can void an otherwise good offer.$b$ WHERE id = '9584a665-a8e6-43e7-ac16-9927df49893a';

INSERT INTO launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('31ad4b3e-3406-4dd9-8ba6-3c9a3bbbb289', 4, 'content', 'Anatomy of the APS, Part 2', $b$- Closing date — avoid scheduling at the very start/end of a month when lawyers' offices are busiest; most closings happen mid-afternoon.
- HST/GST treatment — whether tax is included in or added to the purchase price; get this wrong and it becomes a real dispute at closing.
- Title search / requisition date — the period during which the buyer's lawyer can raise title issues.
- Risk — the seller typically bears risk until closing; if damage occurs before then, the buyer may accept insurance proceeds or terminate.
- Planning Act compliance — relevant to any severance of land.
- Non-residency declaration — the seller confirms Canadian residency; if not, the buyer may have withholding obligations under the Income Tax Act. Flag any non-resident seller to your mentor immediately.
- Closing mechanics — how documents, funds, and keys move through electronic registration (Teranet).$b$),
('31ad4b3e-3406-4dd9-8ba6-3c9a3bbbb289', 5, 'content', 'Conditions: Drafting, Waiving, and Deadlines', $b$Common conditions: financing, home inspection, appraisal, sale of the buyer's current home, status certificate review (condo), insurance, lawyer review.

- Non-standard or unusual conditions get built using the Clause Generator rather than freehanded, keeping wording consistent and defensible.
- A condition is removed using a Waiver or Notice of Fulfillment of Condition(s) — signed by the party the condition benefits (usually the buyer, for financing/inspection).
- If a condition deadline passes with no waiver signed and no extension agreed, the agreement is typically null and void, and the deposit is returned — confirm exact handling with your mentor, timing matters and mistakes are costly.
- Every condition deadline should be tracked, but the agent is still responsible for knowing the dates on their own file and not relying solely on someone else catching it.$b$),
('31ad4b3e-3406-4dd9-8ba6-3c9a3bbbb289', 6, 'content', 'When a Deal Changes or Falls Through', $b$- Terms change after acceptance (price, date, inclusions) → Amendment, signed by both parties.
- A condition is satisfied → Waiver / Notice of Fulfillment.
- The deal falls apart → Mutual Release, which formally ends the agreement and directs what happens to the deposit.
- Deposit disputes where both sides don't agree typically require legal involvement — never assume you can unilaterally direct where a deposit goes.$b$),
('31ad4b3e-3406-4dd9-8ba6-3c9a3bbbb289', 7, 'content', 'Where Everything Gets Signed and Filed', $b$- Every document gets sent through AuthentiSign for signature. Once executed, documents auto-file into LUXEhub.
- The Clause Generator and Transaction Checklists (LUXEhub → Buyers/Listings Resources) are the tools to lean on for anything non-standard.
- OREA Forms Explained is the resource to point clients to when they ask what a specific clause or form means — don't attempt to give legal interpretation yourself beyond what you're trained to explain; confirm anything legally ambiguous with your mentor or broker.$b$),
('31ad4b3e-3406-4dd9-8ba6-3c9a3bbbb289', 8, 'content', 'Common New-Agent Mistakes', $b$- Forgetting to attach Schedule A to the APS.
- Vague or missing chattel/fixture lists, leading to move-in disputes.
- Miscalculating irrevocability, accidentally voiding an offer.
- Missing the non-residency declaration on a seller who isn't a Canadian resident.
- Missing or incomplete FINTRAC identification records, including for unrepresented parties.
- Not tracking a condition deadline personally, and assuming "someone else has it."$b$);

UPDATE launchpad_slides SET slide_number = 9, title = 'Practice Assignment', body = $b$1) Walk through a real (or sample) Agreement of Purchase and Sale section by section with your mentor, and explain each part in your own words.
2) Practice calculating irrevocability correctly on three different sample scenarios.
3) Use the Clause Generator to draft one non-standard condition, and have your mentor review it.
4) Walk through what happens on a sample file if a financing condition deadline passes with no waiver signed.
5) Complete a full mock offer for your mentor/team to review and audit. Build one from scratch on a hypothetical property, including price, deposit, irrevocability, closing date, inclusions/exclusions, and at least one condition — using the Clause Generator if the condition isn't standard. This is the exercise that actually tests whether you understand the bare-bones elements of an offer, not just recognize them when someone else points them out.$b$ WHERE id = '472252e3-adff-4510-b5f0-debffb483412';

UPDATE launchpad_slides SET slide_number = 10, title = 'Knowledge Check', body = $b$1) A buyer wants to include the dining room light fixture, and the seller wants to exclude it — where does this get resolved, and what's the risk of leaving it ambiguous?
2) What form is used to remove a satisfied condition, and who typically signs it?
3) A deal falls through after firm — what document formally ends it and addresses the deposit? (Mutual Release)
4) Why does it matter whether a seller is a Canadian resident, paperwork-wise?
5) Name two of the most common new-agent paperwork mistakes covered in this module.
6) What tool should be used to draft a non-standard condition on a mock or real offer, rather than freehanding the wording? (The Clause Generator, in LUXEhub → Buyers Resources)$b$ WHERE id = '157bc4ad-5cb4-4cea-a981-ac6eb3e734a2';

-- ===== ASSOCIATE =====
UPDATE launchpad_slides SET title = 'Learning Objectives', body = $b$By the end of this module, the agent can:
- Locate and correctly use our LUXE Schedule A, the Clause Generator, and Transaction Checklists
- Know exactly where documents get signed and filed here
- Recall the specific paperwork mistakes that come up even with experienced agents adjusting to a new brokerage's systems$b$ WHERE id = 'd502bebc-1f68-4449-ad89-2e63f1860aff';

UPDATE launchpad_slides SET title = 'Quick-Reference: Where Things Live', body = $b$- Every document (APS, Amendment, Waiver/Notice of Fulfillment, Mutual Release) gets signed through AuthentiSign. Once executed, everything auto-files into LUXEhub.
- Clause Generator — for drafting non-standard conditions consistently, rather than freehanding wording.
- Transaction Checklists — the eXp Transaction Guide checklist tool, in LUXEhub → Buyers/Listings Resources.
- OREA Forms Explained — point clients here when they ask what a clause means.
- LUXE Schedule A — our custom schedule attached to both Buyer and Seller Representation Agreements; confirm you're using our current version.$b$ WHERE id = '6fa95ff0-7313-404b-8680-2555030cdb6a';

UPDATE launchpad_slides SET title = 'What''s Actually New Here (Forms & Tools)', body = $b$- Our Schedule A is custom — even if you know standard OREA forms cold, our schedule adds team-specific terms; don't skip reviewing it just because the base APS/Representation Agreement looks familiar.
- The Clause Generator is the expected tool for any non-standard condition — freehand wording that worked at a prior brokerage may not match how we want conditions documented here.$b$ WHERE id = '5d614346-f74f-4860-b789-2b65c4899a7f';

INSERT INTO launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('bb92a384-3460-43c2-bb0d-dd0e7fbb02ff', 4, 'content', 'What''s Actually New Here (Compliance & Process)', $b$- FINTRAC records now cover unrepresented parties too as of October 2025 — make sure this is reflected in how you're completing paperwork, not just how you used to do it.
- No escrow, no US-style "clear to close" — Ontario transactions run through deposits held in the brokerage trust account and closings via lawyers, not an escrow company.$b$);

UPDATE launchpad_slides SET slide_number = 5, title = 'Practice Assignment', body = $b$1) Review our current LUXE Schedule A with your mentor and note anything that differs from a standard/prior-brokerage version.
2) Use the Clause Generator to draft one non-standard condition and have your mentor review the output.
3) Confirm with your mentor exactly where FINTRAC records get completed for both represented and unrepresented parties.
4) Complete one mock offer using our current Schedule A and the Clause Generator, and have your mentor/team review it — a good calibration exercise even with experience, since it's our specific paperwork and tools, not your prior brokerage's.$b$ WHERE id = '9f4b79a7-2e2d-49c6-ab30-d6e008e9207e';

UPDATE launchpad_slides SET slide_number = 6, title = 'Knowledge Check', body = $b$1) Where do documents get signed and filed here?
2) What tool should be used to draft a non-standard condition, rather than freehanding the wording? (The Clause Generator)
3) True or false: Ontario transactions here use an escrow company for closing. (False)$b$ WHERE id = 'dff954ce-0e8a-4c7b-afbf-ad42f2fa6325';
