
-- Park PA/KC rows
UPDATE public.launchpad_slides SET slide_number = 106 WHERE module_id IN ('2164bb80-0599-4822-a678-dc3b75e7b67c','50d467ed-32eb-4f79-a22d-0dc732ee26c4') AND slide_type='practice_assignment';
UPDATE public.launchpad_slides SET slide_number = 107 WHERE module_id IN ('2164bb80-0599-4822-a678-dc3b75e7b67c','50d467ed-32eb-4f79-a22d-0dc732ee26c4') AND slide_type='knowledge_check';

-- ============ JUNIOR ============
UPDATE public.launchpad_slides SET title='Learning Objectives', body=$b$By the end of this module, the agent can:
- Run the full seller consultation in our standard structure, using our actual Seller Guide.
- Explain our 7-step strategic approach, pricing philosophy, and marketing system the way we present them to sellers.
- Know which documents get signed with a seller, and where to find them and their supporting tools in LUXEhub.
- Connect the CMA Boss tool to the AI pricing package covered in Module 1 — it's the same capability, seller-facing.
- Walk a seller through the Ontario offer-to-closing timeline accurately.$b$, updated_at=now()
WHERE module_id='2164bb80-0599-4822-a678-dc3b75e7b67c' AND slide_number=1;

UPDATE public.launchpad_slides SET title='Before the Consultation: LUXEhub Listings Resources', body=$b$- Seller Guide Flipbook — interactive online version of the guide, good to send ahead of the appointment.
- Selling Your Home (PDF) — downloadable version of the same guide.
- Schedule A – Listing (PDF) / Schedule A – Seller (DOCX) — our custom schedule to the standard listing agreement.
- Deposit Instructions — submitted via the eXp Realty form for Ontario deposit handling.
- Clause Generator / Transaction Checklists — the same eXp Transaction Guide tools used on the buyer side, applied to listing files here.
- Schedule B1 (PDF) — additional listing schedule; confirm with your mentor exactly when this applies.
- CMA Boss — our tool for generating comparative market analyses. This is the same AI market analysis & pricing package from Module 1: CMA Boss is the tool, the pricing package (three ranges — aggressive/median/optimistic, plus listing prep recommendations) is its output.
- OREA Forms Explained — official explanations of standard forms, useful when a seller asks what a clause means.$b$, updated_at=now()
WHERE module_id='2164bb80-0599-4822-a678-dc3b75e7b67c' AND slide_number=2;

UPDATE public.launchpad_slides SET title='Our Strategic Approach — Seven Steps', body=$b$Frame the whole relationship up front.

1) Consult & Plan — understand goals, build a personalized strategy.
2) Prepare & Position — refine every detail: decluttering, elevating, staging.
3) Price Strategically — use market insight and data (this is where CMA Boss output gets presented) to attract the right buyers and maximize value.
4) Market With Purpose — launch a tailored marketing plan that showcases the home and reaches buyers everywhere.
5) Showcase & Connect — create real buyer connections through targeted exposure and expert negotiation.
6) Negotiate & Protect — advocate for the seller's best interests on every term.
7) Close With Confidence — manage details, timelines, and communication through to a smooth closing.$b$, updated_at=now()
WHERE module_id='2164bb80-0599-4822-a678-dc3b75e7b67c' AND slide_number=3;

INSERT INTO public.launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('2164bb80-0599-4822-a678-dc3b75e7b67c',4,'content','Mission, Values & First Impressions',$b$Mission: to be the #1 real estate company of choice in our region, built on authentic impact for staff, clients, and community.

Core values: Grit, Grace, Growth, Gratitude.

This isn't just culture messaging — sellers hear this framing as part of why our process is different, so it belongs early in the consultation.

First Impressions: buyers don't just purchase homes — they buy the way a home makes them feel, and the future they imagine living there. This is the philosophy behind every staging and presentation decision that follows.$b$),
('2164bb80-0599-4822-a678-dc3b75e7b67c',5,'content','Factors That Influence Value & Establishing Price',$b$Three things determine outcome, and all three are within our control to manage well:
- Market conditions — supply, demand, interest rates, buyer activity.
- Property presentation — staging, photography, and marketing materials shape buyer perception of value.
- Pricing strategy — one of the most important decisions in the whole process.

Establishing Price — run through CMA Boss output with the seller:
- Comparables include sales from all agents/companies, not just our own.
- We check public records (MPAC) in addition to MLS data.
- Sold listings are the best measure of true value.
- Active listings show current supply and competition.
- Withdrawn/expired listings are usually a sign of a listing that was overpriced.$b$),
('2164bb80-0599-4822-a678-dc3b75e7b67c',6,'content','The Cost of Overpricing',$b$Have this conversation honestly, before a seller gets attached to an inflated number.

- A significant share of sellers end up reducing their price to get the home sold — starting high and reducing later typically doesn't work the way sellers hope.
- An overpriced home sits too long, which makes buyers wonder if something's wrong with it, or whether the seller is difficult to deal with.
- Key warning sign: multiple early showings with no offers — competing local agents will sometimes use an overpriced listing as a comparison tool to help sell other homes.

Key takeaway for the seller: homes priced at market value attract the most buyers, sell faster, and net the highest return — pricing high does not equal netting more.$b$),
('2164bb80-0599-4822-a678-dc3b75e7b67c',7,'content','Getting Market Ready — "Shift Your Mindset from Home to House"',$b$Staging & Photography: strategic presentation for maximum exposure. In-depth MLS listing description, effective open house strategy, print + digital marketing, local agent network exposure.

OAKHAUS (our in-house contractor): pre-listing repairs, updates, refreshes, and remodels — same-day free estimates, licensed tradespeople, on-trend materials, a dedicated local project manager, curb appeal upgrades (for qualifying sellers), and furniture moving support. Sellers can defer payment for this work to closing rather than paying up front — confirm current terms with your mentor.

Complimentary cleaning: seller chooses a pre-list clean or a post-move-out clean. This is dependent on 3% of GCI as the listing agent (not total deal GCI) — confirm the current figure with your mentor before presenting it.$b$),
('2164bb80-0599-4822-a678-dc3b75e7b67c',8,'content','Marketing: Standing Out',$b$97% of buyers begin their search online — the first photo a buyer sees determines whether they click or scroll past. Professional photography and 3D tours are treated as essential, not optional.

iGuide: immersive 3D tour + interactive floor plan system — buyers can walk every room in 360°, view accurate measured floor plans, get verified square footage, and revisit as many times as they want before booking a showing.

Print marketing: for-sale sign installation, high-quality presentation booklets, door-to-door canvassing/flyer distribution to at least 100 neighbours.

Digital marketing: website optimization, SEO, social media marketing (@luxe.realtygroup on Instagram), content marketing, email marketing, PPC advertising, video marketing, analytics/CRM tracking.

TRREB membership matters: Ontario has 30+ local real estate boards, each with its own MLS reach. TRREB has 73,000+ members — a non-member's listing is confined to their local board only. Luxe Realty Group is a TRREB member, so listings reach a much broader buyer pool.$b$),
('2164bb80-0599-4822-a678-dc3b75e7b67c',9,'content','Offers & Negotiations',$b$Set expectations clearly:
- All offers will be presented, no exceptions.
- Understand terms and conditions before reacting to a number.
- Negotiations happen on the seller's behalf, not without them.

What are conditions? Requirements that must be met before a contract becomes binding. Common ones: financing, appraisal, home inspection, sale of the buyer's current home, status certificate (condo), insurance, lawyer review.$b$),
('2164bb80-0599-4822-a678-dc3b75e7b67c',10,'content','The Offer Process in Ontario — Full Timeline',$b$Use this exact sequence with sellers.

1) Offer Accepted — Agreement of Purchase and Sale signed by both parties; for condos, the review/rescission period begins immediately.
2) Deposit Delivered — deposit cheque (typically certified funds) delivered to the brokerage, usually within 24 hours.
3) Home Inspection — buyer arranges an inspector; typically completed within 3–5 business days.
4) Documents to Lender — buyer submits documents to secure mortgage commitment.
5) Conditions Removed — waivers/notices of fulfillment signed by both sides; the deal becomes firm and legally binding.
6) Lawyers Prepare — title searches, mortgage instructions, and closing documents finalized.
7) Closing Day — funds transfer, title registers through Teranet, keys released, ownership transfers.

Typical conditional period: 3–10 business days. Typical closing period: 30–90 days from firm agreement.

Throughout, the agent stays in constant communication with lawyers, lenders, and the buyer's agent.$b$),
('2164bb80-0599-4822-a678-dc3b75e7b67c',11,'content','If Home Inspection Issues Come Up',$b$Walk sellers through their real options in advance.

- Buyer requests repairs — seller can agree, negotiate, or decline.
- Price reduction or closing-cost credit instead of repairs.
- Negotiation and compromise — selective repairs or partial credits.
- Seller can decline requests outright — buyer then decides whether to proceed or walk away.
- Contract cancellation — buyer may be able to back out without penalty depending on condition wording.
- "As-is" sale (where applicable) — seller isn't obligated to make repairs but may still choose to negotiate.$b$),
('2164bb80-0599-4822-a678-dc3b75e7b67c',12,'content','Closing Day Checklist & What Sellers Will Sign',$b$Seller's checklist:
- Provide a void cheque to LUXE operations staff.
- Confirm closing date and time with your lawyer.
- Arrange mortgage discharge/payout with your lender.
- Complete all agreed-upon repairs before closing.
- Vacate — property must be broom-clean.
- Remove all personal belongings and debris.
- Leave all keys, garage openers, and mailbox keys.
- Leave alarm codes and instructions for the buyer.
- Leave all chattels and fixtures included in the sale.
- Cancel or transfer home insurance effective closing day.
- Notify utility providers.
- Forward mail through Canada Post.

What sellers will sign: Exclusive Listing Agreement, MLS Listing Agreement, Seller's Direction (if applicable), Agreement of Purchase and Sale, Confirmation of Co-operation / Amendment / Waiver — walk through each document's purpose before signing.$b$);

UPDATE public.launchpad_slides SET slide_number=13, title='Practice Assignment', body=$b$1) Run the full seller consultation on your mentor using the actual Seller Guide, including presenting a sample CMA Boss output.
2) Practice the overpricing conversation — this needs to feel confident, not confrontational.
3) Walk through Schedule A (Listing) and the Deposit Instructions form with your mentor as if onboarding a real seller.
4) Role-play a home inspection issue scenario and practice presenting the seller's real options calmly.$b$, updated_at=now()
WHERE module_id='2164bb80-0599-4822-a678-dc3b75e7b67c' AND slide_number=106;

UPDATE public.launchpad_slides SET slide_number=14, title='Knowledge Check', body=$b$1) What are the seven steps in our strategic approach, in order?
2) A seller wants to list 15% above CMA Boss's recommended price "to leave room to negotiate" — what should the agent explain?
3) What is CMA Boss, and how does it relate to Module 1?
4) Why does TRREB membership matter when explaining marketing reach to a seller?
5) Name three ways a home inspection issue can be resolved without the deal falling apart.
6) What must a seller do to their property, condition-wise, on closing day?
7) What's the actual threshold for the complimentary cleaning offer? (3% of GCI as the listing agent, not total deal GCI)$b$, updated_at=now()
WHERE module_id='2164bb80-0599-4822-a678-dc3b75e7b67c' AND slide_number=107;

-- ============ ASSOCIATE ============
UPDATE public.launchpad_slides SET title='Learning Objectives', body=$b$- Run our specific 7-step strategic approach and know where each proprietary piece (OAKHAUS, iGuide, CMA Boss) fits.
- Deliver our mission/values framing and overpricing conversation the way we present it, not a generic version.
- Locate and use Schedule A (Listing), Deposit Instructions, Clause Generator, Transaction Checklists, Schedule B1, CMA Boss, and OREA Forms Explained in LUXEhub.
- Know that CMA Boss is the exact same AI pricing tool covered in Module 1, just seller-facing.$b$, updated_at=now()
WHERE module_id='50d467ed-32eb-4f79-a22d-0dc732ee26c4' AND slide_number=1;

UPDATE public.launchpad_slides SET title='Quick-Reference: Our Consultation Structure', body=$b$1) Our Strategic Approach (7 steps: Consult & Plan → Prepare & Position → Price Strategically → Market With Purpose → Showcase & Connect → Negotiate & Protect → Close With Confidence).
2) Mission/Vision/Values (Grit, Grace, Growth, Gratitude).
3) Factors That Influence Value.
4) Establishing Price — CMA Boss walkthrough.
5) The Overpricing Conversation.
6) Getting Market Ready (staging, photography, OAKHAUS, cleaning).
7) Marketing System (iGuide, print, digital, TRREB membership).
8) Offers & Negotiations.
9) The Offer Process in Ontario (7-step timeline).
10) Inspection Issue Handling.
11) Closing Day Checklist.
12) What Sellers Will Sign.$b$, updated_at=now()
WHERE module_id='50d467ed-32eb-4f79-a22d-0dc732ee26c4' AND slide_number=2;

UPDATE public.launchpad_slides SET title='What''s Actually New (Proprietary Tools)', body=$b$- CMA Boss = Module 1's AI pricing package — same tool, same three pricing tiers, same listing prep recommendations. Just make sure you're calling it by name and presenting it as our seller-facing tool.
- OAKHAUS (our in-house contractor) and the complimentary cleaning offer (pre-list or post-move-out) are proprietary services most brokerages don't have — a real differentiator, worth leading with.
- Deferred-payment terms for OAKHAUS work: confirm current specifics with your mentor.
- The cleaning offer requires 3% of GCI as the listing agent (not total deal GCI) — confirm the current figure with your mentor since thresholds can change.
- TRREB membership messaging: Ontario has 30+ local boards; TRREB has 73,000+ members — our specific selling point for marketing reach.$b$, updated_at=now()
WHERE module_id='50d467ed-32eb-4f79-a22d-0dc732ee26c4' AND slide_number=3;

INSERT INTO public.launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('50d467ed-32eb-4f79-a22d-0dc732ee26c4',4,'content','What''s Actually New (Paperwork & Overpricing)',$b$Our required paperwork: Schedule A (Listing/Seller), Deposit Instructions (via the eXp Realty form), Clause Generator, Transaction Checklists, and Schedule B1 — confirm you're pulling from LUXEhub → Listings Resources, not a prior brokerage's versions.

The overpricing conversation is scripted around our specific stats and framing — worth reviewing even with experience elsewhere, since the framing here is specific.$b$);

UPDATE public.launchpad_slides SET slide_number=5, title='Practice Assignment', body=$b$1) Walk through our 7-step strategic approach once with your mentor, noting anywhere your prior process differed.
2) Present a sample CMA Boss output to your mentor as if to a seller, using our specific pricing-tier language.
3) Review Schedule A (Listing), Deposit Instructions, and the Clause Generator in LUXEhub together — confirm current versions.$b$, updated_at=now()
WHERE module_id='50d467ed-32eb-4f79-a22d-0dc732ee26c4' AND slide_number=106;

UPDATE public.launchpad_slides SET slide_number=6, title='Knowledge Check', body=$b$1) What is CMA Boss, and how does it relate to Module 1?
2) Name two of our proprietary seller services that most brokerages don't offer.
3) What's our specific talking point for why TRREB membership matters to a seller?
4) Where do you find our current Schedule A (Listing) and Deposit Instructions forms?$b$, updated_at=now()
WHERE module_id='50d467ed-32eb-4f79-a22d-0dc732ee26c4' AND slide_number=107;
