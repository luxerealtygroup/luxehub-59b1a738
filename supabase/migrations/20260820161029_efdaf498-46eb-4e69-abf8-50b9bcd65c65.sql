
-- Park PA/KC rows for both Module 4 modules
UPDATE public.launchpad_slides SET slide_number = 106 WHERE module_id IN ('a82ca353-adbf-4d47-8d22-533188875a69','ae86f9ff-75de-47e8-bd2d-5d544d0d330b') AND slide_type = 'practice_assignment';
UPDATE public.launchpad_slides SET slide_number = 107 WHERE module_id IN ('a82ca353-adbf-4d47-8d22-533188875a69','ae86f9ff-75de-47e8-bd2d-5d544d0d330b') AND slide_type = 'knowledge_check';

-- ===== JUNIOR: update existing content rows 1-3 =====
UPDATE public.launchpad_slides SET title = 'Learning Objectives', body = $b$By the end of this module, the agent can:

- Run the full buyer consultation in our standard order, using our actual presentation.
- Explain mortgage pre-approval, market conditions, and contract/condition terms the way we present them to buyers.
- Know which document must be signed before representing a buyer, and where to find it and its supporting resources in LUXEhub.
- Know where the AI market analysis & pricing tool and AI lead context show up in this conversation.$b$
WHERE module_id = 'a82ca353-adbf-4d47-8d22-533188875a69' AND slide_number = 1;

UPDATE public.launchpad_slides SET title = 'Before the Consultation: The Buyer Representation Agreement', body = $b$Before an agent can act on a buyer's behalf, TRESA requires a signed Buyer Representation Agreement (BRA).

In LUXEhub -> Buyers Resources:
- Ontario Buyer Representation Agreement (standard form)
- LUXE Schedule A (Buyer) — our custom schedule, editable DOCX
- Clause Generator — the eXp Transaction Guide tool for building non-standard clauses
- Transaction Checklists — the eXp Transaction Guide checklist for buyer files
- OREA Forms Explained — official explanations of standard forms and clauses

Remember from Module 2: the RECO Information Guide must also be given and explained before providing any services — that happens alongside or before this agreement, not after.$b$
WHERE module_id = 'a82ca353-adbf-4d47-8d22-533188875a69' AND slide_number = 2;

UPDATE public.launchpad_slides SET title = 'Our Mission & Buyer Analysis', body = $b$Open by framing the relationship: our mission is to achieve all the buyer's goals and exceed their expectations. This sets tone before any process talk starts.

Then, Buyer Analysis — a real conversation about what the buyer actually needs, wants, and can afford — before anything else happens.

This is where the consultation succeeds or fails; don't rush past it into showings.$b$
WHERE module_id = 'a82ca353-adbf-4d47-8d22-533188875a69' AND slide_number = 3;

-- ===== JUNIOR: insert content slides 4-11 =====
INSERT INTO public.launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('a82ca353-adbf-4d47-8d22-533188875a69', 4, 'content', 'Market Conditions', $b$Educate the buyer on which market they're in, since it changes their strategy.

Buyer's Market:
- More inventory, more control, more room to negotiate
- Lower pricing, less chance of multiple offers
- More conditions possible in offers
- Note: some sellers in a shifting market haven't mentally caught up yet and may still dig in depending on motivation

Seller's Market:
- Less inventory, less control, less negotiating room
- Higher pricing, multiple offers
- Real need for strong and/or firm offers

Balanced Market:
- Balanced inventory
- Homes typically selling at 98-100% of asking
- Less multiple-offer activity
- Not a strong need for firm offers (circumstantial)$b$),
('a82ca353-adbf-4d47-8d22-533188875a69', 5, 'content', 'Mortgage Pre-Approval — Why It''s Important', $b$Three reasons to lead with this:

- Knowing the real price range means only showing homes that fit budget.
- Buying with confidence — a pre-approval lets a buyer move quickly and submit the strongest possible offer.
- Bank vs. mortgage broker distinction — bank representatives work for the bank, mortgage brokers work for the buyer. Buyers should understand which one they're talking to.$b$),
('a82ca353-adbf-4d47-8d22-533188875a69', 6, 'content', 'Finding a Realtor — Our Value to You', $b$Present the team structure behind the buyer, not just yourself:

- Buyer Specialist (the buyer's direct point of contact), supported by:
- Director of Client Services
- Marketing Coordinator
- Inside Sales Team
- Listing Specialist
- Director of Operations

Prospecting activity that finds buyers homes before they're widely known:
- Door knocking
- Cold calling
- Email blast
- Direct mail
- Our off-market listing database$b$),
('a82ca353-adbf-4d47-8d22-533188875a69', 7, 'content', 'Finding Your Home — The Research Phase', $b$- Specialized Search — buyer gets set up on the same search system agents use, new listings delivered as soon as they hit market.
- Listing Portals — Zillow, Trulia, Realtor.com, and others.
- Search Engines — Google, Bing, Yahoo.
- Social Media — Facebook, Instagram, Twitter/X.
- Classified Services — Craigslist, Oodle, Backpage, a channel most agents overlook or under-use.

The AI market analysis tool's comparable data (built for sellers) is equally useful context when a buyer asks "is this priced fairly" during showings.$b$),
('a82ca353-adbf-4d47-8d22-533188875a69', 8, 'content', 'Selecting and Viewing Homes', $b$Once needs and budget are clear, set the buyer up on a specialized search portal reflecting exactly what filters actually exist — and be upfront about what doesn't.

For example, "renovated" isn't a filter the system supports, so don't imply it is — showing both renovated and unrenovated homes without explaining why makes the buyer think you're not listening, when really it's a tool limitation.

After setup, check in at a cadence the buyer chooses — ask directly, don't default to a fixed schedule; once a week is a reasonable starting suggestion.

When the buyer flags properties they like, text or call to coordinate a showing time — this is where the relationship shifts from passive search-watching to active, personal service.$b$),
('a82ca353-adbf-4d47-8d22-533188875a69', 9, 'content', 'The Paperwork — Contracts & Conditions', $b$"Understand what you're signing."

Contract terms:
- Price
- Deposit (will be cashed — certified funds needed within 24 hours)
- Irrevocability
- Closing date
- Inclusions & exclusions
- HST
- Other standard clauses

Conditions:
- Financing
- Appraisal
- Inspection
- Insurance
- Status certificate (for a condo)
- Pool conditions
- And dozens of others handled case by case$b$),
('a82ca353-adbf-4d47-8d22-533188875a69', 10, 'content', 'Communication, Transparency & Moving Day', $b$Once there's a firm deal, the buyer is walked through every step from that moment to keys-in-hand — set this expectation explicitly so buyers know they won't go dark between offer acceptance and closing.

Other costs to flag up front:
- Deposit
- Home inspection
- Lawyer fees
- Land transfer tax

Moving Day is the close of the relationship and often a shareable moment for the buyer (the deck literally frames it as a "We bought our dream home!!" social-share moment) — but ask for the review or referral on the day the deal goes pending, not on moving day itself, so it doesn't get lost in the busy, distracted stretch of the actual move.$b$),
('a82ca353-adbf-4d47-8d22-533188875a69', 11, 'content', 'Next Steps — Let''s Get Started', $b$Close the consultation by moving straight into next actions — this is where the Buyer Representation Agreement gets signed if it hasn't been already.$b$);

-- ===== JUNIOR: PA / KC =====
UPDATE public.launchpad_slides SET slide_number = 12, title = 'Practice Assignment', body = $b$1) Run the full consultation flow on your mentor as if they were a buyer, using the actual Luxe Buyer Presentation.

2) Practice explaining the difference between the three market conditions using a current, real example from our market.

3) Walk through a sample Buyer Representation Agreement and LUXE Schedule A with your mentor, and use the Clause Generator for one non-standard clause.

4) Pull up the Transaction Checklist for a buyer file and confirm you understand each step before firm/closing.$b$
WHERE module_id = 'a82ca353-adbf-4d47-8d22-533188875a69' AND slide_number = 106;

UPDATE public.launchpad_slides SET slide_number = 13, title = 'Knowledge Check', body = $b$1) What's the very first step in our buyer consultation, before market conditions or pre-approval come up? (Buyer Analysis)

2) A buyer says a bank pre-approved them — what should the agent ask to clarify, and why? (Bank rep vs. mortgage broker — whose interests are represented)

3) Name three costs beyond purchase price to flag to a buyer up front.

4) What document must be signed before an agent can represent a buyer, and where in LUXEhub can they find it plus supporting materials? (BRA + LUXE Schedule A, in Buyers Resources)

5) In a seller's market, why might a buyer need a "firm" offer, and what's the trade-off?

6) A buyer wants only "renovated" homes but the portal doesn't support that filter — what should the agent do?

7) How often should an agent check in with a buyer once set up on the search portal?

8) When should an agent ask for a review or referral — moving day, or when the deal goes pending? (Pending)$b$
WHERE module_id = 'a82ca353-adbf-4d47-8d22-533188875a69' AND slide_number = 107;

-- ===== ASSOCIATE =====
UPDATE public.launchpad_slides SET title = 'Learning Objectives', body = $b$- Run our specific consultation structure and sequence, even if their prior process differed.
- Deliver our team-value narrative accurately, since it's brand-specific.
- Locate and use the Buyer Representation Agreement, LUXE Schedule A, Clause Generator, Transaction Checklists, and OREA Forms Explained in LUXEhub.
- Know where AI shows up in this conversation and where our team's prospecting channels differ from a typical brokerage.$b$
WHERE module_id = 'ae86f9ff-75de-47e8-bd2d-5d544d0d330b' AND slide_number = 1;

UPDATE public.launchpad_slides SET title = 'Quick-Reference: Our Consultation Order', body = $b$1) Our Mission (goals + exceed expectations framing)
2) Buyer Analysis
3) Market Conditions
4) Mortgage Pre-Approval (bank vs. mortgage broker distinction)
5) Our Value to You (team structure + prospecting channels)
6) Finding Your Home — Research Phase (five channels)
7) Selecting & Viewing Homes
8) The Paperwork
9) Communication/Transparency (contract to closing + cost list)
10) Moving Day
11) Next Steps — this is where the BRA gets signed$b$
WHERE module_id = 'ae86f9ff-75de-47e8-bd2d-5d544d0d330b' AND slide_number = 2;

UPDATE public.launchpad_slides SET title = 'What''s Actually New Here (Team & Paperwork)', body = $b$Our team structure pitch: Buyer Specialist supported by Director of Client Services, Marketing Coordinator, Inside Sales Team, Listing Specialist, and Director of Operations — plus door knocking, cold calling, email blast, direct mail, and our off-market listing database.

Our required paperwork before representing a buyer: Buyer Representation Agreement + LUXE Schedule A (in LUXEhub -> Buyers Resources), alongside the Clause Generator, Transaction Checklists, and OREA Forms Explained.

The RECO Information Guide (Module 2) still needs to be given and explained before or alongside the BRA — don't assume a prior brokerage's process covered this the same way we require it.$b$
WHERE module_id = 'ae86f9ff-75de-47e8-bd2d-5d544d0d330b' AND slide_number = 3;

INSERT INTO public.launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('ae86f9ff-75de-47e8-bd2d-5d544d0d330b', 4, 'content', 'What''s Actually New Here (AI & Search Portal)', $b$The same comparable/market data behind Module 1's AI pricing package is useful context when a buyer asks "is this priced fairly" during a showing.

Our search portal setup: be upfront with buyers about filter limitations (e.g., "renovated" isn't a real filter) before they start browsing, and let them set their own check-in cadence rather than defaulting to a fixed schedule — small thing, real impact on trust.$b$);

UPDATE public.launchpad_slides SET slide_number = 5, title = 'Practice Assignment', body = $b$1) Walk through our consultation order once with your mentor, flagging anywhere your prior process differed from ours.

2) Review the Buyer Representation Agreement, LUXE Schedule A, and Clause Generator in LUXEhub together — confirm you're pulling current versions.

3) Practice delivering our team-value pitch (the hub-and-spoke structure) out loud once.$b$
WHERE module_id = 'ae86f9ff-75de-47e8-bd2d-5d544d0d330b' AND slide_number = 106;

UPDATE public.launchpad_slides SET slide_number = 6, title = 'Knowledge Check', body = $b$1) What document must be signed before representing a buyer here, and where do you find it plus supporting materials?

2) Name three roles in our team structure that support a Buyer Specialist.

3) What must also happen before/alongside the Buyer Representation Agreement, per Module 2? (RECO Information Guide)$b$
WHERE module_id = 'ae86f9ff-75de-47e8-bd2d-5d544d0d330b' AND slide_number = 107;
